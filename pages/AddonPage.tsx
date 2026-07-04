// ============================================================
// AddonPage — renders a page declared by a CineScript addon:
// a header + horizontal rows of focusable cards, fully driven
// by the sanitized addon manifest. TV-remote friendly.
// ============================================================

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAddons } from '../addons/AddonContext';
import { AddonItem, AddonRow } from '../addons/types';
import { useProfile } from '../contexts/ProfileContext';
import { useTranslation } from '../contexts/LanguageContext';
import { Movie } from '../types';

// TV-remote focus: no scaling (like Top 10 / Live TV cards) — just the
// same pulsing glow border the home-page rows use, following the card
// radius (round on circles, rounded on posters/wide/square cards).
const ADDON_CARD_STYLES = `
.addon-item-card:focus-visible {
  transform: scale(1) !important;
  outline: none !important;
  box-shadow: none !important;
}
.addon-item-card:hover .addon-card-frame {
  transform: none;
}
.addon-item-card:focus-visible .addon-card-frame {
  outline: 3px solid rgba(255, 255, 255, 0.9);
  outline-offset: 3px;
  animation: focus-pulse 2s linear infinite;
  box-shadow: 0 0 24px rgba(255, 255, 255, 0.18), 0 4px 20px rgba(0,0,0,0.5) !important;
}
`;

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

  const sizeClasses = shape === 'wide'
    ? 'w-[24vw] min-w-[220px] max-w-[320px] aspect-video'
    : shape === 'circle'
      ? 'w-32 h-32 md:w-36 md:h-36 rounded-full'
      : shape === 'square'
        ? 'w-36 md:w-44 aspect-square'
        : 'w-36 md:w-44 aspect-[2/3]';

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="button"
      aria-label={item.title}
      className="addon-item-card flex-shrink-0 cursor-pointer focusable group"
      onClick={handleActivate}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleActivate(); } }}
      onFocus={() => { if (ref.current) onFocusCard(ref.current); }}
    >
      <div
        className={`addon-card-frame relative overflow-hidden bg-zinc-900 shadow-lg border border-zinc-700/60 transition-shadow duration-300 ${shape === 'circle' ? 'rounded-full' : 'rounded-lg'} ${sizeClasses}`}
        style={{ boxShadow: `0 4px 20px rgba(0,0,0,0.5)` }}
      >
        {item.image && !imgError ? (
          <img
            src={item.image}
            alt={item.title}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center"
               style={{ background: `radial-gradient(circle at 30% 25%, ${color}26 0%, #18181b 60%, #09090b 100%)` }}>
            <i className="fa-solid fa-clapperboard text-2xl mb-2" style={{ color }} />
            <span className="text-xs font-semibold text-zinc-200 line-clamp-3">{item.title}</span>
          </div>
        )}
        {item.badge && (
          <span
            className="absolute top-2 left-2 text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full text-white"
            style={{ backgroundColor: `${color}cc` }}
          >
            {item.badge}
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2 pt-6 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          <p className="text-xs font-bold text-white truncate">{item.title}</p>
          {item.subtitle && <p className="text-[10px] text-zinc-300 truncate">{item.subtitle}</p>}
        </div>
      </div>
      {shape !== 'wide' && (
        <p className={`mt-2 text-xs text-zinc-300 font-medium truncate text-center ${shape === 'circle' ? 'w-32 md:w-36' : 'w-36 md:w-44'}`}>{item.title}</p>
      )}
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
      <h2 className={`px-6 mb-4 text-lg md:text-xl font-bold text-white transition-all duration-300 ease-out origin-left ${isRowActive ? 'scale-100' : 'scale-90 text-zinc-400'}`}>
        {row.title}
      </h2>
      <div ref={scrollContainerRef} className="overflow-hidden">
        <div ref={rowContentRef} className="flex gap-4 px-6 py-3 transition-transform duration-300 ease-out">
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
  const { getPage, loading } = useAddons();
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => { window.scrollTo(0, 0); }, [addonId, pageId]);

  const result = addonId ? getPage(addonId, pageId) : null;

  return (
    <Layout>
      <div className="px-4 md:px-10 pt-24 pb-16 min-h-screen">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-14 h-14 border-4 border-t-transparent border-[var(--primary)] rounded-full animate-spin" />
          </div>
        ) : !result ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <i className="fa-solid fa-puzzle-piece text-5xl text-zinc-600" />
            <p className="text-zinc-400">{t('addonNotFound')}</p>
            <button onClick={() => navigate('/addons')} className="px-5 py-2 bg-white text-black font-bold rounded-md focusable btn-press">
              {t('addonStudio')}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4 mb-8 px-2">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: `radial-gradient(circle at 30% 25%, ${result.addon.manifest.meta.color}33 0%, #18181b 100%)`, border: `1px solid ${result.addon.manifest.meta.color}44` }}
              >
                <i className={`${result.page.icon} text-2xl`} style={{ color: result.addon.manifest.meta.color }} />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-extrabold text-white">{result.page.title}</h1>
                <p className="text-xs text-zinc-400">
                  {t('poweredByAddon', { name: result.addon.manifest.meta.name })} • v{result.addon.manifest.meta.version} • {result.addon.manifest.meta.author}
                </p>
              </div>
            </div>
            <div className="space-y-14 relative z-10">
              {result.page.rows.map((row, i) => (
                <AddonContentRow key={i} row={row} color={result.addon.manifest.meta.color} zIndex={40 - i} />
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
