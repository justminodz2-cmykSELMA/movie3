// ============================================================
// CineScript Runtime — host API + manifest builder
// ------------------------------------------------------------
// Executes an addon script in the sandbox and collects what it
// declares (meta, theme, pages, rows, items, providers) into an
// AddonManifest. The addon can never touch the app directly.
// ============================================================

import { runScript, CineScriptError } from './cinescript';
import {
  AddonManifest, AddonMeta, AddonItem, AddonRow, AddonPageDef,
  AddonProviderDef, AddonSubtitleSourceDef, AddonPlayerFlags,
  AddonAiTranslateLang, THEME_ALLOWED_KEYS, AddonType,
} from './types';
import { TMDB_API_KEY, TMDB_BASE_URL, IMAGE_BASE_URL } from '../contexts/constants';

const MAX_HTTP_CALLS = 20;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_ITEMS_PER_ROW = 60;
const MAX_ROWS_PER_PAGE = 20;
const MAX_PAGES = 6;

const slug = (s: string) => String(s).toLowerCase().trim().replace(/[^a-z0-9\u0600-\u06FF]+/g, '-').slice(0, 40) || 'page';

function cleanString(v: unknown, max = 300): string {
  return String(v ?? '').slice(0, max);
}

function isSafeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch { return false; }
}

function sanitizeItem(raw: any): AddonItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const item: AddonItem = { title: cleanString(raw.title || raw.name || 'Untitled', 120) };
  if (raw.subtitle) item.subtitle = cleanString(raw.subtitle, 160);
  if (raw.badge) item.badge = cleanString(raw.badge, 20);
  if (raw.image && isSafeUrl(String(raw.image))) item.image = cleanString(raw.image, 500);
  if (raw.play && isSafeUrl(String(raw.play))) item.play = cleanString(raw.play, 800);
  if (raw.url && isSafeUrl(String(raw.url))) item.url = cleanString(raw.url, 800);
  if (raw.tmdb && typeof raw.tmdb === 'object' && raw.tmdb.id) {
    item.tmdb = {
      id: Number(raw.tmdb.id),
      media_type: raw.tmdb.media_type === 'tv' ? 'tv' : 'movie',
      title: cleanString(raw.tmdb.title, 200),
      poster_path: raw.tmdb.poster_path ?? null,
      backdrop_path: raw.tmdb.backdrop_path ?? null,
      overview: cleanString(raw.tmdb.overview, 1000),
      vote_average: Number(raw.tmdb.vote_average) || 0,
    };
  }
  return item;
}

export interface RunResult {
  manifest: AddonManifest;
  logs: string[];
}

/**
 * Executes CineScript source and returns the collected manifest.
 * Throws CineScriptError with a line number on any script problem.
 */
export async function buildAddonManifest(source: string): Promise<RunResult> {
  if (typeof source !== 'string' || !source.trim()) {
    throw new CineScriptError('Addon source is empty', 0);
  }
  if (source.length > 200_000) {
    throw new CineScriptError('Addon source is too large (max 200KB)', 0);
  }

  let meta: AddonMeta | null = null;
  let theme: Record<string, string> | null = null;
  const pages: AddonPageDef[] = [];
  const providers: AddonProviderDef[] = [];
  const subtitleSources: AddonSubtitleSourceDef[] = [];
  let playerFlags: AddonPlayerFlags | null = null;
  const logs: string[] = [];
  let httpCalls = 0;

  const httpGet = async (url: unknown, asText = false) => {
    const u = String(url);
    if (!isSafeUrl(u)) throw new Error(`Blocked URL: ${u}`);
    if (++httpCalls > MAX_HTTP_CALLS) throw new Error(`Addon exceeded ${MAX_HTTP_CALLS} network requests`);
    const res = await fetch(u, { signal: AbortSignal.timeout(15_000) });
    const text = await res.text();
    if (text.length > MAX_RESPONSE_BYTES) throw new Error('Response too large');
    if (asText) return text;
    try { return JSON.parse(text); } catch { throw new Error('Response is not valid JSON — use http.getText() for plain text'); }
  };

  const makeRowHandle = (page: AddonPageDef) => (title: unknown, shape?: unknown) => {
    if (page.rows.length >= MAX_ROWS_PER_PAGE) throw new Error(`Max ${MAX_ROWS_PER_PAGE} rows per page`);
    const row: AddonRow = {
      title: cleanString(title || 'Row', 120),
      shape: (['poster', 'wide', 'circle', 'square'].includes(String(shape)) ? String(shape) : 'poster') as AddonRow['shape'],
      items: [],
    };
    page.rows.push(row);
    return {
      add: (raw: unknown) => {
        if (row.items.length >= MAX_ITEMS_PER_ROW) return null;
        const item = sanitizeItem(raw);
        if (item) row.items.push(item);
        return item;
      },
      addAll: (list: unknown) => {
        if (Array.isArray(list)) {
          for (const raw of list) {
            if (row.items.length >= MAX_ITEMS_PER_ROW) break;
            const item = sanitizeItem(raw);
            if (item) row.items.push(item);
          }
        }
        return row.items.length;
      },
    };
  };

  const hostApi: Record<string, unknown> = {
    // ---------- declaration ----------
    meta: (m: any) => {
      if (!m || typeof m !== 'object') throw new Error('meta() expects an object');
      if (!m.id || !m.name) throw new Error('meta() requires "id" and "name"');
      const type: AddonType = (['theme', 'page', 'provider', 'player', 'mixed'].includes(m.type) ? m.type : 'mixed') as AddonType;
      meta = {
        id: slug(m.id),
        name: cleanString(m.name, 60),
        version: cleanString(m.version || '1.0.0', 20),
        author: cleanString(m.author || 'Anonymous', 60),
        description: cleanString(m.description || '', 400),
        icon: cleanString(m.icon || 'fa-solid fa-puzzle-piece', 80),
        color: /^#[0-9a-fA-F]{3,8}$/.test(String(m.color || '')) ? String(m.color) : '#e50914',
        type,
      };
    },
    subtitles: (s: any) => {
      if (!s || typeof s !== 'object' || !s.id || !s.name) throw new Error('subtitles() requires "id" and "name"');
      if (subtitleSources.length >= 4) throw new Error('Max 4 subtitle sources per addon');
      const def: AddonSubtitleSourceDef = {
        id: slug(s.id),
        name: cleanString(s.name, 60),
      };
      if (s.movieUrl && isSafeUrl(String(s.movieUrl).replace(/\{[a-z]+\}/g, '1'))) def.movieUrl = cleanString(s.movieUrl, 500);
      if (s.tvUrl && isSafeUrl(String(s.tvUrl).replace(/\{[a-z]+\}/g, '1'))) def.tvUrl = cleanString(s.tvUrl, 500);
      if (!def.movieUrl && !def.tvUrl) throw new Error('subtitles() needs a valid https "movieUrl" or "tvUrl" template');
      if (s.language && /^[a-zA-Z-]{2,8}$/.test(String(s.language))) def.language = String(s.language).toLowerCase();
      if (s.maxTracks) def.maxTracks = Math.max(1, Math.min(12, Math.floor(Number(s.maxTracks) || 6)));
      subtitleSources.push(def);
      return { id: def.id };
    },
    player: (p: any) => {
      if (!p || typeof p !== 'object') throw new Error('player() expects an object, e.g. player({ autoSkipIntro: true })');
      const flags: AddonPlayerFlags = { ...(playerFlags || {}) };
      if ('autoSkipIntro' in p) flags.autoSkipIntro = !!p.autoSkipIntro;
      if ('autoSkipOutro' in p) flags.autoSkipOutro = !!p.autoSkipOutro;
      if (Array.isArray(p.aiTranslate)) {
        const langs: AddonAiTranslateLang[] = [];
        for (const l of p.aiTranslate.slice(0, 8)) {
          if (!l || typeof l !== 'object' || !l.code || !l.label) continue;
          const code = String(l.code).toLowerCase().replace(/[^a-z-]/g, '').slice(0, 8);
          if (!code) continue;
          langs.push({ code, label: cleanString(l.label, 40) });
        }
        if (langs.length) flags.aiTranslate = langs;
      }
      if (!('autoSkipIntro' in flags) && !('autoSkipOutro' in flags) && !flags.aiTranslate) {
        throw new Error('player() accepts: autoSkipIntro, autoSkipOutro, aiTranslate: [{ code, label }]');
      }
      playerFlags = flags;
    },
    theme: (vars: any) => {
      if (!vars || typeof vars !== 'object') throw new Error('theme() expects an object');
      const out: Record<string, string> = {};
      for (const key of THEME_ALLOWED_KEYS) {
        const v = vars[key];
        if (typeof v === 'string' && /^[#a-zA-Z0-9(),.%\s-]{1,60}$/.test(v)) out[key] = v;
      }
      if (Object.keys(out).length === 0) throw new Error(`theme() accepts: ${THEME_ALLOWED_KEYS.join(', ')}`);
      theme = out;
    },
    page: (title: unknown, icon?: unknown, options?: any) => {
      if (pages.length >= MAX_PAGES) throw new Error(`Max ${MAX_PAGES} pages per addon`);
      const pageDef: AddonPageDef = {
        id: slug(options && options.id ? options.id : String(title)),
        title: cleanString(title || 'Page', 60),
        icon: cleanString(icon || 'fa-solid fa-layer-group', 80),
        showInNav: options && options.nav === false ? false : true,
        rows: [],
      };
      pages.push(pageDef);
      return { row: makeRowHandle(pageDef), id: pageDef.id };
    },
    provider: (p: any) => {
      if (!p || typeof p !== 'object' || !p.id || !p.name) throw new Error('provider() requires "id" and "name"');
      const def: AddonProviderDef = {
        id: slug(p.id),
        name: cleanString(p.name, 60),
      };
      if (p.movieUrl && isSafeUrl(String(p.movieUrl).replace(/\{[a-z]+\}/g, '1'))) def.movieUrl = cleanString(p.movieUrl, 500);
      if (p.tvUrl && isSafeUrl(String(p.tvUrl).replace(/\{[a-z]+\}/g, '1'))) def.tvUrl = cleanString(p.tvUrl, 500);
      providers.push(def);
      return {
        id: def.id,
        watchMovie: (tmdbId: unknown) => def.movieUrl ? def.movieUrl.replace('{id}', String(Number(tmdbId) || 0)) : null,
        watchTv: (tmdbId: unknown, season: unknown, episode: unknown) => def.tvUrl
          ? def.tvUrl.replace('{id}', String(Number(tmdbId) || 0)).replace('{season}', String(Number(season) || 1)).replace('{episode}', String(Number(episode) || 1))
          : null,
      };
    },
    item: (raw: unknown) => sanitizeItem(raw),

    // ---------- network ----------
    http: {
      get: (url: unknown) => httpGet(url, false),
      getText: (url: unknown) => httpGet(url, true),
      // Fault-tolerant variants: return null instead of failing the addon
      tryGet: async (url: unknown) => { try { return await httpGet(url, false); } catch { return null; } },
      tryGetText: async (url: unknown) => { try { return await httpGet(url, true); } catch { return null; } },
    },
    tmdb: async (path: unknown, params?: any) => {
      const p = String(path || '');
      if (!p.startsWith('/')) throw new Error('tmdb() path must start with "/"');
      const search = new URLSearchParams({ api_key: TMDB_API_KEY });
      if (params && typeof params === 'object') {
        for (const [k, v] of Object.entries(params)) search.set(String(k).slice(0, 60), String(v).slice(0, 120));
      }
      return httpGet(`${TMDB_BASE_URL}${p}?${search.toString()}`, false);
    },
    tmdbItem: (r: any, mediaType?: unknown) => {
      if (!r || typeof r !== 'object' || !r.id) return null;
      const media = (mediaType === 'tv' || r.media_type === 'tv' || (!r.title && r.name)) ? 'tv' : 'movie';
      return sanitizeItem({
        title: r.title || r.name || 'Untitled',
        subtitle: (r.release_date || r.first_air_date || '').slice(0, 4),
        image: r.poster_path ? `${IMAGE_BASE_URL}w500${r.poster_path}` : undefined,
        badge: r.vote_average ? `★ ${Number(r.vote_average).toFixed(1)}` : undefined,
        tmdb: {
          id: r.id, media_type: media, title: r.title || r.name || '',
          poster_path: r.poster_path ?? null, backdrop_path: r.backdrop_path ?? null,
          overview: r.overview || '', vote_average: r.vote_average || 0,
        },
      });
    },

    // ---------- stdlib ----------
    log: (...args: unknown[]) => { logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a)?.slice(0, 500) : String(a)).join(' ')); },
    len: (v: any) => (Array.isArray(v) || typeof v === 'string') ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : 0),
    str: (v: unknown) => typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''),
    num: (v: unknown) => Number(v) || 0,
    push: (arr: unknown, v: unknown) => { if (Array.isArray(arr)) arr.push(v); return arr; },
    keys: (o: unknown) => (o && typeof o === 'object') ? Object.keys(o) : [],
    range: (n: unknown) => Array.from({ length: Math.min(10_000, Math.max(0, Math.floor(Number(n) || 0))) }, (_, i) => i),
    join: (arr: unknown, sep: unknown) => Array.isArray(arr) ? arr.join(String(sep ?? ',')) : '',
    split: (s: unknown, sep: unknown) => String(s ?? '').split(String(sep ?? ',')),
    upper: (s: unknown) => String(s ?? '').toUpperCase(),
    lower: (s: unknown) => String(s ?? '').toLowerCase(),
    trim: (s: unknown) => String(s ?? '').trim(),
    replace: (s: unknown, a: unknown, b: unknown) => String(s ?? '').split(String(a)).join(String(b)),
    contains: (s: unknown, sub: unknown) => Array.isArray(s) ? s.includes(sub) : String(s ?? '').includes(String(sub)),
    slice: (v: any, a: unknown, b?: unknown) => (Array.isArray(v) || typeof v === 'string') ? v.slice(Number(a) || 0, b === undefined ? undefined : Number(b)) : v,
    sort: (arr: unknown, key?: unknown) => {
      if (!Array.isArray(arr)) return arr;
      const copy = [...arr];
      copy.sort((x: any, y: any) => {
        const a = key ? x?.[String(key)] : x;
        const b = key ? y?.[String(key)] : y;
        return a < b ? -1 : a > b ? 1 : 0;
      });
      return copy;
    },
    reverse: (arr: unknown) => Array.isArray(arr) ? [...arr].reverse() : arr,
    random: () => Math.random(),
    floor: (v: unknown) => Math.floor(Number(v) || 0),
    round: (v: unknown) => Math.round(Number(v) || 0),
    min: (...v: unknown[]) => Math.min(...v.map(Number)),
    max: (...v: unknown[]) => Math.max(...v.map(Number)),
    now: () => Date.now(),
    imageUrl: (path: unknown, size?: unknown) => path ? `${IMAGE_BASE_URL}${String(size || 'w500')}${String(path)}` : '',
  };

  await runScript(source, hostApi);

  if (!meta) throw new CineScriptError('Addon must call meta({ id, name, ... }) to describe itself', 0);

  const manifest: AddonManifest = { meta, theme, pages, providers, subtitleSources, player: playerFlags };
  return { manifest, logs };
}
