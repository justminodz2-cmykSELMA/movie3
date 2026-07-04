import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAddons } from '../contexts/AddonContext';
import { useProfile } from '../contexts/ProfileContext';
import {
  AddonRowDef,
  AddonItem,
  ResolvedRow,
  resolveRow,
  InstalledAddon,
} from '../services/addonEngine';
import { IMAGE_BASE_URL, BACKDROP_SIZE_MEDIUM } from '../contexts/constants';

/* ------------------------------------------------------------------ */
/* Item detail modal for custom (non-TMDB) items                       */
/* ------------------------------------------------------------------ */

const AddonItemModal: React.FC<{
  item: AddonItem;
  accent: string;
  onClose: () => void;
}> = ({ item, accent, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
    >
      <div
        className="relative w-full max-w-lg rounded-xl overflow-hidden bg-[var(--surface)] border border-[var(--border)] shadow-2xl flex flex-col sm:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {item.image && (
          <img
            src={item.image || "/placeholder.svg"}
            alt={item.title}
            className="w-full sm:w-44 h-56 sm:h-auto object-cover flex-shrink-0"
          />
        )}
        <div className="p-5 flex flex-col gap-2 min-w-0">
          <h3 className="text-xl font-bold text-white text-balance">{item.title}</h3>
          {item.subtitle && <p className="text-sm" style={{ color: accent }}>{item.subtitle}</p>}
          {item.description && (
            <p className="text-sm text-zinc-400 leading-relaxed">{item.description}</p>
          )}
          <div className="flex gap-2 mt-auto pt-3">
            {item.link && (
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="focusable btn-press px-4 py-2 rounded-md text-sm font-bold bg-white text-black hover:bg-zinc-200"
              >
                <i className="fa-solid fa-arrow-up-right-from-square mr-2"></i>Open
              </a>
            )}
            <button
              onClick={onClose}
              className="focusable btn-press px-4 py-2 rounded-md text-sm font-bold bg-zinc-800 text-white border border-zinc-700"
            >
              Close
            </button>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center focusable"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Cards                                                               */
/* ------------------------------------------------------------------ */

const shapeClasses: Record<AddonRowDef['shape'], { wrap: string; media: string }> = {
  card: {
    wrap: 'w-[24vw] min-w-[220px] max-w-[320px]',
    media: 'aspect-video rounded-lg',
  },
  poster: {
    wrap: 'w-[13vw] min-w-[140px] max-w-[190px]',
    media: 'aspect-[2/3] rounded-lg',
  },
  circle: {
    wrap: 'w-32',
    media: 'aspect-square rounded-full',
  },
};

const AddonItemCard: React.FC<{
  item: AddonItem;
  shape: AddonRowDef['shape'];
  accent: string;
  index: number;
  onClick: () => void;
  onCardFocus: (el: HTMLElement) => void;
}> = ({ item, shape, accent, index, onClick, onCardFocus }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [imgError, setImgError] = useState(false);
  const cls = shapeClasses[shape];

  const handleFocus = useCallback(() => {
    if (cardRef.current) onCardFocus(cardRef.current);
  }, [onCardFocus]);

  return (
    <div
      ref={cardRef}
      className={`flex-shrink-0 ${cls.wrap} cursor-pointer focusable group`}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      onFocus={handleFocus}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div
        className={`relative overflow-hidden transition-all duration-300 ease-in-out transform shadow-lg bg-[var(--surface)] group-hover:scale-105 group-hover:shadow-2xl ${cls.media} interactive-card`}
      >
        {item.image && !imgError ? (
          <img
            src={item.image || "/placeholder.svg"}
            alt={item.title}
            onError={() => setImgError(true)}
            className="object-cover w-full h-full"
            loading="lazy"
          />
        ) : (
          <div
            className="w-full h-full flex flex-col items-center justify-center gap-2 p-3 text-center"
            style={{ backgroundColor: `${accent}14` }}
          >
            <i className="fa-solid fa-bookmark text-2xl" style={{ color: accent }}></i>
            <span className="text-xs font-bold text-zinc-300 line-clamp-3">{item.title}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
      </div>
      <div className="mt-2 text-left">
        <p className="text-sm font-semibold text-white truncate drop-shadow-lg">{item.title}</p>
        {item.subtitle && <p className="text-xs text-zinc-400 truncate">{item.subtitle}</p>}
      </div>
    </div>
  );
};

const TmdbCard: React.FC<{
  movie: any;
  index: number;
  onClick: () => void;
  onCardFocus: (el: HTMLElement) => void;
}> = ({ movie, index, onClick, onCardFocus }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const handleFocus = useCallback(() => {
    if (cardRef.current) onCardFocus(cardRef.current);
  }, [onCardFocus]);

  if (!movie.backdrop_path && !movie.poster_path) return null;
  const img = movie.backdrop_path || movie.poster_path;

  return (
    <div
      ref={cardRef}
      className="flex-shrink-0 w-[24vw] min-w-[220px] max-w-[320px] cursor-pointer focusable group"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      onFocus={handleFocus}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="relative overflow-hidden transition-all duration-300 ease-in-out transform rounded-lg shadow-lg bg-[var(--surface)] group-hover:scale-105 group-hover:shadow-2xl interactive-card">
        <div className="relative w-full aspect-video bg-black">
          <img
            src={`${IMAGE_BASE_URL}${BACKDROP_SIZE_MEDIUM}${img}`}
            alt={movie.title || movie.name}
            className="object-cover w-full h-full"
            loading="lazy"
          />
        </div>
      </div>
      <p className="mt-2 text-sm font-semibold text-white truncate drop-shadow-lg">
        {movie.title || movie.name}
      </p>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Row (same translate-scroll behavior as the homepage rows)           */
/* ------------------------------------------------------------------ */

const AddonRow: React.FC<{
  resolved: ResolvedRow;
  accent: string;
  onTmdbClick: (movie: any) => void;
  onItemClick: (item: AddonItem) => void;
}> = ({ resolved, accent, onTmdbClick, onItemClick }) => {
  const [isRowActive, setIsRowActive] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const rowContentRef = useRef<HTMLDivElement>(null);

  const handleCardFocus = useCallback((cardElement: HTMLElement) => {
    if (!scrollContainerRef.current || !rowContentRef.current) return;
    const containerWidth = scrollContainerRef.current.clientWidth;
    const contentWidth = rowContentRef.current.scrollWidth;
    const padding = 24;
    let targetScroll = cardElement.offsetLeft - padding;
    const maxScroll = contentWidth - containerWidth;
    if (targetScroll > maxScroll) targetScroll = maxScroll;
    if (targetScroll < 0) targetScroll = 0;
    rowContentRef.current.style.transform = `translateX(${-targetScroll}px)`;
  }, []);

  const { def, tmdbItems, items, error } = resolved;
  const empty = !error && !tmdbItems?.length && !items?.length;

  return (
    <div
      className="content-row is-in-view"
      onFocus={() => setIsRowActive(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsRowActive(false);
      }}
    >
      <div className="flex items-baseline justify-between mb-3 px-6">
        <h2
          className={`text-lg md:text-xl font-bold text-white transition-all duration-300 ease-out origin-left ${
            isRowActive ? 'scale-100' : 'scale-90 text-zinc-400'
          }`}
        >
          {def.title}
        </h2>
      </div>
      {error ? (
        <p className="px-6 text-sm text-red-400">
          <i className="fa-solid fa-triangle-exclamation mr-2"></i>
          {error}
        </p>
      ) : empty ? (
        <p className="px-6 text-sm text-zinc-500">No items.</p>
      ) : (
        <div ref={scrollContainerRef} className="overflow-x-hidden no-scrollbar py-8 -my-8">
          <div
            ref={rowContentRef}
            className="flex flex-nowrap gap-x-6 px-6"
            style={{
              transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              willChange: 'transform',
            }}
          >
            {tmdbItems?.map((movie, i) => (
              <TmdbCard
                key={`tmdb-${movie.id}-${i}`}
                movie={movie}
                index={i}
                onClick={() => onTmdbClick(movie)}
                onCardFocus={handleCardFocus}
              />
            ))}
            {items?.map((item, i) => (
              <AddonItemCard
                key={`item-${i}`}
                item={item}
                shape={def.shape}
                accent={accent}
                index={i}
                onClick={() => onItemClick(item)}
                onCardFocus={handleCardFocus}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Skeleton                                                            */
/* ------------------------------------------------------------------ */

const RowSkeleton: React.FC = () => (
  <div className="px-6">
    <div className="skeleton h-6 w-48 rounded mb-4"></div>
    <div className="flex gap-6 overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton flex-shrink-0 w-[220px] aspect-video rounded-lg"></div>
      ))}
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const AddonPage: React.FC = () => {
  const { route } = useParams<{ route: string }>();
  const navigate = useNavigate();
  const { getAddonByRoute, providerDefs } = useAddons();
  const { setModalItem } = useProfile();

  const [addon, setAddon] = useState<InstalledAddon | undefined>(undefined);
  const [rows, setRows] = useState<ResolvedRow[] | null>(null);
  const [activeItem, setActiveItem] = useState<AddonItem | null>(null);

  useEffect(() => {
    const found = route ? getAddonByRoute(route) : undefined;
    setAddon(found);
    setRows(null);
    if (!found?.manifest.page) return;

    let cancelled = false;
    const load = async () => {
      const resolved = await Promise.all(
        found.manifest.page!.rows.map((r) => resolveRow(r, providerDefs)),
      );
      if (!cancelled) setRows(resolved);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [route, getAddonByRoute, providerDefs]);

  const handleTmdbClick = useCallback(
    (movie: any) => {
      setModalItem(movie);
    },
    [setModalItem],
  );

  if (!addon || !addon.manifest.page) {
    return (
      <Layout>
        <div className="pt-40 flex flex-col items-center gap-4 text-center px-6">
          <i className="fa-solid fa-puzzle-piece text-5xl text-zinc-700"></i>
          <h1 className="text-2xl font-bold text-white">Addon page not found</h1>
          <p className="text-sm text-zinc-400">
            This addon may be disabled or uninstalled.
          </p>
          <button
            onClick={() => navigate('/addons')}
            className="focusable btn-press px-5 py-2.5 rounded-lg font-bold text-sm bg-white text-black"
          >
            Open Addon Studio
          </button>
        </div>
      </Layout>
    );
  }

  const page = addon.manifest.page;
  const accent = addon.manifest.color;

  return (
    <Layout>
      <div className="pt-20">
        {/* Hero */}
        <div className="relative w-full h-[42vh] min-h-[280px] overflow-hidden mx-auto">
          {page.heroImage ? (
            <img
              src={page.heroImage || "/placeholder.svg"}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(ellipse at 30% 20%, ${accent}33, transparent 60%), var(--surface)`,
              }}
            ></div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--background)] via-[var(--background)]/40 to-transparent"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--background)]/80 to-transparent"></div>
          <div className="relative z-10 h-full flex flex-col justify-end px-6 md:px-12 pb-8">
            <div className="flex items-center gap-3 mb-2">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-xl border-2"
                style={{
                  color: accent,
                  borderColor: `${accent}66`,
                  backgroundColor: `${accent}22`,
                }}
              >
                <i className={`fa-solid ${page.icon}`}></i>
              </div>
              <span className="text-xs font-bold uppercase tracking-[0.25em] text-zinc-300">
                Addon • {addon.manifest.name} v{addon.manifest.version}
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight text-balance">
              {page.heroTitle || page.title}
            </h1>
            {page.heroSubtitle && (
              <p className="text-sm md:text-base text-zinc-300 mt-2 max-w-2xl text-pretty">
                {page.heroSubtitle}
              </p>
            )}
          </div>
        </div>

        {/* Rows */}
        <div className="relative z-10 mt-10 space-y-14 pb-16">
          {rows === null ? (
            <>
              <RowSkeleton />
              <RowSkeleton />
            </>
          ) : (
            rows.map((r, i) => (
              <AddonRow
                key={`${r.def.title}-${i}`}
                resolved={r}
                accent={accent}
                onTmdbClick={handleTmdbClick}
                onItemClick={setActiveItem}
              />
            ))
          )}
        </div>
      </div>

      {activeItem && (
        <AddonItemModal item={activeItem} accent={accent} onClose={() => setActiveItem(null)} />
      )}
    </Layout>
  );
};

export default AddonPage;
