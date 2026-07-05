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
  ANIME_HUB_SOURCE, PROVIDER_EXAMPLE_SOURCE, AI_SUBTITLES_SOURCE,
  INTRO_SKIP_AI_SOURCE, CINESCRIPT_DOCS,
} from '../addons/builtins';
import { useProfile } from '../contexts/ProfileContext';
import { useTranslation } from '../contexts/LanguageContext';

const TYPE_LABEL: Record<string, { label: string; icon: string }> = {
  theme: { label: 'Theme', icon: 'fa-solid fa-palette' },
  page: { label: 'Page / Tab', icon: 'fa-solid fa-table-columns' },
  provider: { label: 'Provider', icon: 'fa-solid fa-server' },
  player: { label: 'Player', icon: 'fa-solid fa-closed-captioning' },
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
    { name: 'AI Subtitles', icon: 'fa-solid fa-wand-magic-sparkles', source: AI_SUBTITLES_SOURCE },
    { name: 'Intro Skip', icon: 'fa-solid fa-forward-fast', source: INTRO_SKIP_AI_SOURCE },
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
            <i className="fa-solid fa-puzzle-piece text-2xl text-red-500" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white">{t('addonStudio')}</h1>
            <p className="text-sm text-zinc-400">{t('addonStudioSubtitle')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mt-8">
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
