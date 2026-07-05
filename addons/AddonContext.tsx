// ============================================================
// AddonProvider — installs, stores, runs and exposes addons.
// Persisted in localStorage AND synced (addons only) with the
// user's personal Addon Studio link, so edits made on a PC
// appear on the TV home screen automatically.
// ============================================================

import React, {
  createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode,
} from 'react';
import { InstalledAddon, AddonManifest, AddonPageDef } from './types';
import { buildAddonManifest } from './runtime';
import { BUILTIN_ADDONS, BUILTIN_ADDON_SOURCES } from './builtins';
import { useProfile } from '../contexts/ProfileContext';
import { getToken } from '../services/authService';
import { isPlayerActive } from '../services/playerActivity';
import {
  createStudioLink, fetchStudioAddons, saveStudioAddons, buildStudioUrl,
} from '../services/studioService';
import StudioTipModal from './StudioTipModal';

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
  /** Personal Addon Studio URL for this user/profile (PC management page). */
  studioUrl: string | null;
  /** Opens the neutral "manage addons on your PC" tip modal. */
  openStudio: () => void;
  closeStudio: () => void;
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
  const [studioToken, setStudioToken] = useState<string | null>(null);
  const [studioOpen, setStudioOpen] = useState(false);
  const { activeProfile } = useProfile();

  // Addons are per-profile: each account/profile has its own installed
  // addons and its own theme; changes never leak to other profiles.
  const storageKey = `cineStreamAddons_v1_${activeProfile?.id || 'default'}`;
  const revKey = `${storageKey}_rev`;

  // Refs so async sync code never works with stale closures.
  const addonsRef = useRef<InstalledAddon[]>([]);
  const studioTokenRef = useRef<string | null>(null);
  const serverRevRef = useRef(0);
  useEffect(() => { addonsRef.current = addons; }, [addons]);
  useEffect(() => { studioTokenRef.current = studioToken; }, [studioToken]);

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
        // Upgrade path: add any NEW built-in gallery addons this install
        // doesn't know about yet (installed but disabled — user opts in).
        const knownIds = new Set(refreshed.map(a => a.manifest?.meta?.id));
        const newBuiltins: InstalledAddon[] = [];
        for (const builtin of BUILTIN_ADDONS) {
          if (knownIds.has(builtin.id)) continue;
          try {
            const { manifest } = await buildAddonManifest(builtin.source);
            newBuiltins.push({
              source: builtin.source,
              manifest,
              enabled: false,
              builtin: true,
              installedAt: Date.now(),
              updatedAt: Date.now(),
            });
          } catch (e) {
            console.warn('New builtin addon failed to load:', builtin.id, e);
          }
        }
        const merged = newBuiltins.length ? [...refreshed, ...newBuiltins] : refreshed;
        if (!cancelled) { setAddons(merged); persist(storageKey, merged); }
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
            // All built-in addons (incl. Books/Anime tabs) start disabled;
            // the user opts in from the Addons settings page.
            enabled: false,
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

  // ---- Studio link + sync (addons only, best effort, never blocks the app) ----

  // Fetch (or create) this user/profile's stable personal Studio link.
  useEffect(() => {
    let cancelled = false;
    setStudioToken(null);
    serverRevRef.current = parseInt(localStorage.getItem(revKey) || '0', 10) || 0;
    if (!getToken() || !activeProfile) return;
    (async () => {
      try {
        const { token } = await createStudioLink(
          String(activeProfile.id),
          String((activeProfile as any).name || ''),
        );
        if (!cancelled) setStudioToken(token);
      } catch {
        // Studio sync unavailable — the app keeps working locally as before.
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const applyServerAddons = useCallback((remote: InstalledAddon[], rev: number) => {
    serverRevRef.current = rev;
    try { localStorage.setItem(revKey, String(rev)); } catch { /* ignore */ }
    addonsRef.current = remote;
    setAddons(remote);
    persist(storageKey, remote);
  }, [storageKey, revKey]);

  const pushAddons = useCallback(async (next: InstalledAddon[]) => {
    const token = studioTokenRef.current;
    if (!token) return;
    try {
      const rev = await saveStudioAddons(token, next);
      serverRevRef.current = rev;
      try { localStorage.setItem(revKey, String(rev)); } catch { /* ignore */ }
    } catch {
      // Offline / server hiccup: local copy stays authoritative on this device.
    }
  }, [revKey]);

  // Pull remote changes: on link ready, on tab focus, and every 15s —
  // so edits made in the PC Studio appear on the TV automatically.
  useEffect(() => {
    if (!studioToken) return;
    let stopped = false;
    const sync = async (initial = false) => {
      try {
        const data = await fetchStudioAddons(studioToken);
        if (stopped) return;
        if (data.rev > serverRevRef.current && Array.isArray(data.addons)) {
          applyServerAddons(data.addons, data.rev);
        } else if (initial && (data.rev || 0) === 0 && addonsRef.current.length > 0) {
          // First time this profile syncs: seed the Studio with this device's addons.
          await pushAddons(addonsRef.current);
        }
      } catch {
        // best effort only
      }
    };
    sync(true);
    // Sleep the sync while the video player is open — playback gets
    // all the bandwidth. Sync resumes automatically when leaving the player.
    const interval = window.setInterval(() => { if (!isPlayerActive()) sync(); }, 15000);
    const onVisible = () => { if (document.visibilityState === 'visible' && !isPlayerActive()) sync(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [studioToken, applyServerAddons, pushAddons]);

  // ---- Mutations (persist locally + mirror to the Studio) ----

  const installAddon = useCallback(async (source: string): Promise<InstalledAddon> => {
    const { manifest } = await buildAddonManifest(source);
    const prev = addonsRef.current;
    const existing = prev.find(a => a.manifest.meta.id === manifest.meta.id);
    const installed: InstalledAddon = {
      source,
      manifest,
      enabled: true,
      builtin: existing?.builtin,
      installedAt: existing?.installedAt || Date.now(),
      updatedAt: Date.now(),
    };
    const next = existing
      ? prev.map(a => (a.manifest.meta.id === manifest.meta.id ? installed : a))
      : [...prev, installed];
    addonsRef.current = next;
    setAddons(next);
    persist(storageKey, next);
    pushAddons(next);
    return installed;
  }, [storageKey, pushAddons]);

  const uninstallAddon = useCallback((id: string) => {
    const next = addonsRef.current.filter(a => a.manifest.meta.id !== id);
    addonsRef.current = next;
    setAddons(next);
    persist(storageKey, next);
    pushAddons(next);
  }, [storageKey, pushAddons]);

  const toggleAddon = useCallback((id: string) => {
    const next = addonsRef.current.map(a => a.manifest.meta.id === id
      ? { ...a, enabled: !a.enabled, updatedAt: Date.now() }
      : a);
    addonsRef.current = next;
    setAddons(next);
    persist(storageKey, next);
    pushAddons(next);
  }, [storageKey, pushAddons]);

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

  const studioUrl = useMemo(() => (studioToken ? buildStudioUrl(studioToken) : null), [studioToken]);
  const openStudio = useCallback(() => setStudioOpen(true), []);
  const closeStudio = useCallback(() => setStudioOpen(false), []);

  const value = useMemo(() => ({
    addons, loading, installAddon, uninstallAddon, toggleAddon, getAddon, getPage, tabs, latestAddons,
    studioUrl, openStudio, closeStudio,
  }), [addons, loading, installAddon, uninstallAddon, toggleAddon, getAddon, getPage, tabs, latestAddons,
    studioUrl, openStudio, closeStudio]);

  return (
    <AddonContext.Provider value={value}>
      {children}
      {studioOpen && <StudioTipModal url={studioUrl} onClose={closeStudio} />}
    </AddonContext.Provider>
  );
};

export const useAddons = (): AddonContextType => {
  const ctx = useContext(AddonContext);
  if (!ctx) throw new Error('useAddons must be used within an AddonProvider');
  return ctx;
};
