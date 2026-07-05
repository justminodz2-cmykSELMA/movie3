// ============================================================
// Addon Studio — browse, enable, create and install addons
// written in CineScript. Includes a code editor, validator,
// templates and the full language reference.
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAddons } from '../addons/AddonContext';
import { InstalledAddon } from '../addons/types';
import { buildAddonManifest } from '../addons/runtime';
import {
  NEW_ADDON_TEMPLATE, BOOKS_ADDON_SOURCE, AURORA_THEME_SOURCE,
  ANIME_HUB_SOURCE, PROVIDER_EXAMPLE_SOURCE, CINESCRIPT_DOCS,
} from '../addons/builtins';
import { useProfile } from '../contexts/ProfileContext';
import { useTranslation } from '../contexts/LanguageContext';
import * as authService from '../services/authService';

// Neutral codenames shown in the Preferred Server picker.
// Only display labels — provider ids and playback logic are untouched.
const SERVER_CODENAMES: Record<string, string> = {
  vsembed: 'Nova V1',
  moviebox: 'Blaze V2',
  veloratv: 'Orion V3',
  akwam: 'Zen V4',
  aflam: 'Pulse V5',
  'arabic-toons': 'Comet V6',
  ristoanime: 'Nebula V7',
  td: 'Titan V8',
};
const SERVER_IDS = Object.keys(SERVER_CODENAMES);

const TYPE_LABEL: Record<string, { label: string; icon: string }> = {
  theme: { label: 'Theme', icon: 'fa-solid fa-palette' },
  page: { label: 'Page / Tab', icon: 'fa-solid fa-table-columns' },
  provider: { label: 'Provider', icon: 'fa-solid fa-server' },
  mixed: { label: 'Addon', icon: 'fa-solid fa-puzzle-piece' },
};

const AddonManageCard: React.FC<{
  addon: InstalledAddon;
  highlighted: boolean;
  onToggle: () => void;
  onUninstall: () => void;
  onEdit: () => void;
  onOpen: (() => void) | null;
}> = ({ addon, highlighted, onToggle, onUninstall, onEdit, onOpen }) => {
  const { meta } = addon.manifest;
  const { t } = useTranslation();
  const typeInfo = TYPE_LABEL[meta.type] || TYPE_LABEL.mixed;
  return (
    <div
      className={`bg-[var(--surface)] rounded-2xl p-4 border transition-all duration-300 ${highlighted ? 'border-red-500 shadow-[0_0_25px_rgba(229,9,20,0.3)]' : 'border-zinc-800'} ${addon.enabled ? '' : 'opacity-60'}`}
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
          </div>
          <p className="text-[11px] text-zinc-500 mt-0.5">v{meta.version} • {meta.author}</p>
          <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{meta.description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-4 flex-wrap">
        <button onClick={onToggle} className={`px-3 py-1.5 rounded-lg text-xs font-bold focusable btn-press ${addon.enabled ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'bg-green-600 text-white hover:bg-green-500'}`}>
          <i className={`fa-solid ${addon.enabled ? 'fa-power-off' : 'fa-play'} mr-1`} />
          {addon.enabled ? t('disable') : t('enable')}
        </button>
        {onOpen && addon.enabled && (
          <button onClick={onOpen} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-black hover:bg-zinc-200 focusable btn-press">
            <i className="fa-solid fa-arrow-up-right-from-square mr-1" />{t('open')}
          </button>
        )}
        <button onClick={onEdit} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-zinc-800 text-zinc-300 hover:bg-zinc-700 focusable btn-press">
          <i className="fa-solid fa-code mr-1" />{t('editCode')}
        </button>
        <button onClick={onUninstall} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-950 text-red-400 hover:bg-red-900 focusable btn-press">
          <i className="fa-solid fa-trash mr-1" />{t('uninstall')}
        </button>
      </div>
    </div>
  );
};

// ---------- Account card (read-only info + password reveal) ----------
const AccountCard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [authUser, setAuthUser] = useState<authService.AuthUser | null>(authService.getCachedUser());
  const [showPass, setShowPass] = useState(false);

  React.useEffect(() => {
    authService.fetchMe().then(setAuthUser).catch(() => {});
  }, []);

  let passMemo: string | null = null;
  try { passMemo = localStorage.getItem('cineAuthPassMemo'); } catch {}

  if (!authUser) {
    return (
      <div className="bg-[var(--surface)] rounded-2xl p-5 border border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <i className="fa-solid fa-user text-xl text-zinc-500" />
          <p className="text-sm text-zinc-400">{t('accountSection')}</p>
        </div>
        <button onClick={() => navigate('/login')} className="px-4 py-1.5 text-sm font-bold text-white bg-red-600 hover:bg-red-500 rounded-lg focusable btn-press">
          Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[var(--surface)] rounded-2xl p-5 border border-zinc-800">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 rounded-full bg-red-600/10 border border-red-600/30 flex items-center justify-center flex-shrink-0">
            <i className="fa-solid fa-user text-xl text-red-500" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-white truncate">{authUser.username}</h3>
            <p className="text-[11px] text-zinc-500">
              {authUser.role === 'admin' ? 'Administrator' : 'Member'}
              {authUser.createdAt ? ` • ${t('memberSince')} ${new Date(authUser.createdAt).toLocaleDateString()}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {authUser.role === 'admin' && (
            <button onClick={() => navigate('/admin')} className="px-3 py-1.5 rounded-lg text-xs font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 focusable btn-press">
              <i className="fa-solid fa-shield-halved mr-1" />Admin
            </button>
          )}
          <button
            onClick={async () => { await authService.logout(); setAuthUser(null); }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-400 bg-red-500/10 hover:bg-red-500/20 focusable btn-press"
          >
            <i className="fa-solid fa-right-from-bracket mr-1" />Log Out
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
        <div className="bg-black/30 border border-zinc-800 rounded-xl px-4 py-3">
          <p className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">{t('usernameLabel')}</p>
          <p className="text-sm text-white font-mono mt-1 truncate" dir="ltr">{authUser.username}</p>
        </div>
        <div className="bg-black/30 border border-zinc-800 rounded-xl px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">{t('passwordLabel')}</p>
            {passMemo && (
              <button onClick={() => setShowPass(s => !s)} className="text-zinc-400 hover:text-white focusable px-2" aria-label="toggle password">
                <i className={`fa-solid ${showPass ? 'fa-eye-slash' : 'fa-eye'} text-xs`} />
              </button>
            )}
          </div>
          {passMemo ? (
            <p className="text-sm text-white font-mono mt-1 truncate" dir="ltr">{showPass ? passMemo : '•'.repeat(Math.min(passMemo.length, 12))}</p>
          ) : (
            <p className="text-[11px] text-zinc-500 mt-1">{t('passwordMemoHint')}</p>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------- Preferred server picker ----------
const PreferredServerCard: React.FC = () => {
  const { t } = useTranslation();
  const { getScreenSpecificData, setScreenSpecificData, setToast } = useProfile();
  const prefs: string[] = getScreenSpecificData('serverPreferences', []) || [];
  const selected = prefs.length > 0 ? prefs[0] : null;

  const choose = (id: string | null) => {
    setScreenSpecificData('serverPreferences', id ? [id] : []);
    setToast({ message: t('serverSaved'), type: 'success' });
  };

  return (
    <div className="bg-[var(--surface)] rounded-2xl p-5 border border-zinc-800">
      <div className="flex items-center gap-3 mb-1">
        <i className="fa-solid fa-server text-lg text-red-500" />
        <h3 className="font-bold text-white">{t('preferredServer')}</h3>
      </div>
      <p className="text-xs text-zinc-500 mb-4 leading-relaxed">{t('preferredServerDesc')}</p>
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => choose(null)}
          className={`px-4 py-2 rounded-full text-xs font-bold border focusable btn-press ${selected === null ? 'bg-red-600 border-red-600 text-white' : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-zinc-400'}`}
        >
          <i className="fa-solid fa-wand-magic-sparkles mr-1" />{t('serverAuto')}
        </button>
        {SERVER_IDS.map(id => (
          <button
            key={id}
            onClick={() => choose(id)}
            className={`px-4 py-2 rounded-full text-xs font-bold border focusable btn-press ${selected === id ? 'bg-red-600 border-red-600 text-white' : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-zinc-400'}`}
          >
            {SERVER_CODENAMES[id]}
          </button>
        ))}
      </div>
    </div>
  );
};

const AddonsPage: React.FC = () => {
  const { addons, installAddon, uninstallAddon, toggleAddon } = useAddons();
  const { setToast } = useProfile();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const focusAddonId: string | undefined = (location.state as any)?.focusAddonId;

  const [code, setCode] = useState<string>(NEW_ADDON_TEMPLATE);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string; logs?: string[] } | null>(null);
  const [showDocs, setShowDocs] = useState(false);

  const templates = useMemo(() => ([
    { name: t('templateNew'), icon: 'fa-solid fa-wand-magic-sparkles', source: NEW_ADDON_TEMPLATE },
    { name: 'Books Tab', icon: 'fa-solid fa-book-open', source: BOOKS_ADDON_SOURCE },
    { name: 'Theme', icon: 'fa-solid fa-palette', source: AURORA_THEME_SOURCE },
    { name: 'Anime Tab', icon: 'fa-solid fa-dragon', source: ANIME_HUB_SOURCE },
    { name: 'Provider', icon: 'fa-solid fa-server', source: PROVIDER_EXAMPLE_SOURCE },
  ]), [t]);

  const handleValidate = useCallback(async (install: boolean) => {
    setBusy(true);
    setStatus(null);
    try {
      if (install) {
        const installed = await installAddon(code);
        setStatus({ kind: 'ok', text: `${t('addonInstalled')}: ${installed.manifest.meta.name}` });
        setToast({ message: `${t('addonInstalled')}: ${installed.manifest.meta.name}`, type: 'success' });
      } else {
        const { manifest, logs } = await buildAddonManifest(code);
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
  }, [code, installAddon, setToast, t]);

  return (
    <Layout>
      <div className="px-4 md:px-10 pt-24 pb-20 min-h-screen">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-14 h-14 rounded-2xl bg-red-600/10 border border-red-600/30 flex items-center justify-center">
            <i className="fa-solid fa-gear text-2xl text-red-500" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white">{t('settingsHubTitle')}</h1>
            <p className="text-sm text-zinc-400">{t('settingsHubSubtitle')}</p>
          </div>
        </div>

        {/* -------- General settings: account + preferred server -------- */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-8">
          <AccountCard />
          <PreferredServerCard />
        </div>

        {/* -------- Addons section -------- */}
        <div className="flex items-center gap-3 mt-10 mb-2">
          <div className="w-10 h-10 rounded-xl bg-red-600/10 border border-red-600/30 flex items-center justify-center">
            <i className="fa-solid fa-puzzle-piece text-lg text-red-500" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-white">{t('addonStudio')}</h2>
            <p className="text-xs text-zinc-400">{t('addonStudioSubtitle')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mt-6">
          {/* -------- Installed addons -------- */}
          <section>
            <h2 className="text-lg font-bold text-white mb-4">
              <i className="fa-solid fa-box-open mr-2 text-zinc-500" />{t('myAddons')} ({addons.length})
            </h2>
            <div className="space-y-4">
              {addons.length === 0 && (
                <p className="text-zinc-500 text-sm py-8 text-center">{t('noAddons')}</p>
              )}
              {addons.map((addon) => {
                const firstPage = addon.manifest.pages[0];
                return (
                  <AddonManageCard
                    key={addon.manifest.meta.id}
                    addon={addon}
                    highlighted={focusAddonId === addon.manifest.meta.id}
                    onToggle={() => toggleAddon(addon.manifest.meta.id)}
                    onUninstall={() => {
                      uninstallAddon(addon.manifest.meta.id);
                      setToast({ message: `${t('addonRemoved')}: ${addon.manifest.meta.name}`, type: 'info' });
                    }}
                    onEdit={() => {
                      setCode(addon.source);
                      setStatus(null);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    onOpen={firstPage ? () => navigate(`/addon/${addon.manifest.meta.id}/${firstPage.id}`) : null}
                  />
                );
              })}
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
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-zinc-800 text-zinc-300 hover:bg-zinc-700 focusable btn-press"
              >
                <i className="fa-solid fa-book mr-1" />{showDocs ? t('hideDocs') : t('showDocs')}
              </button>
            </div>

            <div className="flex gap-2 mb-3 flex-wrap">
              {templates.map(tpl => (
                <button
                  key={tpl.name}
                  onClick={() => { setCode(tpl.source); setStatus(null); }}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-zinc-900 border border-zinc-700 text-zinc-300 hover:border-zinc-400 hover:text-white focusable btn-press"
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
              className="w-full h-96 bg-black/70 border border-zinc-700 rounded-xl p-4 font-mono text-[13px] leading-relaxed text-green-300 focus:border-red-600 focus:outline-none resize-y focusable"
              placeholder="// Write your CineScript addon here..."
            />

            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <button
                onClick={() => handleValidate(false)}
                disabled={busy}
                className="px-5 py-2.5 rounded-lg font-bold text-sm bg-zinc-800 text-white hover:bg-zinc-700 disabled:opacity-50 focusable btn-press"
              >
                <i className="fa-solid fa-vial mr-2" />{busy ? '...' : t('validate')}
              </button>
              <button
                onClick={() => handleValidate(true)}
                disabled={busy}
                className="px-5 py-2.5 rounded-lg font-bold text-sm bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 focusable btn-press"
              >
                <i className="fa-solid fa-download mr-2" />{busy ? '...' : t('installAddon')}
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
      </div>
    </Layout>
  );
};

export default AddonsPage;
