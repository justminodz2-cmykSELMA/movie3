// ============================================================
// AddonProvider — installs, stores, runs and exposes addons.
// Persisted in localStorage; manifests are refreshed in the
// background on startup so dynamic rows stay up to date.
// ============================================================

import React, {
  createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode,
} from 'react';
import { InstalledAddon, AddonManifest, AddonPageDef } from './types';
import { buildAddonManifest } from './runtime';
import { BUILTIN_ADDON_SOURCES } from './builtins';
import { useProfile } from '../contexts/ProfileContext';

export interface AddonTab {
  addonId: string;
  pageId: string;
  title: string;
  icon: string;
  route: string;
}

interface AddonContextType {
  addons: InstalledAddon[];
  loading: boolean;
  installAddon: (source: string) => Promise<InstalledAddon>;
  uninstallAddon: (id: string) => void;
  toggleAddon: (id: string) => void;
  getAddon: (id: string) => InstalledAddon | undefined;
  getPage: (addonId: string, pageId?: string) => { addon: InstalledAddon; page: AddonPageDef } | null;
  tabs: AddonTab[];
  latestAddons: InstalledAddon[];
}

const AddonContext = createContext<AddonContextType | undefined>(undefined);

function loadStored(storageKey: string): InstalledAddon[] | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function persist(storageKey: string, addons: InstalledAddon[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(addons));
  } catch (e) {
    console.warn('Failed to persist addons:', e);
  }
}

// ---- Theme application (fully reversible, never breaks base styles) ----
const THEME_VAR_MAP: Record<string, string> = {
  primary: '--primary',
  background: '--background',
  surface: '--surface',
  border: '--border',
  text: '--text',
  accent: '--accent',
};

function applyTheme(theme: Record<string, string> | null) {
  const root = document.documentElement;
  for (const cssVar of Object.values(THEME_VAR_MAP)) {
    root.style.removeProperty(cssVar);
  }
  document.body.style.removeProperty('background-color');
  document.body.style.removeProperty('color');
  if (theme) {
    for (const [key, value] of Object.entries(theme)) {
      const cssVar = THEME_VAR_MAP[key];
      if (cssVar) root.style.setProperty(cssVar, value);
    }
    if (theme.background) document.body.style.backgroundColor = theme.background;
    if (theme.text) document.body.style.color = theme.text;
  }
}

export const AddonProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [addons, setAddons] = useState<InstalledAddon[]>([]);
  const [loading, setLoading] = useState(true);
  const { activeProfile } = useProfile();

  // Addons are per-profile: each account/profile has its own installed
  // addons and its own theme; changes never leak to other profiles.
  const storageKey = `cineStreamAddons_v1_${activeProfile?.id || 'default'}`;

  // Load per-profile addons (re-runs when the active profile changes),
  // or seed the built-in gallery on this profile's first run.
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      setLoading(true);
      const stored = loadStored(storageKey);
      if (stored) {
        if (!cancelled) { setAddons(stored); setLoading(false); }
        // Background refresh of enabled addon manifests (best effort).
        const refreshed = await Promise.all(stored.map(async (a) => {
          if (!a.enabled) return a;
          try {
            const { manifest } = await buildAddonManifest(a.source);
            return { ...a, manifest, updatedAt: Date.now() };
          } catch {
            return a; // keep cached manifest — never break the app
          }
        }));
        if (!cancelled) { setAddons(refreshed); persist(storageKey, refreshed); }
        return;
      }
      // First run: seed built-ins (pages enabled, theme/provider examples installed but disabled).
      const seeded: InstalledAddon[] = [];
      for (const source of BUILTIN_ADDON_SOURCES) {
        try {
          const { manifest } = await buildAddonManifest(source);
          seeded.push({
            source,
            manifest,
            enabled: manifest.meta.type === 'page',
            builtin: true,
            installedAt: Date.now(),
            updatedAt: Date.now(),
          });
        } catch (e) {
          console.warn('Builtin addon failed to load:', e);
        }
      }
      if (!cancelled) { setAddons(seeded); persist(storageKey, seeded); setLoading(false); }
    };
    init();
    return () => { cancelled = true; };
  }, [storageKey]);

  // Apply the most recently enabled theme addon (or restore defaults).
  useEffect(() => {
    const themeAddon = [...addons]
      .filter(a => a.enabled && a.manifest.theme)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    applyTheme(themeAddon ? themeAddon.manifest.theme : null);
  }, [addons]);

  const installAddon = useCallback(async (source: string): Promise<InstalledAddon> => {
    const { manifest } = await buildAddonManifest(source);
    const installed: InstalledAddon = {
      source,
      manifest,
      enabled: true,
      installedAt: Date.now(),
      updatedAt: Date.now(),
    };
    setAddons(prev => {
      const existing = prev.find(a => a.manifest.meta.id === manifest.meta.id);
      const next = existing
        ? prev.map(a => a.manifest.meta.id === manifest.meta.id
            ? { ...installed, builtin: a.builtin, installedAt: a.installedAt }
            : a)
        : [...prev, installed];
      persist(storageKey, next);
      return next;
    });
    return installed;
  }, [storageKey]);

  const uninstallAddon = useCallback((id: string) => {
    setAddons(prev => {
      const next = prev.filter(a => a.manifest.meta.id !== id);
      persist(storageKey, next);
      return next;
    });
  }, [storageKey]);

  const toggleAddon = useCallback((id: string) => {
    setAddons(prev => {
      const next = prev.map(a => a.manifest.meta.id === id
        ? { ...a, enabled: !a.enabled, updatedAt: Date.now() }
        : a);
      persist(storageKey, next);
      return next;
    });
  }, [storageKey]);

  const getAddon = useCallback(
    (id: string) => addons.find(a => a.manifest.meta.id === id),
    [addons],
  );

  const getPage = useCallback((addonId: string, pageId?: string) => {
    const addon = addons.find(a => a.manifest.meta.id === addonId);
    if (!addon) return null;
    const page = pageId
      ? addon.manifest.pages.find(p => p.id === pageId)
      : addon.manifest.pages[0];
    if (!page) return null;
    return { addon, page };
  }, [addons]);

  const tabs = useMemo<AddonTab[]>(() => {
    const out: AddonTab[] = [];
    for (const a of addons) {
      if (!a.enabled) continue;
      for (const p of a.manifest.pages) {
        if (!p.showInNav) continue;
        out.push({
          addonId: a.manifest.meta.id,
          pageId: p.id,
          title: p.title,
          icon: p.icon || a.manifest.meta.icon,
          route: `/addon/${a.manifest.meta.id}/${p.id}`,
        });
      }
    }
    return out.slice(0, 6); // keep the navbar sane
  }, [addons]);

  const latestAddons = useMemo(
    () => [...addons].sort((a, b) => b.installedAt - a.installedAt).slice(0, 12),
    [addons],
  );

  const value = useMemo(() => ({
    addons, loading, installAddon, uninstallAddon, toggleAddon, getAddon, getPage, tabs, latestAddons,
  }), [addons, loading, installAddon, uninstallAddon, toggleAddon, getAddon, getPage, tabs, latestAddons]);

  return <AddonContext.Provider value={value}>{children}</AddonContext.Provider>;
};

export const useAddons = (): AddonContextType => {
  const ctx = useContext(AddonContext);
  if (!ctx) throw new Error('useAddons must be used within an AddonProvider');
  return ctx;
};
