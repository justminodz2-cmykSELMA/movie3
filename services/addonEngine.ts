/**
 * ============================================================
 *  CineScript — the official Addon language of this platform
 * ============================================================
 *  A small, safe, fully-sandboxed declarative language that
 *  lets any user build Addons:
 *    - type theme     → re-skin the whole app (design tokens)
 *    - type page      → a brand new tab + page with rows
 *    - type provider  → a new content source (any JSON API)
 *
 *  The language is parsed & interpreted here. There is NO eval,
 *  NO arbitrary JS execution — user code can never break the app.
 * ============================================================
 */

import { fetchFromTMDB } from './apiService';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type AddonType = 'theme' | 'page' | 'provider';

export interface AddonRowSource {
  kind: 'tmdb' | 'url' | 'items' | 'provider';
  /** tmdb endpoint e.g. /discover/movie */
  endpoint?: string;
  /** tmdb params */
  params?: Record<string, string>;
  /** remote JSON url */
  url?: string;
  /** path into the JSON to reach the array e.g. "works" or "data" */
  path?: string;
  /** field mapping / templates: title, image, subtitle, link */
  map?: Record<string, string>;
  /** static items */
  items?: AddonItem[];
  /** name of an installed provider addon */
  providerName?: string;
  /** max items */
  limit?: number;
}

export interface AddonItem {
  title: string;
  image?: string;
  subtitle?: string;
  description?: string;
  link?: string;
}

export interface AddonRowDef {
  title: string;
  shape: 'card' | 'poster' | 'circle';
  source: AddonRowSource;
}

export interface AddonPageDef {
  title: string;
  route: string;
  icon: string;
  heroTitle?: string;
  heroSubtitle?: string;
  heroImage?: string;
  rows: AddonRowDef[];
}

export interface AddonThemeDef {
  /** css variable name (without --) → color value */
  tokens: Record<string, string>;
}

export interface AddonProviderDef {
  name: string;
  url: string;
  path?: string;
  map: Record<string, string>;
  limit?: number;
}

export interface AddonManifest {
  name: string;
  version: string;
  author: string;
  description: string;
  icon: string;      // font-awesome class e.g. "fa-book"
  color: string;     // accent color hex
  type: AddonType;
  page?: AddonPageDef;
  theme?: AddonThemeDef;
  provider?: AddonProviderDef;
}

export interface InstalledAddon {
  id: string;
  code: string;
  manifest: AddonManifest;
  enabled: boolean;
  builtIn?: boolean;
  installedAt: number;
}

export interface ParseError {
  line: number;
  message: string;
}

export interface ParseResult {
  ok: boolean;
  manifest?: AddonManifest;
  errors: ParseError[];
}

/* ------------------------------------------------------------------ */
/* Tokenizer / line parser                                             */
/* ------------------------------------------------------------------ */

interface Line {
  n: number;       // 1-based line number
  raw: string;
  tokens: string[];
}

/** Split a line into tokens, honoring "quoted strings". */
const tokenize = (line: string): string[] => {
  const tokens: string[] = [];
  let cur = '';
  let inStr = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inStr) {
        tokens.push(cur);
        cur = '';
        inStr = false;
      } else {
        if (cur.trim()) tokens.push(cur.trim());
        cur = '';
        inStr = true;
      }
      continue;
    }
    if (!inStr && ch === '#') break; // comment
    if (!inStr && /\s/.test(ch)) {
      if (cur.trim()) tokens.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) tokens.push(cur.trim());
  return tokens;
};

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const ROUTE_RE = /^[a-z0-9-]{2,40}$/;
const ALLOWED_THEME_TOKENS = [
  'background', 'surface', 'primary', 'secondary',
  'text-light', 'text-dark', 'border', 'danger',
];
const ALLOWED_SHAPES = ['card', 'poster', 'circle'];
const RESERVED_ROUTES = [
  'home', 'movies', 'tv', 'iptv', 'favorites', 'search', 'settings',
  'admin', 'login', 'player', 'addons', 'addon', 'you', 'shorts',
  'cinema', 'details', 'actor', 'ai-search', 'all', 'live', 'qr-approve',
  'iframe-player',
];

const isSafeUrl = (url: string): boolean => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};

/* ------------------------------------------------------------------ */
/* Parser                                                              */
/* ------------------------------------------------------------------ */

export const parseCineScript = (code: string): ParseResult => {
  const errors: ParseError[] = [];
  const err = (line: number, message: string) => errors.push({ line, message });

  const vars: Record<string, string> = {};
  const substitute = (value: string): string =>
    value.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (m, name) =>
      vars[name] !== undefined ? vars[name] : m,
    );

  const rawLines = code.split('\n');
  const lines: Line[] = [];
  rawLines.forEach((raw, i) => {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const tokens = tokenize(trimmed).map(substitute);
    if (tokens.length === 0) return;
    // variable assignment: set $name = "value"
    if (tokens[0] === 'set') {
      if (tokens.length >= 4 && tokens[1].startsWith('$') && tokens[2] === '=') {
        vars[tokens[1].slice(1)] = tokens.slice(3).join(' ');
      } else {
        err(i + 1, 'Invalid set statement. Usage: set $name = "value"');
      }
      return;
    }
    lines.push({ n: i + 1, raw: trimmed, tokens });
  });

  if (lines.length === 0) {
    err(1, 'Empty script. Start with: addon "My Addon"');
    return { ok: false, errors };
  }

  const manifest: AddonManifest = {
    name: '',
    version: '1.0',
    author: 'Anonymous',
    description: '',
    icon: 'fa-puzzle-piece',
    color: '#e50914',
    type: 'page',
  };

  let i = 0;

  const expectBlockOpen = (line: Line): boolean =>
    line.tokens[line.tokens.length - 1] === '{' || line.raw.endsWith('{');

  /** Skip an already-opened block up to (and past) its matching `}` */
  const skipBlock = (): void => {
    let depth = 1;
    while (i < lines.length && depth > 0) {
      const l = lines[i];
      if (l.tokens[0] === '}') depth--;
      else if (expectBlockOpen(l)) depth++;
      i++;
    }
  };

  /**
   * Parse lines of an already-opened block until its matching `}`.
   * The onLine callback is responsible for consuming any nested
   * block it recognizes (e.g. `row "X" {` inside `page {`).
   */
  const parseBlockLines = (
    onLine: (l: Line) => void,
    blockName: string,
  ): void => {
    while (i < lines.length) {
      const l = lines[i];
      if (l.tokens[0] === '}') {
        i++;
        return;
      }
      i++; // consume the line before the callback (callback may consume more)
      onLine(l);
    }
    err(lines[lines.length - 1].n, `Missing closing "}" for ${blockName} block.`);
  };

  /* ---- header directives ---- */
  while (i < lines.length) {
    const l = lines[i];
    const [kw, ...rest] = l.tokens;

    if (kw === 'addon') {
      if (!rest[0]) err(l.n, 'addon requires a name: addon "My Addon"');
      else manifest.name = rest[0];
      i++;
      continue;
    }
    if (kw === 'version') { manifest.version = rest[0] || '1.0'; i++; continue; }
    if (kw === 'author') { manifest.author = rest[0] || 'Anonymous'; i++; continue; }
    if (kw === 'description') { manifest.description = rest.join(' '); i++; continue; }
    if (kw === 'icon') {
      const ic = rest[0] || '';
      if (!/^fa-[a-z0-9-]+$/.test(ic)) err(l.n, `Invalid icon "${ic}". Use a Font Awesome name like fa-book`);
      else manifest.icon = ic;
      i++; continue;
    }
    if (kw === 'color') {
      const c = rest[0] || '';
      if (!HEX_RE.test(c)) err(l.n, `Invalid color "${c}". Use hex like #00b4d8`);
      else manifest.color = c;
      i++; continue;
    }
    if (kw === 'type') {
      const t = rest[0] as AddonType;
      if (!['theme', 'page', 'provider'].includes(t)) {
        err(l.n, `Unknown type "${rest[0]}". Must be: theme, page, or provider`);
      } else manifest.type = t;
      i++; continue;
    }
    break; // start of blocks
  }

  if (!manifest.name) err(1, 'Missing addon name. First line must be: addon "My Addon"');

  /* ---- row parser (used inside page block) ---- */
  const parseRow = (rowLine: Line): AddonRowDef | null => {
    const title = rowLine.tokens[1];
    if (!title) { err(rowLine.n, 'row requires a title: row "My Row" {'); }
    const row: AddonRowDef = {
      title: title || 'Untitled Row',
      shape: 'card',
      source: { kind: 'items', items: [] },
    };
    const items: AddonItem[] = [];
    let currentItem: AddonItem | null = null;
    const map: Record<string, string> = {};
    const params: Record<string, string> = {};

    parseBlockLines((l) => {
      const [kw, ...rest] = l.tokens;
      const restNoBrace = rest.filter((t) => t !== '{');
      switch (kw) {
        case 'shape': {
          if (!ALLOWED_SHAPES.includes(restNoBrace[0])) err(l.n, `Invalid shape "${restNoBrace[0]}". Use: card, poster, or circle`);
          else row.shape = restNoBrace[0] as AddonRowDef['shape'];
          break;
        }
        case 'limit': {
          const n = parseInt(restNoBrace[0], 10);
          if (isNaN(n) || n < 1 || n > 40) err(l.n, 'limit must be a number between 1 and 40');
          else row.source.limit = n;
          break;
        }
        case 'source': {
          const srcKind = restNoBrace[0];
          if (srcKind === 'tmdb') {
            row.source.kind = 'tmdb';
            row.source.endpoint = restNoBrace[1]?.startsWith('/') ? restNoBrace[1] : `/${restNoBrace[1] || ''}`;
            restNoBrace.slice(2).forEach((p) => {
              const eq = p.indexOf('=');
              if (eq > 0) params[p.slice(0, eq)] = p.slice(eq + 1);
            });
            row.source.params = params;
            if (!restNoBrace[1]) err(l.n, 'source tmdb requires an endpoint, e.g. source tmdb discover/movie with_genres=14');
          } else if (srcKind === 'url') {
            if (!restNoBrace[1] || !isSafeUrl(restNoBrace[1])) err(l.n, 'source url requires a valid http(s) URL');
            row.source.kind = 'url';
            row.source.url = restNoBrace[1];
          } else if (srcKind === 'provider') {
            if (!restNoBrace[1]) err(l.n, 'source provider requires a provider name: source provider "My Provider"');
            row.source.kind = 'provider';
            row.source.providerName = restNoBrace[1];
          } else {
            err(l.n, `Unknown source "${srcKind}". Use: tmdb, url, or provider`);
          }
          break;
        }
        case 'path': row.source.path = restNoBrace[0]; break;
        case 'map': {
          if (restNoBrace.length < 2) err(l.n, 'map requires: map <field> "<json field or {template}>"');
          else map[restNoBrace[0]] = restNoBrace.slice(1).join(' ');
          break;
        }
        case 'item': {
          if (currentItem) items.push(currentItem);
          currentItem = { title: restNoBrace[0] || 'Untitled' };
          break;
        }
        case 'image': if (currentItem) currentItem.image = restNoBrace[0]; break;
        case 'subtitle': if (currentItem) currentItem.subtitle = restNoBrace.join(' '); break;
        case 'text': if (currentItem) currentItem.description = restNoBrace.join(' '); break;
        case 'link': {
          if (currentItem) {
            if (!isSafeUrl(restNoBrace[0])) err(l.n, 'link must be a valid http(s) URL');
            else currentItem.link = restNoBrace[0];
          }
          break;
        }
        default:
          err(l.n, `Unknown row property "${kw}"`);
          if (expectBlockOpen(l)) skipBlock();
      }
    }, `row "${row.title}"`);

    if (currentItem) items.push(currentItem);
    if (row.source.kind === 'items') row.source.items = items;
    if (row.source.kind === 'url' || row.source.kind === 'provider') row.source.map = map;
    if (row.source.kind === 'items' && items.length === 0) {
      err(rowLine.n, `row "${row.title}" has no source and no items. Add a source or item lines.`);
    }
    return row;
  };

  /* ---- blocks ---- */
  while (i < lines.length) {
    const l = lines[i];
    const kw = l.tokens[0];

    if (kw === 'theme') {
      if (!expectBlockOpen(l)) { err(l.n, 'theme block must open with "{"'); i++; continue; }
      i++;
      const tokens: Record<string, string> = {};
      parseBlockLines((tl) => {
        const [name, ...rest] = tl.tokens;
        const value = rest.filter((t) => t !== '{')[0];
        if (!ALLOWED_THEME_TOKENS.includes(name)) {
          err(tl.n, `Unknown theme token "${name}". Allowed: ${ALLOWED_THEME_TOKENS.join(', ')}`);
        } else if (!value || !HEX_RE.test(value)) {
          err(tl.n, `Theme token "${name}" needs a hex color like #0a2236`);
        } else {
          tokens[name] = value;
        }
      }, 'theme');
      manifest.theme = { tokens };
      continue;
    }

    if (kw === 'page') {
      if (!expectBlockOpen(l)) { err(l.n, 'page block must open with "{"'); i++; continue; }
      i++;
      const page: AddonPageDef = {
        title: manifest.name,
        route: '',
        icon: manifest.icon,
        rows: [],
      };
      parseBlockLines((pl) => {
        const [pkw, ...prest] = pl.tokens;
        const rest = prest.filter((t) => t !== '{');
        switch (pkw) {
          case 'title': page.title = rest.join(' ') || page.title; break;
          case 'route': {
            const r = (rest[0] || '').toLowerCase();
            if (!ROUTE_RE.test(r)) err(pl.n, `Invalid route "${rest[0]}". Use lowercase letters, numbers, dashes (2-40 chars)`);
            else if (RESERVED_ROUTES.includes(r)) err(pl.n, `Route "${r}" is reserved by the app. Pick another.`);
            else page.route = r;
            break;
          }
          case 'icon': {
            if (!/^fa-[a-z0-9-]+$/.test(rest[0] || '')) err(pl.n, 'Invalid page icon. Use fa-* names');
            else page.icon = rest[0];
            break;
          }
          case 'hero': {
            page.heroTitle = rest[0] || page.title;
            break;
          }
          case 'hero-subtitle': page.heroSubtitle = rest.join(' '); break;
          case 'hero-image': {
            if (rest[0] && !isSafeUrl(rest[0])) err(pl.n, 'hero-image must be a valid http(s) URL');
            else page.heroImage = rest[0];
            break;
          }
          case 'row': {
            const row = parseRow(pl);
            if (row) page.rows.push(row);
            break;
          }
          default:
            err(pl.n, `Unknown page property "${pkw}"`);
            if (expectBlockOpen(pl)) skipBlock();
        }
      }, 'page');
      if (!page.route) {
        page.route = manifest.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
        if (!ROUTE_RE.test(page.route)) err(l.n, 'Could not derive a route from the addon name. Add: route my-page');
      }
      manifest.page = page;
      continue;
    }

    if (kw === 'provider') {
      if (!expectBlockOpen(l)) { err(l.n, 'provider block must open with "{"'); i++; continue; }
      i++;
      const provider: AddonProviderDef = { name: manifest.name, url: '', map: {} };
      parseBlockLines((vl) => {
        const [vkw, ...vrest] = vl.tokens;
        const rest = vrest.filter((t) => t !== '{');
        switch (vkw) {
          case 'name': provider.name = rest[0] || provider.name; break;
          case 'url': {
            if (!isSafeUrl(rest[0] || '')) err(vl.n, 'provider url must be a valid http(s) URL');
            else provider.url = rest[0];
            break;
          }
          case 'path': provider.path = rest[0]; break;
          case 'limit': {
            const n = parseInt(rest[0], 10);
            if (isNaN(n) || n < 1 || n > 40) err(vl.n, 'limit must be 1-40');
            else provider.limit = n;
            break;
          }
          case 'map': {
            if (rest.length < 2) err(vl.n, 'map requires: map <field> "<json field or {template}>"');
            else provider.map[rest[0]] = rest.slice(1).join(' ');
            break;
          }
          default:
            err(vl.n, `Unknown provider property "${vkw}"`);
            if (expectBlockOpen(vl)) skipBlock();
        }
      }, 'provider');
      if (!provider.url) err(l.n, 'provider block requires a url');
      if (!provider.map.title) err(l.n, 'provider block requires at least: map title "field"');
      manifest.provider = provider;
      continue;
    }

    if (kw === '}') { i++; continue; }
    err(l.n, `Unknown directive "${kw}"`);
    i++;
  }

  /* ---- cross validation ---- */
  if (manifest.type === 'theme' && !manifest.theme) {
    err(1, 'type is "theme" but no theme { } block was found.');
  }
  if (manifest.type === 'page' && !manifest.page) {
    err(1, 'type is "page" but no page { } block was found.');
  }
  if (manifest.type === 'provider' && !manifest.provider) {
    err(1, 'type is "provider" but no provider { } block was found.');
  }
  if (manifest.type === 'page' && manifest.page && manifest.page.rows.length === 0) {
    err(1, 'The page needs at least one row { } block.');
  }

  return { ok: errors.length === 0, manifest: errors.length === 0 ? manifest : undefined, errors };
};

/* ------------------------------------------------------------------ */
/* Runtime — resolve row sources into items                            */
/* ------------------------------------------------------------------ */

const getPath = (obj: any, path?: string): any => {
  if (!path) return obj;
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
};

/** Resolve a map value: either a template "https://x/{id}.jpg" / "{a} - {b}" or a plain field path */
const resolveMapValue = (entry: any, mapValue: string): string => {
  if (mapValue.includes('{')) {
    return mapValue.replace(/\{([a-zA-Z0-9_.]+)\}/g, (_, p) => {
      const v = getPath(entry, p);
      return v == null ? '' : String(v);
    });
  }
  const v = getPath(entry, mapValue);
  return v == null ? '' : String(v);
};

const mapEntries = (
  entries: any[],
  map: Record<string, string>,
  limit: number,
): AddonItem[] =>
  entries.slice(0, limit).map((e) => ({
    title: map.title ? resolveMapValue(e, map.title) : 'Untitled',
    image: map.image ? resolveMapValue(e, map.image) : undefined,
    subtitle: map.subtitle ? resolveMapValue(e, map.subtitle) : undefined,
    description: map.description ? resolveMapValue(e, map.description) : undefined,
    link: map.link ? resolveMapValue(e, map.link) : undefined,
  })).filter((it) => it.title);

export interface ResolvedRow {
  def: AddonRowDef;
  /** tmdb rows resolve to raw TMDB movie objects */
  tmdbItems?: any[];
  items?: AddonItem[];
  error?: string;
}

export const resolveRow = async (
  row: AddonRowDef,
  providers: AddonProviderDef[],
): Promise<ResolvedRow> => {
  const limit = row.source.limit || 20;
  try {
    switch (row.source.kind) {
      case 'items':
        return { def: row, items: (row.source.items || []).slice(0, limit) };
      case 'tmdb': {
        const data = await fetchFromTMDB(row.source.endpoint || '/trending/all/week', row.source.params || {});
        return { def: row, tmdbItems: (data.results || []).slice(0, limit) };
      }
      case 'url': {
        const res = await fetch(row.source.url as string);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const arr = getPath(json, row.source.path);
        if (!Array.isArray(arr)) throw new Error(`Path "${row.source.path || '(root)'}" is not an array in the response`);
        return { def: row, items: mapEntries(arr, row.source.map || {}, limit) };
      }
      case 'provider': {
        const p = providers.find(
          (pr) => pr.name.toLowerCase() === (row.source.providerName || '').toLowerCase(),
        );
        if (!p) throw new Error(`Provider "${row.source.providerName}" is not installed or disabled`);
        const res = await fetch(p.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const arr = getPath(json, p.path);
        if (!Array.isArray(arr)) throw new Error(`Provider path "${p.path || '(root)'}" is not an array`);
        return { def: row, items: mapEntries(arr, p.map, Math.min(limit, p.limit || limit)) };
      }
      default:
        return { def: row, items: [] };
    }
  } catch (e: any) {
    return { def: row, error: e?.message || 'Failed to load row', items: [] };
  }
};

/** Quick preview of a provider addon (used in the studio) */
export const previewProvider = async (p: AddonProviderDef): Promise<AddonItem[]> => {
  const res = await fetch(p.url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const arr = getPath(json, p.path);
  if (!Array.isArray(arr)) throw new Error(`Path "${p.path || '(root)'}" is not an array`);
  return mapEntries(arr, p.map, p.limit || 12);
};

/* ------------------------------------------------------------------ */
/* Built-in sample addons (written in CineScript!)                     */
/* ------------------------------------------------------------------ */

export const BUILTIN_ADDON_CODES: { id: string; code: string }[] = [
  {
    id: 'builtin-books',
    code: `# ============================
# Books Library — a whole new tab, written in CineScript
# ============================
addon "Books Library"
version "1.0"
author "CineStream Team"
description "A reading corner: browse fantasy, sci-fi and history books inside the app."
icon fa-book-open
color #d97706
type page

page {
  title "Books"
  route books
  icon fa-book-open
  hero "Reading Corner"
  hero-subtitle "Thousands of classic books, streamed straight from Open Library."
  hero-image "https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=1600&q=80"

  row "Fantasy Picks" {
    source url "https://openlibrary.org/subjects/fantasy.json?limit=20"
    path works
    map title "title"
    map image "https://covers.openlibrary.org/b/id/{cover_id}-L.jpg"
    map subtitle "{first_publish_year}"
    map link "https://openlibrary.org{key}"
    shape poster
    limit 18
  }

  row "Science Fiction" {
    source url "https://openlibrary.org/subjects/science_fiction.json?limit=20"
    path works
    map title "title"
    map image "https://covers.openlibrary.org/b/id/{cover_id}-L.jpg"
    map subtitle "{first_publish_year}"
    map link "https://openlibrary.org{key}"
    shape poster
    limit 18
  }

  row "History & Biography" {
    source url "https://openlibrary.org/subjects/history.json?limit=20"
    path works
    map title "title"
    map image "https://covers.openlibrary.org/b/id/{cover_id}-L.jpg"
    map subtitle "{first_publish_year}"
    map link "https://openlibrary.org{key}"
    shape poster
    limit 18
  }
}
`,
  },
  {
    id: 'builtin-ocean-theme',
    code: `# ============================
# Ocean Night — a full re-skin of the app
# ============================
addon "Ocean Night Theme"
version "1.0"
author "CineStream Team"
description "Deep-sea blues replace the default warm dark palette across the entire app."
icon fa-water
color #00b4d8
type theme

theme {
  background #04121f
  surface #0a2236
  primary #00b4d8
  secondary #0096c7
  text-light #f0f9ff
  text-dark #94b8cc
  border #17405c
  danger #ef4444
}
`,
  },
  {
    id: 'builtin-anime-provider',
    code: `# ============================
# Anime Top Charts — a brand new content provider
# Other addons can use it with: source provider "Anime Top"
# ============================
addon "Anime Top Provider"
version "1.0"
author "CineStream Team"
description "Registers the Jikan anime API as a content source any page addon can use."
icon fa-dragon
color #ec4899
type provider

provider {
  name "Anime Top"
  url "https://api.jikan.moe/v4/top/anime?limit=20"
  path data
  map title "title"
  map image "images.jpg.large_image_url"
  map subtitle "{type} - Score {score}"
  map link "url"
  limit 20
}
`,
  },
  {
    id: 'builtin-anime-page',
    code: `# ============================
# Anime Zone — a page that consumes the Anime Top provider
# and also mixes in TMDB animation rows
# ============================
set $genre = "16"

addon "Anime Zone"
version "1.0"
author "CineStream Team"
description "A dedicated anime tab combining a community provider with TMDB animation catalogs."
icon fa-dragon
color #ec4899
type page

page {
  title "Anime"
  route anime
  icon fa-dragon
  hero "Anime Zone"
  hero-subtitle "Top charts from the community provider plus TMDB animation."
  hero-image "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1600&q=80"

  row "Top Anime Charts" {
    source provider "Anime Top"
    shape poster
    limit 20
  }

  row "Animated Series on TMDB" {
    source tmdb discover/tv with_genres=$genre sort_by=popularity.desc
    shape card
    limit 20
  }

  row "Animated Movies" {
    source tmdb discover/movie with_genres=$genre sort_by=vote_average.desc vote_count.gte=1000
    shape card
    limit 20
  }
}
`,
  },
];

/** Language reference shown in the Addon Studio */
export const CINESCRIPT_DOCS = `# CineScript — full language reference
# Comments start with "#". Strings use "double quotes".

# ---------- 1. Header (every addon) ----------
addon "My Addon"            # required, first
version "1.0"
author "Your Name"
description "What it does"
icon fa-book                # any Font Awesome icon
color #00b4d8               # accent color (hex)
type page                   # theme | page | provider

# ---------- 2. Variables ----------
set $genre = "878"          # use anywhere as $genre

# ---------- 3. THEME addon ----------
type theme
theme {
  background #04121f        # tokens: background surface primary
  surface #0a2236           # secondary text-light text-dark
  primary #00b4d8           # border danger
}

# ---------- 4. PAGE addon (new tab + page) ----------
type page
page {
  title "Books"
  route books               # becomes /addon/books
  icon fa-book-open
  hero "Reading Corner"
  hero-subtitle "Optional subtitle"
  hero-image "https://..."

  # Row from TMDB:
  row "Sci-Fi Movies" {
    source tmdb discover/movie with_genres=$genre
    shape card              # card | poster | circle
    limit 20
  }

  # Row from ANY JSON API:
  row "Fantasy Books" {
    source url "https://openlibrary.org/subjects/fantasy.json"
    path works              # where the array lives
    map title "title"       # plain field path
    map image "https://covers.openlibrary.org/b/id/{cover_id}-L.jpg"
    map subtitle "{first_publish_year}"   # {field} templates
    map link "https://openlibrary.org{key}"
    shape poster
  }

  # Row from an installed provider addon:
  row "Top Anime" {
    source provider "Anime Top"
    shape poster
  }

  # Row of hand-written items:
  row "My Favorites" {
    item "The Hobbit"
    image "https://covers.openlibrary.org/b/id/14627509-L.jpg"
    subtitle "J.R.R. Tolkien"
    link "https://openlibrary.org/works/OL262758W"
    item "Dune"
    image "https://covers.openlibrary.org/b/id/11481354-L.jpg"
    subtitle "Frank Herbert"
  }
}

# ---------- 5. PROVIDER addon (new content source) ----------
type provider
provider {
  name "Anime Top"          # pages reference this name
  url "https://api.jikan.moe/v4/top/anime"
  path data
  map title "title"
  map image "images.jpg.large_image_url"
  map subtitle "{type} - {score}"
  map link "url"
  limit 20
}
`;
