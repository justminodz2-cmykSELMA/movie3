import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAddons } from '../contexts/AddonContext';
import { useProfile } from '../contexts/ProfileContext';
import { useTranslation } from '../contexts/LanguageContext';
import {
  parseCineScript,
  ParseError,
  AddonManifest,
  InstalledAddon,
  CINESCRIPT_DOCS,
  previewProvider,
  AddonItem,
} from '../services/addonEngine';

/* ------------------------------------------------------------------ */
/* Starter templates                                                   */
/* ------------------------------------------------------------------ */

const TEMPLATES: { label: string; icon: string; code: string }[] = [
  {
    label: 'New Page / Tab',
    icon: 'fa-table-columns',
    code: `addon "My New Tab"
version "1.0"
author "Me"
description "A brand new page with content rows."
icon fa-star
color #10b981
type page

page {
  title "My Tab"
  route my-tab
  icon fa-star
  hero "My New World"
  hero-subtitle "Anything you can imagine, in rows."

  row "Popular Movies" {
    source tmdb discover/movie sort_by=popularity.desc
    shape card
    limit 20
  }

  row "My Hand-Picked List" {
    item "First Item"
    image "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&q=80"
    subtitle "Anything you want"
  }
}
`,
  },
  {
    label: 'New Theme',
    icon: 'fa-palette',
    code: `addon "My Theme"
version "1.0"
author "Me"
description "A fresh coat of paint for the whole app."
icon fa-palette
color #10b981
type theme

theme {
  background #06140a
  surface #0d2415
  primary #10b981
  secondary #059669
  text-light #f0fdf4
  text-dark #86aa96
  border #1d4530
  danger #ef4444
}
`,
  },
  {
    label: 'New Provider',
    icon: 'fa-plug',
    code: `addon "My Provider"
version "1.0"
author "Me"
description "Registers an external JSON API as a content source."
icon fa-plug
color #f59e0b
type provider

provider {
  name "My Source"
  url "https://api.jikan.moe/v4/top/manga?limit=20"
  path data
  map title "title"
  map image "images.jpg.large_image_url"
  map subtitle "{type} - Score {score}"
  map link "url"
  limit 20
}
`,
  },
];

const TYPE_META: Record<string, { label: string; icon: string; desc: string }> = {
  theme: { label: 'Theme', icon: 'fa-palette', desc: 'Re-skins the entire app' },
  page: { label: 'Page', icon: 'fa-table-columns', desc: 'Adds a new tab & page' },
  provider: { label: 'Provider', icon: 'fa-plug', desc: 'Adds a content source' },
};

/* ------------------------------------------------------------------ */
/* Code editor with line numbers + inline errors                       */
/* ------------------------------------------------------------------ */

const CodeEditor: React.FC<{
  code: string;
  onChange: (code: string) => void;
  errors: ParseError[];
}> = ({ code, onChange, errors }) => {
  const lineCount = code.split('\n').length;
  const errorLines = useMemo(() => new Set(errors.map((e) => e.line)), [errors]);
  const gutterRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const syncScroll = () => {
    if (gutterRef.current && taRef.current) {
      gutterRef.current.scrollTop = taRef.current.scrollTop;
    }
  };

  return (
    <div className="flex rounded-lg overflow-hidden border border-[var(--border)] bg-black/60 font-mono text-sm">
      <div
        ref={gutterRef}
        className="flex-shrink-0 w-12 py-3 text-right pr-2 select-none overflow-hidden bg-black/40 text-zinc-600 leading-6"
        aria-hidden="true"
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div
            key={i}
            className={errorLines.has(i + 1) ? 'text-red-500 font-bold' : ''}
          >
            {i + 1}
          </div>
        ))}
      </div>
      <textarea
        ref={taRef}
        value={code}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        spellCheck={false}
        aria-label="CineScript code editor"
        className="flex-1 bg-transparent text-emerald-100 outline-none resize-none p-3 leading-6 min-h-[420px] focusable"
        style={{ tabSize: 2 }}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Addon card in the manage grid                                       */
/* ------------------------------------------------------------------ */

const AddonManageCard: React.FC<{
  addon: InstalledAddon;
  isActiveTheme: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onApplyTheme: () => void;
}> = ({ addon, isActiveTheme, onOpen, onEdit, onToggle, onDelete, onApplyTheme }) => {
  const m = addon.manifest;
  const meta = TYPE_META[m.type];

  return (
    <div
      className={`rounded-xl border bg-[var(--surface)]/80 p-5 flex flex-col gap-4 transition-all duration-300 ${
        addon.enabled ? 'border-[var(--border)]' : 'border-zinc-800 opacity-60'
      }`}
    >
      <div className="flex items-start gap-4">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-2xl flex-shrink-0 border-2"
          style={{
            color: m.color,
            borderColor: `${m.color}55`,
            backgroundColor: `${m.color}18`,
          }}
        >
          <i className={`fa-solid ${m.icon}`}></i>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-white truncate">{m.name}</h3>
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-black/40 text-zinc-300 border border-zinc-700">
              {meta.label}
            </span>
            {addon.builtIn && (
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-black/40 text-amber-400 border border-amber-800/50">
                Official
              </span>
            )}
            {isActiveTheme && (
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                Active
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{m.description || meta.desc}</p>
          <p className="text-[11px] text-zinc-500 mt-1">
            v{m.version} • {m.author}
            {m.type === 'page' && m.page ? ` • /addon/${m.page.route}` : ''}
            {m.type === 'provider' && m.provider ? ` • "${m.provider.name}"` : ''}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-auto">
        {m.type === 'page' && addon.enabled && (
          <button
            onClick={onOpen}
            className="focusable btn-press px-3 py-1.5 rounded-md text-xs font-bold bg-white text-black hover:bg-zinc-200"
          >
            <i className="fa-solid fa-arrow-up-right-from-square mr-1.5"></i>Open
          </button>
        )}
        {m.type === 'theme' && addon.enabled && (
          <button
            onClick={onApplyTheme}
            className={`focusable btn-press px-3 py-1.5 rounded-md text-xs font-bold ${
              isActiveTheme
                ? 'bg-zinc-800 text-zinc-300 border border-zinc-600'
                : 'bg-white text-black hover:bg-zinc-200'
            }`}
          >
            <i className={`fa-solid ${isActiveTheme ? 'fa-rotate-left' : 'fa-wand-magic-sparkles'} mr-1.5`}></i>
            {isActiveTheme ? 'Revert' : 'Apply'}
          </button>
        )}
        <button
          onClick={onEdit}
          className="focusable btn-press px-3 py-1.5 rounded-md text-xs font-bold bg-zinc-800 text-white border border-zinc-700 hover:border-zinc-500"
        >
          <i className="fa-solid fa-code mr-1.5"></i>Edit Code
        </button>
        <button
          onClick={onToggle}
          className="focusable btn-press px-3 py-1.5 rounded-md text-xs font-bold bg-zinc-800 text-white border border-zinc-700 hover:border-zinc-500"
        >
          <i className={`fa-solid ${addon.enabled ? 'fa-toggle-on text-emerald-400' : 'fa-toggle-off'} mr-1.5`}></i>
          {addon.enabled ? 'Disable' : 'Enable'}
        </button>
        {!addon.builtIn && (
          <button
            onClick={onDelete}
            className="focusable btn-press px-3 py-1.5 rounded-md text-xs font-bold bg-red-950/60 text-red-400 border border-red-900 hover:border-red-600"
          >
            <i className="fa-solid fa-trash mr-1.5"></i>Delete
          </button>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Manifest live preview                                               */
/* ------------------------------------------------------------------ */

const ManifestPreview: React.FC<{ manifest: AddonManifest }> = ({ manifest }) => {
  const [providerItems, setProviderItems] = useState<AddonItem[] | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const testProvider = useCallback(async () => {
    if (!manifest.provider) return;
    setTesting(true);
    setProviderError(null);
    setProviderItems(null);
    try {
      const items = await previewProvider(manifest.provider);
      setProviderItems(items);
    } catch (e: any) {
      setProviderError(e?.message || 'Provider test failed');
    } finally {
      setTesting(false);
    }
  }, [manifest.provider]);

  return (
    <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-xl border-2"
          style={{
            color: manifest.color,
            borderColor: `${manifest.color}55`,
            backgroundColor: `${manifest.color}18`,
          }}
        >
          <i className={`fa-solid ${manifest.icon}`}></i>
        </div>
        <div>
          <p className="font-bold text-white">
            {manifest.name}{' '}
            <span className="text-xs font-normal text-zinc-400">v{manifest.version}</span>
          </p>
          <p className="text-xs text-emerald-400 uppercase tracking-widest font-bold">
            {TYPE_META[manifest.type].label} • Valid CineScript
          </p>
        </div>
      </div>
      {manifest.type === 'page' && manifest.page && (
        <p className="text-xs text-zinc-300">
          Adds page <span className="text-white font-mono">/addon/{manifest.page.route}</span> with{' '}
          <span className="text-white font-bold">{manifest.page.rows.length}</span> row(s):{' '}
          {manifest.page.rows.map((r) => r.title).join(', ')}
        </p>
      )}
      {manifest.type === 'theme' && manifest.theme && (
        <div className="flex items-center gap-2 flex-wrap">
          {Object.entries(manifest.theme.tokens).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5 text-[11px] text-zinc-300">
              <span
                className="w-4 h-4 rounded-full border border-white/20 inline-block"
                style={{ backgroundColor: v }}
              ></span>
              {k}
            </div>
          ))}
        </div>
      )}
      {manifest.type === 'provider' && manifest.provider && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-zinc-300">
            Registers provider <span className="text-white font-bold">&quot;{manifest.provider.name}&quot;</span>{' '}
            — pages can use it via{' '}
            <span className="font-mono text-emerald-300">source provider &quot;{manifest.provider.name}&quot;</span>
          </p>
          <button
            onClick={testProvider}
            disabled={testing}
            className="focusable btn-press self-start px-3 py-1.5 rounded-md text-xs font-bold bg-zinc-800 text-white border border-zinc-700 hover:border-zinc-500 disabled:opacity-50"
          >
            <i className={`fa-solid ${testing ? 'fa-spinner fa-spin' : 'fa-vial'} mr-1.5`}></i>
            Test Provider
          </button>
          {providerError && <p className="text-xs text-red-400">{providerError}</p>}
          {providerItems && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
              {providerItems.slice(0, 8).map((it, i) => (
                <div key={i} className="flex-shrink-0 w-20">
                  {it.image ? (
                    <img
                      src={it.image || "/placeholder.svg"}
                      alt={it.title}
                      className="w-20 h-28 object-cover rounded-md border border-zinc-800"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-20 h-28 rounded-md bg-zinc-800 flex items-center justify-center text-zinc-500">
                      <i className="fa-solid fa-image"></i>
                    </div>
                  )}
                  <p className="text-[10px] text-zinc-400 mt-1 truncate">{it.title}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Main page                                                           */
/* ------------------------------------------------------------------ */

type Tab = 'manage' | 'create' | 'docs';

const AddonsPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { setToast } = useProfile();
  const {
    addons,
    activeThemeAddonId,
    installAddon,
    updateAddon,
    removeAddon,
    toggleAddon,
    applyThemeAddon,
  } = useAddons();

  const [tab, setTab] = useState<Tab>('manage');
  const [code, setCode] = useState(TEMPLATES[0].code);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [parse, setParse] = useState(() => parseCineScript(TEMPLATES[0].code));

  // Debounced live validation
  useEffect(() => {
    const timer = setTimeout(() => setParse(parseCineScript(code)), 250);
    return () => clearTimeout(timer);
  }, [code]);

  const startEdit = useCallback((addon: InstalledAddon) => {
    setEditingId(addon.id);
    setCode(addon.code);
    setTab('create');
  }, []);

  const handleInstall = useCallback(() => {
    if (editingId) {
      const res = updateAddon(editingId, code);
      if (res.ok) {
        setToast({ message: 'Addon updated successfully', type: 'success' });
        setEditingId(null);
        setTab('manage');
      } else {
        setToast({ message: res.error || 'Update failed', type: 'error' });
      }
      return;
    }
    const res = installAddon(code);
    if (res.ok) {
      setToast({ message: `"${res.addon?.manifest.name}" installed`, type: 'success' });
      setTab('manage');
    } else {
      setToast({ message: res.error || 'Install failed', type: 'error' });
    }
  }, [editingId, code, installAddon, updateAddon, setToast]);

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'manage', label: 'My Addons', icon: 'fa-puzzle-piece' },
    { id: 'create', label: editingId ? 'Edit Addon' : 'Create Addon', icon: 'fa-code' },
    { id: 'docs', label: 'CineScript Docs', icon: 'fa-book' },
  ];

  return (
    <Layout>
      <div className="px-4 md:px-10 pt-28 pb-16 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-[var(--primary)]/15 border border-[var(--primary)]/30 flex items-center justify-center text-[var(--primary)] text-2xl">
                <i className="fa-solid fa-puzzle-piece"></i>
              </div>
              <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
                Addon Studio
              </h1>
            </div>
            <p className="text-sm text-zinc-400 max-w-2xl text-pretty">
              Extend the app with your own addons written in{' '}
              <span className="text-white font-semibold">CineScript</span> — build themes, new
              tabs with content rows, or register entirely new content providers. Safe,
              sandboxed, and yours.
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {tabs.map((tb) => (
              <button
                key={tb.id}
                onClick={() => setTab(tb.id)}
                className={`focusable btn-press px-4 py-2 rounded-full text-sm font-bold transition-all ${
                  tab === tb.id
                    ? 'bg-white text-black'
                    : 'bg-zinc-900 text-zinc-300 border border-zinc-700 hover:border-zinc-500'
                }`}
              >
                <i className={`fa-solid ${tb.icon} mr-2`}></i>
                {tb.label}
              </button>
            ))}
          </div>
        </div>

        {/* ------- MANAGE ------- */}
        {tab === 'manage' && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {addons.map((addon) => (
              <AddonManageCard
                key={addon.id}
                addon={addon}
                isActiveTheme={activeThemeAddonId === addon.id}
                onOpen={() => addon.manifest.page && navigate(`/addon/${addon.manifest.page.route}`)}
                onEdit={() => startEdit(addon)}
                onToggle={() => toggleAddon(addon.id)}
                onDelete={() => {
                  removeAddon(addon.id);
                  setToast({ message: `"${addon.manifest.name}" removed`, type: 'info' });
                }}
                onApplyTheme={() =>
                  applyThemeAddon(activeThemeAddonId === addon.id ? null : addon.id)
                }
              />
            ))}
            {/* Create new card */}
            <button
              onClick={() => {
                setEditingId(null);
                setCode(TEMPLATES[0].code);
                setTab('create');
              }}
              className="focusable rounded-xl border-2 border-dashed border-zinc-700 hover:border-zinc-400 bg-transparent p-5 flex flex-col items-center justify-center gap-3 min-h-[180px] text-zinc-400 hover:text-white transition-colors"
            >
              <div className="w-14 h-14 rounded-full border-2 border-current flex items-center justify-center text-2xl">
                <i className="fa-solid fa-plus"></i>
              </div>
              <span className="font-bold">Create New Addon</span>
              <span className="text-xs text-zinc-500">Write it in CineScript</span>
            </button>
          </div>
        )}

        {/* ------- CREATE / EDIT ------- */}
        {tab === 'create' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3 flex flex-col gap-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-zinc-500 font-bold uppercase tracking-widest mr-1">
                  Templates:
                </span>
                {TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.label}
                    onClick={() => {
                      setEditingId(null);
                      setCode(tpl.code);
                    }}
                    className="focusable btn-press px-3 py-1.5 rounded-md text-xs font-bold bg-zinc-900 text-zinc-300 border border-zinc-700 hover:border-zinc-500"
                  >
                    <i className={`fa-solid ${tpl.icon} mr-1.5`}></i>
                    {tpl.label}
                  </button>
                ))}
              </div>
              <CodeEditor code={code} onChange={setCode} errors={parse.errors} />
              <div className="flex items-center gap-3">
                <button
                  onClick={handleInstall}
                  disabled={!parse.ok}
                  className="focusable btn-press px-6 py-3 rounded-lg font-bold text-sm bg-white text-black hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <i className={`fa-solid ${editingId ? 'fa-floppy-disk' : 'fa-download'} mr-2`}></i>
                  {editingId ? 'Save Changes' : 'Install Addon'}
                </button>
                {editingId && (
                  <button
                    onClick={() => {
                      setEditingId(null);
                      setCode(TEMPLATES[0].code);
                    }}
                    className="focusable btn-press px-4 py-3 rounded-lg font-bold text-sm bg-zinc-900 text-zinc-300 border border-zinc-700"
                  >
                    {t('cancel')}
                  </button>
                )}
                <span
                  className={`text-xs font-bold ${parse.ok ? 'text-emerald-400' : 'text-red-400'}`}
                >
                  <i className={`fa-solid ${parse.ok ? 'fa-circle-check' : 'fa-circle-xmark'} mr-1.5`}></i>
                  {parse.ok ? 'Valid CineScript' : `${parse.errors.length} error(s)`}
                </span>
              </div>
            </div>

            <div className="lg:col-span-2 flex flex-col gap-4">
              {parse.ok && parse.manifest ? (
                <ManifestPreview manifest={parse.manifest} />
              ) : (
                <div className="rounded-lg border border-red-900/60 bg-red-950/20 p-4">
                  <p className="text-sm font-bold text-red-400 mb-2">
                    <i className="fa-solid fa-triangle-exclamation mr-2"></i>Fix these to install:
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {parse.errors.slice(0, 10).map((e, i) => (
                      <li key={i} className="text-xs text-red-300 font-mono">
                        Line {e.line}: {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/60 p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">
                  Quick tips
                </p>
                <ul className="text-xs text-zinc-400 flex flex-col gap-1.5 leading-relaxed">
                  <li><span className="text-white font-mono">type page</span> — new tab with rows (TMDB, any JSON API, providers, or manual items)</li>
                  <li><span className="text-white font-mono">type theme</span> — recolor the entire app with 8 design tokens</li>
                  <li><span className="text-white font-mono">type provider</span> — plug in any JSON API as a reusable content source</li>
                  <li>Use <span className="text-white font-mono">set $var = &quot;value&quot;</span> for variables and <span className="text-white font-mono">#</span> for comments</li>
                  <li>Open the <button onClick={() => setTab('docs')} className="text-emerald-400 underline focusable rounded">full language reference</button></li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ------- DOCS ------- */}
        {tab === 'docs' && (
          <div className="rounded-xl border border-[var(--border)] bg-black/50 p-6">
            <h2 className="text-xl font-bold text-white mb-4">
              <i className="fa-solid fa-book mr-2 text-emerald-400"></i>CineScript Language Reference
            </h2>
            <pre className="text-xs md:text-sm text-emerald-100/90 font-mono whitespace-pre-wrap leading-6 overflow-x-auto">
              {CINESCRIPT_DOCS}
            </pre>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default AddonsPage;
