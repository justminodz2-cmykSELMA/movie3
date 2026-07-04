// ============================================================
// AddonPage — renders a page declared by a CineScript addon:
// a cinematic TV-style hero + horizontal rows of cards that
// match the home page row style and size. TV-remote friendly.
// ============================================================

import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAddons } from '../addons/AddonContext';
import { AddonItem, AddonRow } from '../addons/types';
import { useProfile } from '../contexts/ProfileContext';
import { useTranslation } from '../contexts/LanguageContext';
import { Movie } from '../types';
import { IMAGE_BASE_URL, BACKDROP_SIZE } from '../contexts/constants';

// TV-remote focus: no scaling on focus (like Top 10 / Live TV cards) —
// just the same pulsing glow border the home-page rows use.
const ADDON_CARD_STYLES = `
.addon-item-card:focus-visible {
  transform: scale(1) !important;
  outline: none !important;
  box-shadow: none !important;
}
.addon-item-card:focus-visible .addon-card-frame {
  outline: 3px solid rgba(255, 255, 255, 0.9);
  outline-offset: 3px;
  animation: focus-pulse 2s linear infinite;
  box-shadow: 0 0 24px rgba(255, 255, 255, 0.18), 0 4px 20px rgba(0,0,0,0.5) !important;
}
`;

const itemBackdrop = (item: AddonItem): string | null => {
  if (item.tmdb?.backdrop_path) return `${IMAGE_BASE_URL}${BACKDROP_SIZE}${item.tmdb.backdrop_path}`;
  if (item.image) return item.image;
  if (item.tmdb?.poster_path) return `${IMAGE_BASE_URL}${BACKDROP_SIZE}${item.tmdb.poster_path}`;
  return null;
};

const AddonItemCard: React.FC<{
  item: AddonItem;
  shape: AddonRow['shape'];
  color: string;
  onFocusCard: (el: HTMLElement) => void;
}> = ({ item, shape, color, onFocusCard }) => {
  const navigate = useNavigate();
  const { setModalItem, setToast } = useProfile();
  const ref = useRef<HTMLDivElement>(null);
  const [imgError, setImgError] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const handleActivate = useCallback(() => {
    if (item.tmdb) {
      const movie: Movie = {
        id: item.tmdb.id,
        title: item.tmdb.title,
        name: item.tmdb.title,
        poster_path: item.tmdb.poster_path,
        backdrop_path: item.tmdb.backdrop_path,
        overview: item.tmdb.overview,
        vote_average: item.tmdb.vote_average,
        vote_count: 0,
        media_type: item.tmdb.media_type,
      };
      setModalItem(movie);
      return;
    }
    if (item.play) {
      navigate('/iframe-player', { state: { item: { id: 0, title: item.title, name: item.title }, streamUrl: item.play, hideLogo: true } });
      return;
    }
    if (item.url) {
      window.open(item.url, '_blank', 'noopener,noreferrer');
      return;
    }
    setToast({ message: item.title, type: 'info' });
  }, [item, navigate, setModalItem, setToast]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    if (ref.current) onFocusCard(ref.current);
  }, [onFocusCard]);

  // Circle rows keep their round avatar look — everything else uses the
  // exact home-page movie card: horizontal, slightly rectangular, same size.
  if (shape === 'circle') {
    return (
      <div
        ref={ref}
        tabIndex={0}
        role="button"
        aria-label={item.title}
        className="addon-item-card flex-shrink-0 cursor-pointer focusable group"
        onClick={handleActivate}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleActivate(); } }}
        onFocus={handleFocus}
        onBlur={() => setIsFocused(false)}
      >
        <div className="addon-card-frame relative overflow-hidden bg-zinc-900 shadow-lg border border-zinc-700/60 transition-shadow duration-300 rounded-full w-32 h-32 md:w-36 md:h-36">
          {item.image && !imgError ? (
            <img src={item.image} alt={item.title} loading="lazy"
            decoding="async" onError={() => setImgError(true)} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center"
                 style={{ background: `radial-gradient(circle at 30% 25%, ${color}26 0%, #18181b 60%, #09090b 100%)` }}>
              <i className="fa-solid fa-clapperboard text-2xl" style={{ color }} />
            </div>
          )}
        </div>
        <p className="mt-2 text-xs text-zinc-300 font-medium truncate text-center w-32 md:w-36">{item.title}</p>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="button"
      aria-label={item.title}
      className="addon-item-card flex-shrink-0 w-[24vw] min-w-[200px] max-w-[280px] cursor-pointer focusable group"
      onClick={handleActivate}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleActivate(); } }}
      onFocus={handleFocus}
      onBlur={() => setIsFocused(false)}
      onMouseEnter={() => setIsFocused(true)}
      onMouseLeave={() => setIsFocused(false)}
    >
      {/* Card frame — identical proportions/styling to the home page rows */}
      <div className="addon-card-frame relative overflow-hidden transition-all duration-300 ease-in-out transform rounded-lg shadow-lg bg-[var(--surface)] group-hover:scale-105 group-hover:shadow-2xl">
        <div className="relative w-full aspect-video bg-black">
          {item.image && !imgError ? (
            <img
              src={item.image}
              alt={item.title}
              loading="lazy"
            decoding="async"
              onError={() => setImgError(true)}
              className="object-cover w-full h-full"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center"
                 style={{ background: `radial-gradient(circle at 30% 25%, ${color}2e 0%, #18181b 60%, #09090b 100%)` }}>
              <i className="fa-solid fa-clapperboard text-3xl mb-2 drop-shadow-lg" style={{ color }} />
              <span className="text-sm font-bold text-zinc-200 line-clamp-2 drop-shadow">{item.title}</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
          {item.badge && (
            <span
              className="absolute top-2 left-2 text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full text-white shadow"
              style={{ backgroundColor: `${color}cc` }}
            >
              {item.badge}
            </span>
          )}
        </div>
      </div>

      {/* Dynamic title reveal — same behaviour as the home page cards */}
      <div className="mt-3 text-left min-h-[2.5rem]">
        <p
          className={`text-sm font-semibold text-white truncate drop-shadow-lg transition-all duration-200 ease-in-out overflow-hidden ${isFocused ? 'max-h-6 opacity-100' : 'max-h-0 opacity-0'}`}
        >
          {item.title}
        </p>
        {item.subtitle && <p className="text-xs text-zinc-400 truncate">{item.subtitle}</p>}
      </div>
    </div>
  );
};

const AddonContentRow: React.FC<{ row: AddonRow; color: string; zIndex: number }> = ({ row, color, zIndex }) => {
  const [isRowActive, setIsRowActive] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const rowContentRef = useRef<HTMLDivElement>(null);

  const handleCardFocus = useCallback((cardElement: HTMLElement) => {
    if (!scrollContainerRef.current || !rowContentRef.current) return;
    const containerWidth = scrollContainerRef.current.clientWidth;
    const contentWidth = rowContentRef.current.scrollWidth;
    let targetScroll = cardElement.offsetLeft - 24;
    const maxScroll = Math.max(0, contentWidth - containerWidth);
    if (targetScroll > maxScroll) targetScroll = maxScroll;
    if (targetScroll < 0) targetScroll = 0;
    rowContentRef.current.style.transform = `translateX(${-targetScroll}px)`;
  }, []);

  if (row.items.length === 0) return null;

  return (
    <div
      className="content-row is-in-view"
      style={{ zIndex }}
      onFocus={() => setIsRowActive(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setIsRowActive(false)}
    >
      <style>{ADDON_CARD_STYLES}</style>
      <div className="flex items-baseline justify-between mb-3 px-6">
        <h2 className={`text-lg md:text-xl font-bold text-white transition-all duration-300 ease-out origin-left ${isRowActive ? 'scale-100' : 'scale-90 text-zinc-400'}`}>
          {row.title}
        </h2>
      </div>
      <div ref={scrollContainerRef} className="overflow-x-hidden no-scrollbar py-3">
        <div
          ref={rowContentRef}
          className="flex flex-nowrap gap-x-6 px-6"
          style={{ transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)', willChange: 'transform' }}
        >
          {row.items.map((item, i) => (
            <AddonItemCard key={i} item={item} shape={row.shape} color={color} onFocusCard={handleCardFocus} />
          ))}
        </div>
      </div>
    </div>
  );
};

const AddonPage: React.FC = () => {
  const { addonId, pageId } = useParams<{ addonId: string; pageId?: string }>();
  const { getPage, loading, openStudio } = useAddons();
  const { t } = useTranslation();

  useEffect(() => { window.scrollTo(0, 0); }, [addonId, pageId]);

  const result = addonId ? getPage(addonId, pageId) : null;

  // Pick the best available artwork for the hero (first item with a backdrop).
  const heroImage = useMemo(() => {
    if (!result) return null;
    for (const row of result.page.rows) {
      for (const item of row.items) {
        const img = itemBackdrop(item);
        if (img) return img;
      }
    }
    return null;
  }, [result]);

  const color = result?.addon.manifest.meta.color || '#e50914';
  const totalItems = result ? result.page.rows.reduce((n, r) => n + r.items.length, 0) : 0;

  return (
    <Layout>
      <div className="min-h-screen pb-16">
        {loading ? (
          <div className="flex items-center justify-center h-[60vh]">
            <div className="w-14 h-14 border-4 border-t-transparent border-[var(--primary)] rounded-full animate-spin" />
          </div>
        ) : !result ? (
          <div className="flex flex-col items-center justify-center h-[60vh] gap-4 px-6">
            <i className="fa-solid fa-puzzle-piece text-5xl text-zinc-600" />
            <p className="text-zinc-400">{t('addonNotFound')}</p>
            <button onClick={openStudio} className="px-5 py-2 bg-white text-black font-bold rounded-md focusable btn-press">
              {t('addonStudio')}
            </button>
          </div>
        ) : (
          <>
            {/* ---- Cinematic TV hero ---- */}
            <div className="relative w-full h-[44vh] min-h-[320px] md:h-[52vh] overflow-hidden">
              {/* Artwork / color backdrop */}
              {heroImage ? (
                <img
                  src={heroImage}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 w-full h-full object-cover object-top"
                />
              ) : (
                <div
                  className="absolute inset-0"
                  style={{ background: `radial-gradient(120% 100% at 20% 0%, ${color}30 0%, #101014 55%, #050507 100%)` }}
                />
              )}

              {/* Readability gradients (Netflix-TV style) */}
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--background,#0a0a0a)] via-black/45 to-black/25" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/25 to-transparent" />
              {/* Soft accent glow tinted with the addon color */}
              <div
                className="absolute -bottom-24 -left-24 w-[45vw] h-[45vw] max-w-[560px] max-h-[560px] rounded-full pointer-events-none opacity-40"
                style={{ background: `radial-gradient(circle, ${color}40 0%, transparent 65%)` }}
              />

              {/* Hero content */}
              <div className="absolute inset-x-0 bottom-0 px-6 md:px-14 pb-7 md:pb-10">
                {/* Powered-by pill */}
                <div className="inline-flex items-center gap-2.5 mb-4 pl-1.5 pr-4 py-1.5 rounded-full bg-black/50 border border-white/10 backdrop-blur-sm">
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ background: `radial-gradient(circle at 30% 25%, ${color}4d 0%, #18181b 100%)`, border: `1px solid ${color}66` }}
                  >
                    <i className={`${result.page.icon || result.addon.manifest.meta.icon} text-[11px]`} style={{ color }} />
                  </span>
                  <span className="text-[11px] md:text-xs font-semibold tracking-wide text-zinc-300">
                    {t('poweredByAddon', { name: result.addon.manifest.meta.name })}
                  </span>
                </div>

                {/* Title */}
                <h1 className="text-4xl md:text-6xl font-black tracking-tight text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)] mb-3">
                  {result.page.title}
                </h1>

                {/* Details row */}
                <div className="flex items-center flex-wrap gap-x-3 gap-y-1.5 text-[11px] md:text-sm text-zinc-300 font-medium mb-2.5">
                  <span
                    className="px-2 py-0.5 rounded font-bold tracking-widest text-[9px] md:text-[10px] uppercase"
                    style={{ color, backgroundColor: `${color}1f`, border: `1px solid ${color}55` }}
                  >
                    ADDON
                  </span>
                  <span>v{result.addon.manifest.meta.version}</span>
                  <span className="text-zinc-600">•</span>
                  <span>{result.addon.manifest.meta.author}</span>
                  <span className="text-zinc-600">•</span>
                  <span>{result.page.rows.length} {t('rows')}</span>
                  <span className="text-zinc-600">•</span>
                  <span>{totalItems} {t('titles')}</span>
                </div>

                {/* Synopsis */}
                {result.addon.manifest.meta.description && (
                  <p className="text-xs md:text-base text-zinc-300/95 leading-relaxed max-w-2xl line-clamp-2 drop-shadow-md">
                    {result.addon.manifest.meta.description}
                  </p>
                )}
              </div>
            </div>

            {/* ---- Rows (home-page style) ---- */}
            <div className="space-y-12 relative z-10 mt-6">
              {result.page.rows.map((row, i) => (
                <AddonContentRow key={i} row={row} color={color} zIndex={40 - i} />
              ))}
              {result.page.rows.every(r => r.items.length === 0) && (
                <p className="text-zinc-500 text-center py-16">{t('addonEmptyPage')}</p>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

export default AddonPage;
