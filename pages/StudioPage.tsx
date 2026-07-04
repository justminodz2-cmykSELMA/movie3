// ============================================================
// StudioPage — the user's personal Addon Studio, opened on a
// PC via their private link (/studio/:stoken). One page with
// everything addon-related: installed addons, editor, templates
// and docs. Every change is saved to the user's account and
// appears on the TV home screen automatically within seconds.
//
// Strictly neutral scope: this page manages ONLY the user's
// addons — it can never touch accounts or any other data.
// ============================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { InstalledAddon } from '../addons/types';
import { buildAddonManifest } from '../addons/runtime';
import {
  NEW_ADDON_TEMPLATE, BOOKS_ADDON_SOURCE, AURORA_THEME_SOURCE,
  ANIME_HUB_SOURCE, PROVIDER_EXAMPLE_SOURCE, CINESCRIPT_DOCS,
} from '../addons/builtins';
import { fetchStudioAddons, saveStudioAddons } from '../services/studioService';
import { useTranslation } from '../contexts/LanguageContext';

const TYPE_LABEL: Record<string, { label: string; icon: string }> = {
  theme: { label: 'Theme', icon: 'fa-solid fa-palette' },
  page: { label: 'Page / Tab', icon: 'fa-solid fa-table-columns' },
  provider: { label: 'Provider', icon: 'fa-solid fa-server' },
  mixed: { label: 'Addon', icon: 'fa-solid fa-puzzle-piece' },
};

const StudioAddonCard: React.FC<{
  addon: InstalledAddon;
  editing: boolean;
  onToggle: () => void;
  onUninstall: () => void;
  onEdit: () => void;
}> = ({ addon, editing, onToggle, onUninstall, onEdit }) => {
  const { meta } = addon.manifest;
  const { t } = useTranslation();
  const typeInfo = TYPE_LABEL[meta.type] || TYPE_LABEL.mixed;
  return (
    <div
      className={`bg-zinc-900/80 rounded-2xl p-4 border transition-all duration-300 ${editing ? 'border-red-500 shadow-[0_0_25px_rgba(229,9,20,0.25)]' : 'border-zinc-800 hover:border-zinc-700'} ${addon.enabled ? '' : 'opacity-60'}`}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: `radial-gradient(circle at 30% 25%, ${meta.color}33 0%, #18181b 100%)`, border: `1px solid ${meta.color}55` }}
        >
          <i className={`${meta.icon} text-xl`} style={{ color: meta.color }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-white truncate">{meta.name}</h3>
            <span className="text-[9px] font-bold tracking-widest px-2 py-0.5 rounded-full border"
                  style={{ color: meta.color, borderColor: `${meta.color}55`, backgroundColor: `${meta.color}14` }}>
              <i className={`${typeInfo.icon} mr-1`} />{typeInfo.label.toUpperCase()}
            </span>
            {addon.builtin && <span className="text-[9px] font-bold tracking-widest px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">BUILT-IN</span>}
            {!addon.enabled && <span className="text-[9px] font-bold tracking-widest px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500">OFF</span>}
          </div>
          <p className="text-[11px] text-zinc-500 mt-0.5">v{meta.version} • {meta.author}</p>
          <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{meta.description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-4 flex-wrap">
        <button onClick={onToggle} className={`px-3 py-1.5 rounded-lg text-xs font-bold btn-press ${addon.enabled ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'bg-green-600 text-white hover:bg-green-500'}`}>
          <i className={`fa-solid ${addon.enabled ? 'fa-power-off' : 'fa-play'} mr-1`} />
          {addon.enabled ? t('disable') : t('enable')}
        </button>
        <button onClick={onEdit} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-zinc-800 text-zinc-300 hover:bg-zinc-700 btn-press">
          <i className="fa-solid fa-code mr-1" />{t('editCode')}
        </button>
        <button onClick={onUninstall} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-950 text-red-400 hover:bg-red-900 btn-press">
          <i className="fa-solid fa-trash mr-1" />{t('uninstall')}
        </button>
      </div>
    </div>
  );
};

const StudioPage: React.FC = () => {
  const { stoken } = useParams<{ stoken: string }>();
  const { t } = useTranslation();

  const [addons, setAddons] = useState<InstalledAddon[]>([]);
  const [profileName, setProfileName] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [linkError, setLinkError] = useState(false);
  const [code, setCode] = useState<string>(NEW_ADDON_TEMPLATE);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string; logs?: string[] } | null>(null);
  const [showDocs, setShowDocs] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const revRef = useRef(0);
  const savingRef = useRef(false);
  const addonsRef = useRef<InstalledAddon[]>([]);
  useEffect(() => { addonsRef.current = addons; }, [addons]);

  const templates = useMemo(() => ([
    { name: t('templateNew'), icon: 'fa-solid fa-wand-magic-sparkles', source: NEW_ADDON_TEMPLATE },
    { name: 'Books Tab', icon: 'fa-solid fa-book-open', source: BOOKS_ADDON_SOURCE },
    { name: 'Theme', icon: 'fa-solid fa-palette', source: AURORA_THEME_SOURCE },
    { name: 'Anime Tab', icon: 'fa-solid fa-dragon', source: ANIME_HUB_SOURCE },
    { name: 'Provider', icon: 'fa-solid fa-server', source: PROVIDER_EXAMPLE_SOURCE },
  ]), [t]);

  // Initial load + light polling so TV-side changes appear here too.
  useEffect(() => {
    if (!stoken) { setLinkError(true); setLoading(false); return; }
    let stopped = false;
    const load = async (initial = false) => {
      if (savingRef.current) return;
      try {
        const data = await fetchStudioAddons(stoken);
        if (stopped) return;
        if (initial || data.rev > revRef.current) {
          revRef.current = data.rev || 0;
          setAddons(Array.isArray(data.addons) ? data.addons : []);
          setProfileName(data.profileName || '');
          setUsername(data.username || '');
        }
        setLoading(false);
      } catch (e: any) {
        if (stopped) return;
        if (initial) { setLinkError(true); setLoading(false); }
      }
    };
    load(true);
    const interval = window.setInterval(() => load(), 8000);
    return () => { stopped = true; clearInterval(interval); };
  }, [stoken]);

  // Persist a new addon list to the account (→ TV updates automatically).
  const mutate = useCallback(async (next: InstalledAddon[]) => {
    setAddons(next);
    if (!stoken) return;
    savingRef.current = true;
    try {
      const rev = await saveStudioAddons(stoken, next);
      revRef.current = rev;
      setSavedAt(Date.now());
    } catch (e: any) {
      setStatus({ kind: 'error', text: e?.message || 'Failed to save' });
    } finally {
      savingRef.current = false;
    }
  }, [stoken]);

  const handleToggle = useCallback((id: string) => {
    mutate(addonsRef.current.map(a => a.manifest.meta.id === id
      ? { ...a, enabled: !a.enabled, updatedAt: Date.now() }
      : a));
  }, [mutate]);

  const handleUninstall = useCallback((id: string) => {
    mutate(addonsRef.current.filter(a => a.manifest.meta.id !== id));
    if (editingId === id) setEditingId(null);
  }, [mutate, editingId]);

  const handleEdit = useCallback((addon: InstalledAddon) => {
    setCode(addon.source);
    setEditingId(addon.manifest.meta.id);
    setStatus(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleValidate = useCallback(async (install: boolean) => {
    setBusy(true);
    setStatus(null);
    try {
      const { manifest, logs } = await buildAddonManifest(code);
      if (install) {
        const prev = addonsRef.current;
        const existing = prev.find(a => a.manifest.meta.id === manifest.meta.id);
        const rec: InstalledAddon = {
          source: code,
          manifest,
          enabled: true,
          builtin: existing?.builtin,
          installedAt: existing?.installedAt || Date.now(),
          updatedAt: Date.now(),
        };
        const next = existing
          ? prev.map(a => (a.manifest.meta.id === manifest.meta.id ? rec : a))
          : [...prev, rec];
        await mutate(next);
        setEditingId(manifest.meta.id);
        setStatus({ kind: 'ok', text: `${t('addonInstalled')}: ${manifest.meta.name} — ${t('studioSaved')}` });
      } else {
        const parts = [
          `${manifest.meta.name} v${manifest.meta.version}`,
          manifest.pages.length ? `${manifest.pages.length} page(s)` : '',
          manifest.theme ? 'theme' : '',
          manifest.providers.length ? `${manifest.providers.length} provider(s)` : '',
        ].filter(Boolean).join(' • ');
        setStatus({ kind: 'ok', text: `${t('addonValid')} — ${parts}`, logs });
      }
    } catch (e: any) {
      setStatus({ kind: 'error', text: e?.message || 'Unknown error' });
    } finally {
      setBusy(false);
    }
  }, [code, mutate, t]);

  // ---- Invalid / expired link ----
  if (!loading && linkError) {
    return (
      <div className="min-h-screen bg-[#0a0a0c] text-white flex items-center justify-center px-6">
        <div className="max-w-md w-full bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 text-center">
          <i className="fa-solid fa-link-slash text-4xl text-zinc-600 mb-4" />
          <h1 className="text-xl font-extrabold mb-2">{t('addonStudio')}</h1>
          <p className="text-sm text-zinc-400 leading-relaxed">{t('studioLinkInvalid')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white">
      {/* ---- Top bar ---- */}
      <header className="sticky top-0 z-40 bg-black/80 backdrop-blur-md border-b border-zinc-800/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-4">
          <img
            src="https://i.ibb.co/Vc2jxqRR/Chat-GPT-Image-Jul-1-2026-01-37-52-PM.png"
            alt="Logo"
            className="w-10 h-10 object-contain"
          />
          <div className="min-w-0">
            <h1 className="text-base md:text-lg font-extrabold leading-tight truncate">
              <i className="fa-solid fa-puzzle-piece text-red-600 mr-2" />{t('addonStudio')}
            </h1>
            {(profileName || username) && (
              <p className="text-[11px] text-zinc-500 truncate">
                {t('studioForProfile')}: <span className="text-zinc-300 font-semibold">{profileName || username}</span>
                {username && profileName ? ` • ${username}` : ''}
              </p>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3">
            {savedAt && (
              <span className="hidden sm:inline text-[11px] text-emerald-400 font-semibold">
                <i className="fa-solid fa-circle-check mr-1" />{t('studioSaved')}
              </span>
            )}
            <span className="inline-flex items-center gap-2 text-[11px] font-bold tracking-wide px-3 py-1.5 rounded-full border border-emerald-700/60 bg-emerald-950/40 text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              {t('studioLiveBadge')}
            </span>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center h-[60vh]">
          <div className="w-14 h-14 border-4 border-t-transparent border-red-600 rounded-full animate-spin" />
        </div>
      ) : (
        <main className="max-w-7xl mx-auto px-6 py-8">
          {/* Sync note */}
          <div className="mb-8 rounded-2xl border border-zinc-800 bg-gradient-to-r from-zinc-900/90 to-zinc-900/40 p-5 flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-zinc-800/90 border border-zinc-700 flex items-center justify-center flex-shrink-0">
              <i className="fa-solid fa-tv text-zinc-300" />
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed">{t('studioSyncNote')}</p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            {/* -------- Installed addons -------- */}
            <section>
              <h2 className="text-lg font-bold text-white mb-4">
                <i className="fa-solid fa-box-open mr-2 text-zinc-500" />{t('myAddons')} ({addons.length})
              </h2>
              <div className="space-y-4">
                {addons.length === 0 && (
                  <p className="text-zinc-500 text-sm py-8 text-center">{t('noAddons')}</p>
                )}
                {addons.map((addon) => (
                  <StudioAddonCard
                    key={addon.manifest.meta.id}
                    addon={addon}
                    editing={editingId === addon.manifest.meta.id}
                    onToggle={() => handleToggle(addon.manifest.meta.id)}
                    onUninstall={() => handleUninstall(addon.manifest.meta.id)}
                    onEdit={() => handleEdit(addon)}
                  />
                ))}
              </div>
            </section>

            {/* -------- Code editor -------- */}
            <section>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2 className="text-lg font-bold text-white">
                  <i className="fa-solid fa-code mr-2 text-zinc-500" />{t('createAddon')}
                </h2>
                <button
                  onClick={() => setShowDocs(s => !s)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-zinc-800 text-zinc-300 hover:bg-zinc-700 btn-press"
                >
                  <i className="fa-solid fa-book mr-1" />{showDocs ? t('hideDocs') : t('showDocs')}
                </button>
              </div>

              <div className="flex gap-2 mb-3 flex-wrap">
                {templates.map(tpl => (
                  <button
                    key={tpl.name}
                    onClick={() => { setCode(tpl.source); setEditingId(null); setStatus(null); }}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold bg-zinc-900 border border-zinc-700 text-zinc-300 hover:border-zinc-400 hover:text-white btn-press"
                  >
                    <i className={`${tpl.icon} mr-1`} />{tpl.name}
                  </button>
                ))}
              </div>

              {showDocs && (
                <pre className="bg-black/60 border border-zinc-800 rounded-xl p-4 text-[11px] leading-relaxed text-zinc-300 overflow-x-auto mb-3 max-h-80 overflow-y-auto whitespace-pre-wrap">
                  {CINESCRIPT_DOCS}
                </pre>
              )}

              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                spellCheck={false}
                dir="ltr"
                className="w-full h-[28rem] bg-black/70 border border-zinc-700 rounded-xl p-4 font-mono text-[13px] leading-relaxed text-green-300 focus:border-red-600 focus:outline-none resize-y"
                placeholder="// Write your CineScript addon here..."
              />

              <div className="flex items-center gap-3 mt-3 flex-wrap">
                <button
                  onClick={() => handleValidate(false)}
                  disabled={busy}
                  className="px-5 py-2.5 rounded-lg font-bold text-sm bg-zinc-800 text-white hover:bg-zinc-700 disabled:opacity-50 btn-press"
                >
                  <i className="fa-solid fa-vial mr-2" />{busy ? '...' : t('validate')}
                </button>
                <button
                  onClick={() => handleValidate(true)}
                  disabled={busy}
                  className="px-5 py-2.5 rounded-lg font-bold text-sm bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 btn-press"
                >
                  <i className="fa-solid fa-cloud-arrow-up mr-2" />{busy ? '...' : t('installAddon')}
                </button>
              </div>

              {status && (
                <div className={`mt-4 rounded-xl p-4 border text-sm ${status.kind === 'ok' ? 'bg-green-950/40 border-green-800 text-green-300' : 'bg-red-950/40 border-red-800 text-red-300'}`}>
                  <i className={`fa-solid ${status.kind === 'ok' ? 'fa-circle-check' : 'fa-triangle-exclamation'} mr-2`} />
                  {status.text}
                  {status.logs && status.logs.length > 0 && (
                    <pre className="mt-2 text-[11px] text-zinc-400 whitespace-pre-wrap">{status.logs.join('\n')}</pre>
                  )}
                </div>
              )}

              <div className="mt-6 bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 text-xs text-zinc-400 leading-relaxed">
                <i className="fa-solid fa-shield-halved mr-2 text-green-500" />
                {t('addonSandboxNote')}
              </div>
            </section>
          </div>
        </main>
      )}
    </div>
  );
};

export default StudioPage;
