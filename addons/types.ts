// ============================================================
// CineStream Addon Platform — Type definitions
// ============================================================

export type AddonType = 'theme' | 'page' | 'provider' | 'player' | 'mixed';

export interface AddonMeta {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  icon: string;   // font-awesome class e.g. "fa-solid fa-book"
  color: string;  // accent hex color for the orb / cards
  type: AddonType;
}

export interface AddonItem {
  title: string;
  subtitle?: string;
  image?: string;
  badge?: string;
  // Actions (first one present wins): tmdb -> details modal, play -> iframe player, url -> new window
  tmdb?: {
    id: number;
    media_type: 'movie' | 'tv';
    title: string;
    poster_path: string | null;
    backdrop_path: string | null;
    overview: string;
    vote_average: number;
  };
  play?: string;
  url?: string;
}

export interface AddonRow {
  title: string;
  shape?: 'poster' | 'wide' | 'circle' | 'square';
  items: AddonItem[];
}

export interface AddonPageDef {
  id: string;
  title: string;
  icon: string;
  showInNav: boolean;
  rows: AddonRow[];
}

export interface AddonProviderDef {
  id: string;
  name: string;
  movieUrl?: string; // template: {id}
  tvUrl?: string;    // template: {id} {season} {episode}
}

// ---- Player addons (subtitles / skip / AI features) ----

/**
 * A subtitle source addon registers an HTTP JSON API that returns a list of
 * subtitle tracks for a TMDB title. The player queries it and lists the
 * returned tracks in the Subtitles panel next to the stream's own subtitles.
 * URL templates: {id} = TMDB id, {season}, {episode}.
 * The endpoint must return a JSON array of objects with at least
 * { url, language } (optional: display, format).
 */
export interface AddonSubtitleSourceDef {
  id: string;
  name: string;
  movieUrl?: string;
  tvUrl?: string;
  /** Optional ISO-639-1 filter, e.g. "ar" keeps only Arabic tracks. */
  language?: string;
  /** Max tracks contributed by this source (default 6, hard cap 12). */
  maxTracks?: number;
}

/** One AI translation target shown in the player's Subtitles panel. */
export interface AddonAiTranslateLang {
  code: string;
  label: string;
}

/** Player behaviour flags an addon can enable. */
export interface AddonPlayerFlags {
  /** Automatically jump over the Gemini-detected intro segment. */
  autoSkipIntro?: boolean;
  /** Automatically jump over the Gemini-detected outro segment. */
  autoSkipOutro?: boolean;
  /** Gemini-powered subtitle translation targets for the Subtitles panel. */
  aiTranslate?: AddonAiTranslateLang[];
}

export interface AddonManifest {
  meta: AddonMeta;
  theme: Record<string, string> | null;
  pages: AddonPageDef[];
  providers: AddonProviderDef[];
  /** Optional — older cached manifests may not carry these fields. */
  subtitleSources?: AddonSubtitleSourceDef[];
  player?: AddonPlayerFlags | null;
}

export interface InstalledAddon {
  source: string;
  manifest: AddonManifest;
  enabled: boolean;
  builtin?: boolean;
  installedAt: number;
  updatedAt: number;
}

// Theme variables an addon is allowed to control
export const THEME_ALLOWED_KEYS = [
  'primary', 'background', 'surface', 'border', 'text', 'accent',
] as const;
