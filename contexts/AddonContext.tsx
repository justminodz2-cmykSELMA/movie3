import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import {
  InstalledAddon,
  AddonProviderDef,
  parseCineScript,
  BUILTIN_ADDON_CODES,
} from '../services/addonEngine';

const LS_KEY = 'cinestream_addons_v1';
const LS_THEME_KEY = 'cinestream_active_theme_addon';

interface AddonContextType {
  addons: InstalledAddon[];
  /** newest first */
  latestAddons: InstalledAddon[];
  pageAddons: InstalledAddon[];
  providerDefs: AddonProviderDef[];
  activeThemeAddonId: string | null;
  installAddon: (code: string) => { ok: boolean; error?: string; addon?: InstalledAddon };
  updateAddon: (id: string, code: string) => { ok: boolean; error?: string };
  removeAddon: (id: string) => void;
  toggleAddon: (id: string) => void;
  applyThemeAddon: (id: string | null) => void;
  getAddonByRoute: (route: string) => InstalledAddon | undefined;
}

const AddonContext = createContext<AddonContextType | undefined>(undefined);

const readStored = (): InstalledAddon[] => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as InstalledAddon[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Addon storage read failed:', e);
  }
  return [];
};

const seedBuiltIns = (existing: InstalledAddon[]): InstalledAddon[] => {
  const result = [...existing];
  BUILTIN_ADDON_CODES.forEach(({ id, code }, idx) => {
    if (result.some((a) => a.id === id)) return;
    const parsed = parseCineScript(code);
    if (parsed.ok && parsed.manifest) {
      result.push({
        id,
        code,
        manifest: parsed.manifest,
        enabled: true,
        builtIn: true,
        // Stagger timestamps so "latest" ordering is stable for built-ins
        installedAt: Date.now() - (BUILTIN_ADDON_CODES.length - idx) * 1000,
      });
    }
  });
  return result;
};

const DEFAULT_THEME_TOKENS: Record<string, string> = {
  background: '#100c0a',
  surface: '#1c1613',
  primary: '#E50914',
  secondary: '#e50914',
  'text-light': '#fefefe',
  'text-dark': '#b3b3b3',
  border: '#3f2d21',
  danger: '#ef4444',
};

const applyTokens = (tokens: Record<string, string>) => {
  const root = document.documentElement;
  Object.entries(DEFAULT_THEME_TOKENS).forEach(([name, def]) => {
    root.style.setProperty(`--${name}`, tokens[name] || def);
  });
};

export const AddonProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [addons, setAddons] = useState<InstalledAddon[]>(() => seedBuiltIns(readStored()));
  const [activeThemeAddonId, setActiveThemeAddonId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LS_THEME_KEY);
    } catch {
      return null;
    }
  });

  // Persist
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(addons));
    } catch (e) {
      console.error('Addon storage write failed:', e);
    }
  }, [addons]);

  // Apply / clear active theme addon
  useEffect(() => {
    const themeAddon = activeThemeAddonId
      ? addons.find(
          (a) => a.id === activeThemeAddonId && a.enabled && a.manifest.type === 'theme',
        )
      : undefined;
    if (themeAddon?.manifest.theme) {
      applyTokens(themeAddon.manifest.theme.tokens);
    } else {
      applyTokens({});
    }
    try {
      if (activeThemeAddonId) localStorage.setItem(LS_THEME_KEY, activeThemeAddonId);
      else localStorage.removeItem(LS_THEME_KEY);
    } catch {
      /* ignore */
    }
  }, [activeThemeAddonId, addons]);

  const installAddon = useCallback(
    (code: string): { ok: boolean; error?: string; addon?: InstalledAddon } => {
      const parsed = parseCineScript(code);
      if (!parsed.ok || !parsed.manifest) {
        return {
          ok: false,
          error: parsed.errors.map((e) => `Line ${e.line}: ${e.message}`).join('\n'),
        };
      }
      const manifest = parsed.manifest;
      // route collision check for page addons
      if (manifest.type === 'page' && manifest.page) {
        const clash = addons.find(
          (a) =>
            a.manifest.type === 'page' &&
            a.manifest.page?.route === manifest.page?.route,
        );
        if (clash) {
          return {
            ok: false,
            error: `Route "${manifest.page.route}" is already used by addon "${clash.manifest.name}". Choose another route.`,
          };
        }
      }
      const addon: InstalledAddon = {
        id: `addon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        code,
        manifest,
        enabled: true,
        installedAt: Date.now(),
      };
      setAddons((prev) => [...prev, addon]);
      return { ok: true, addon };
    },
    [addons],
  );

  const updateAddon = useCallback(
    (id: string, code: string): { ok: boolean; error?: string } => {
      const parsed = parseCineScript(code);
      if (!parsed.ok || !parsed.manifest) {
        return {
          ok: false,
          error: parsed.errors.map((e) => `Line ${e.line}: ${e.message}`).join('\n'),
        };
      }
      const manifest = parsed.manifest;
      if (manifest.type === 'page' && manifest.page) {
        const clash = addons.find(
          (a) =>
            a.id !== id &&
            a.manifest.type === 'page' &&
            a.manifest.page?.route === manifest.page?.route,
        );
        if (clash) {
          return {
            ok: false,
            error: `Route "${manifest.page.route}" is already used by addon "${clash.manifest.name}".`,
          };
        }
      }
      setAddons((prev) =>
        prev.map((a) => (a.id === id ? { ...a, code, manifest } : a)),
      );
      return { ok: true };
    },
    [addons],
  );

  const removeAddon = useCallback((id: string) => {
    setAddons((prev) => prev.filter((a) => a.id !== id));
    setActiveThemeAddonId((prev) => (prev === id ? null : prev));
  }, []);

  const toggleAddon = useCallback((id: string) => {
    setAddons((prev) =>
      prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)),
    );
    setActiveThemeAddonId((prev) => (prev === id ? null : prev));
  }, []);

  const applyThemeAddon = useCallback((id: string | null) => {
    setActiveThemeAddonId(id);
  }, []);

  const getAddonByRoute = useCallback(
    (route: string) =>
      addons.find(
        (a) =>
          a.enabled &&
          a.manifest.type === 'page' &&
          a.manifest.page?.route === route,
      ),
    [addons],
  );

  const latestAddons = useMemo(
    () => [...addons].sort((a, b) => b.installedAt - a.installedAt),
    [addons],
  );

  const pageAddons = useMemo(
    () => addons.filter((a) => a.enabled && a.manifest.type === 'page' && a.manifest.page),
    [addons],
  );

  const providerDefs = useMemo(
    () =>
      addons
        .filter((a) => a.enabled && a.manifest.type === 'provider' && a.manifest.provider)
        .map((a) => a.manifest.provider as AddonProviderDef),
    [addons],
  );

  const value = useMemo(
    () => ({
      addons,
      latestAddons,
      pageAddons,
      providerDefs,
      activeThemeAddonId,
      installAddon,
      updateAddon,
      removeAddon,
      toggleAddon,
      applyThemeAddon,
      getAddonByRoute,
    }),
    [
      addons,
      latestAddons,
      pageAddons,
      providerDefs,
      activeThemeAddonId,
      installAddon,
      updateAddon,
      removeAddon,
      toggleAddon,
      applyThemeAddon,
      getAddonByRoute,
    ],
  );

  return <AddonContext.Provider value={value}>{children}</AddonContext.Provider>;
};

export const useAddons = (): AddonContextType => {
  const ctx = useContext(AddonContext);
  if (!ctx) throw new Error('useAddons must be used within an AddonProvider');
  return ctx;
};
