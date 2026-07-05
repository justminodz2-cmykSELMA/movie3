// ============================================================
// Player ↔ Addon bridge
// ------------------------------------------------------------
// Collects the player-facing capabilities declared by enabled
// addons (subtitle sources, auto-skip flags, AI translate
// targets) and fetches subtitle tracks from addon sources.
// Everything here is best-effort and can never break playback.
// ============================================================

import { InstalledAddon, AddonSubtitleSourceDef, AddonAiTranslateLang } from './types';
import { SubtitleTrack } from '../types';
import { TMDB_API_KEY, TMDB_BASE_URL } from '../contexts/constants';

// ISO 639-2 (3-letter) -> ISO 639-1 (2-letter) for the codes subtitle APIs return
const LANG_2LETTER: Record<string, string> = {
  eng: 'en', ara: 'ar', spa: 'es', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de',
  ita: 'it', por: 'pt', rus: 'ru', tur: 'tr', dut: 'nl', nld: 'nl', pol: 'pl',
  jpn: 'ja', kor: 'ko', chi: 'zh', zho: 'zh', hin: 'hi', ind: 'id', vie: 'vi',
  tha: 'th', gre: 'el', ell: 'el', heb: 'he', swe: 'sv', nor: 'no', dan: 'da',
  fin: 'fi', cze: 'cs', ces: 'cs', hun: 'hu', rum: 'ro', ron: 'ro', ukr: 'uk',
  srp: 'sr', hrv: 'hr', bul: 'bg', may: 'ms', msa: 'ms', per: 'fa', fas: 'fa',
  urd: 'ur', ben: 'bn', tam: 'ta', tel: 'te', mal: 'ml', slo: 'sk', slk: 'sk',
  pob: 'pt-br', ice: 'is', isl: 'is', est: 'et', lav: 'lv', lit: 'lt',
};

// Friendly native names for the Subtitles panel
const LANG_NAMES: Record<string, string> = {
  en: 'English', ar: 'العربية', es: 'Español', fr: 'Français', de: 'Deutsch',
  it: 'Italiano', pt: 'Português', ru: 'Русский', tr: 'Türkçe', nl: 'Nederlands',
  pl: 'Polski', ja: '日本語', ko: '한국어', zh: '中文', hi: 'हिन्दी', id: 'Indonesia',
  vi: 'Tiếng Việt', th: 'ไทย', el: 'Ελληνικά', he: 'עברית', sv: 'Svenska',
  no: 'Norsk', da: 'Dansk', fi: 'Suomi', cs: 'Čeština', hu: 'Magyar',
  ro: 'Română', uk: 'Українська', sr: 'Srpski', hr: 'Hrvatski', bg: 'Български',
  ms: 'Melayu', fa: 'فارسی', ur: 'اردو', 'pt-br': 'Português (BR)', is: 'Íslenska',
};

const normalizeLang = (raw: string): string => {
  const lang = raw.toLowerCase().trim();
  if (lang.length === 3 && LANG_2LETTER[lang]) return LANG_2LETTER[lang];
  return lang.slice(0, 8);
};

const langDisplay = (code: string): string => LANG_NAMES[code] || code.toUpperCase();

/** Resolve the IMDB id of a TMDB title (used by {imdb} URL templates). */
async function resolveImdbId(itemType: 'movie' | 'tv', tmdbId: number | string): Promise<string | null> {
  try {
    const res = await fetch(
      `${TMDB_BASE_URL}/${itemType}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.imdb_id === 'string' && data.imdb_id.startsWith('tt') ? data.imdb_id : null;
  } catch {
    return null;
  }
}

export interface AddonPlayerConfig {
  sources: AddonSubtitleSourceDef[];
  autoSkipIntro: boolean;
  autoSkipOutro: boolean;
  aiTranslate: AddonAiTranslateLang[];
}

const EMPTY_CONFIG: AddonPlayerConfig = {
  sources: [], autoSkipIntro: false, autoSkipOutro: false, aiTranslate: [],
};

/** Merge the player capabilities of every enabled addon. */
export function collectAddonPlayerConfig(addons: InstalledAddon[]): AddonPlayerConfig {
  const config: AddonPlayerConfig = { ...EMPTY_CONFIG, sources: [], aiTranslate: [] };
  const seenSources = new Set<string>();
  const seenLangs = new Set<string>();
  for (const addon of addons) {
    if (!addon.enabled) continue;
    const m = addon.manifest;
    if (Array.isArray(m.subtitleSources)) {
      for (const src of m.subtitleSources) {
        if (!src || !src.id || seenSources.has(src.id)) continue;
        seenSources.add(src.id);
        config.sources.push(src);
      }
    }
    if (m.player) {
      if (m.player.autoSkipIntro) config.autoSkipIntro = true;
      if (m.player.autoSkipOutro) config.autoSkipOutro = true;
      if (Array.isArray(m.player.aiTranslate)) {
        for (const lang of m.player.aiTranslate) {
          if (!lang || !lang.code || seenLangs.has(lang.code)) continue;
          seenLangs.add(lang.code);
          config.aiTranslate.push(lang);
        }
      }
    }
  }
  return config;
}

const fillTemplate = (tpl: string, id: number | string, imdbId: string | null, season?: number, episode?: number) => tpl
  .replace('{id}', String(id))
  .replace('{imdb}', String(imdbId || ''))
  .replace('{season}', String(season ?? 1))
  .replace('{episode}', String(episode ?? 1));

/**
 * Queries every addon subtitle source for the current title and returns the
 * combined track list (deduplicated by language so the Subtitles panel keys
 * stay unique). Sources that fail or time out are silently skipped.
 */
export async function fetchAddonSubtitles(
  sources: AddonSubtitleSourceDef[],
  itemType: 'movie' | 'tv',
  tmdbId: number | string,
  season?: number,
  episode?: number,
): Promise<SubtitleTrack[]> {
  if (!sources.length || !tmdbId) return [];

  // Resolve the IMDB id once if any source template needs it
  const needsImdb = sources.some(src => (itemType === 'tv' ? src.tvUrl : src.movieUrl)?.includes('{imdb}'));
  const imdbId = needsImdb ? await resolveImdbId(itemType, tmdbId) : null;

  const perSource = await Promise.all(sources.map(async (src): Promise<SubtitleTrack[]> => {
    const tpl = itemType === 'tv' ? src.tvUrl : src.movieUrl;
    if (!tpl) return [];
    if (tpl.includes('{imdb}') && !imdbId) return [];
    try {
      const res = await fetch(fillTemplate(tpl, tmdbId, imdbId, season, episode), {
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) return [];
      const data = await res.json();
      const list: any[] = Array.isArray(data) ? data
        : Array.isArray((data || {}).subtitles) ? data.subtitles
        : Array.isArray((data || {}).results) ? data.results
        : [];
      const max = Math.max(1, Math.min(12, src.maxTracks || 6));
      const tracks: SubtitleTrack[] = [];
      const seenLang = new Set<string>();
      for (const entry of list) {
        if (tracks.length >= max) break;
        if (!entry || typeof entry !== 'object') continue;
        const url = String(entry.url || entry.download || entry.link || '');
        if (!/^https?:\/\//.test(url)) continue;
        const language = normalizeLang(String(entry.language || entry.lang || entry.languageCode || 'un'));
        if (src.language && !language.startsWith(src.language)) continue;
        const format = String(entry.format || entry.type || 'srt').toLowerCase();
        if (format && format !== 'srt' && format !== 'vtt' && format !== 'subrip' && format !== 'application/x-subrip') continue;
        if (seenLang.has(language)) continue; // one track per language per source
        seenLang.add(language);
        const display = String(entry.display || entry.languageName || entry.name || langDisplay(language)).slice(0, 60);
        tracks.push({ language, url, display: `${display} · ${src.name}` });
      }
      return tracks;
    } catch {
      return []; // network problems never break the player
    }
  }));

  // Merge across sources, keeping the first track for each language.
  const merged: SubtitleTrack[] = [];
  const seen = new Set<string>();
  for (const tracks of perSource) {
    for (const t of tracks) {
      if (seen.has(t.language)) continue;
      seen.add(t.language);
      merged.push(t);
    }
  }
  return merged;
}
