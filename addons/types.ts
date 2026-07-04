// ============================================================
// CineStream Addon Platform — Type definitions
// ============================================================

export type AddonType = 'theme' | 'page' | 'provider' | 'mixed';

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
  shape?: 'poster' | 'wide' | 'circle';
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

export interface AddonManifest {
  meta: AddonMeta;
  theme: Record<string, string> | null;
  pages: AddonPageDef[];
  providers: AddonProviderDef[];
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
