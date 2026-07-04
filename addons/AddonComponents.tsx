// ============================================================
// Addon UI — circular "Latest Addons" row + addon orb cards.
// Matches the app's row style: title scaling, smooth translate
// scrolling, TV-remote arrow navigation and a glowing circular
// focus border (round twin of the card glow style).
// ============================================================

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAddons } from './AddonContext';
import { InstalledAddon } from './types';
import { useTranslation } from '../contexts/LanguageContext';

const ADDON_ORB_STYLES = `
.addon-orb {
  position: relative;
  border-radius: 9999px;
  outline: none;
}
.addon-orb::before {
  content: '';
  position: absolute;
  inset: -5px;
  border-radius: 9999px;
  padding: 3px;
  background: conic-gradient(from var(--orb-angle, 0deg),
    var(--orb-color, #e50914) 0%,
    transparent 30%,
    var(--orb-color, #e50914) 50%,
    transparent 80%,
    var(--orb-color, #e50914) 100%);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  opacity: 0;
  transition: opacity 0.25s ease;
  pointer-events: none;
}
@property --orb-angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}
@keyframes orb-spin {
  to { --orb-angle: 360deg; }
}
.addon-orb:hover::before,
.addon-orb:focus-visible::before,
.addon-orb:focus::before {
  opacity: 1;
  animation: orb-spin 2.5s linear infinite;
}
.addon-orb:focus-visible,
.addon-orb:focus {
  outline: none !important;
  transform: scale(1) !important; /* TV remote: never scale on focus */
  box-shadow: none !important;
}
.addon-orb:hover .addon-orb-inner,
.addon-orb:focus-visible .addon-orb-inner,
.addon-orb:focus .addon-orb-inner {
  box-shadow: 0 0 25px var(--orb-glow, rgba(229, 9, 20, 0.55)),
              0 0 60px var(--orb-glow, rgba(229, 9, 20, 0.25));
}
.addon-orb-inner {
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}
`;

function hexToGlow(hex: string): string {
  const m = /^#?([0-9a-f]{6})/i.exec(hex || '');
  if (!m) return 'rgba(229, 9, 20, 0.5)';
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.5)`;
}

const TYPE_BADGE: Record<string, string> = {
  theme: 'THEME',
  page: 'PAGE',
  provider: 'PROVIDER',
  mixed: 'ADDON',
};

export const AddonOrb: React.FC<{
  addon?: InstalledAddon;
  isCreate?: boolean;
  onActivate: () => void;
  onFocusCard?: (el: HTMLElement) => void;
}> = ({ addon, isCreate, onActivate, onFocusCard }) => {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const color = isCreate ? '#e50914' : addon?.manifest.meta.color || '#e50914';
  const icon = isCreate ? 'fa-solid fa-plus' : addon?.manifest.meta.icon || 'fa-solid fa-puzzle-piece';
  const name = isCreate ? t('createAddon') : addon?.manifest.meta.name || '';
  const badge = isCreate ? 'STUDIO' : TYPE_BADGE[addon?.manifest.meta.type || 'mixed'];

  return (
    <div className="flex-shrink-0 flex flex-col items-center gap-3 w-32 md:w-36">
      <div
        ref={ref}
        tabIndex={0}
        role="button"
        aria-label={name}
        className="addon-orb focusable cursor-pointer"
        style={{ '--orb-color': color, '--orb-glow': hexToGlow(color) } as React.CSSProperties}
        onClick={onActivate}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onActivate(); } }}
        onFocus={() => { if (ref.current && onFocusCard) onFocusCard(ref.current); }}
      >
        <div
          className="addon-orb-inner w-24 h-24 md:w-28 md:h-28 rounded-full flex items-center justify-center relative overflow-hidden border border-zinc-700/60"
          style={{
            background: `radial-gradient(circle at 30% 25%, ${color}33 0%, #18181b 55%, #09090b 100%)`,
          }}
        >
          <i className={`${icon} text-3xl md:text-4xl`} style={{ color }} />
          {addon && !addon.enabled && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-full">
              <i className="fa-solid fa-power-off text-zinc-400 text-xl" />
            </div>
          )}
        </div>
      </div>
      <div className="text-center">
        <p className="text-xs md:text-sm font-semibold text-white truncate max-w-[8.5rem]">{name}</p>
        <span
          className="text-[9px] font-bold tracking-widest px-2 py-0.5 rounded-full border"
          style={{ color, borderColor: `${color}55`, backgroundColor: `${color}14` }}
        >
          {badge}
        </span>
      </div>
    </div>
  );
};

export const LatestAddonsRow: React.FC<{ zIndex?: number }> = ({ zIndex }) => {
  const { latestAddons, loading, openStudio } = useAddons();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isRowActive, setIsRowActive] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const rowContentRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1 },
    );
    const currentRef = rowRef.current;
    if (currentRef) observer.observe(currentRef);
    return () => { if (currentRef) observer.unobserve(currentRef); };
  }, []);

  const handleCardFocus = useCallback((cardElement: HTMLElement) => {
    if (!scrollContainerRef.current || !rowContentRef.current) return;
    const containerWidth = scrollContainerRef.current.clientWidth;
    const contentWidth = rowContentRef.current.scrollWidth;
    const padding = 24;
    let targetScroll = (cardElement.parentElement || cardElement).offsetLeft - padding;
    const maxScroll = Math.max(0, contentWidth - containerWidth);
    if (targetScroll > maxScroll) targetScroll = maxScroll;
    if (targetScroll < 0) targetScroll = 0;
    rowContentRef.current.style.transform = `translateX(${-targetScroll}px)`;
  }, []);

  const openAddon = useCallback((addon: InstalledAddon) => {
    const firstPage = addon.manifest.pages[0];
    if (addon.enabled && firstPage) {
      navigate(`/addon/${addon.manifest.meta.id}/${firstPage.id}`);
    } else {
      // Managing addons happens in the personal PC Studio — show the tip.
      openStudio();
    }
  }, [navigate, openStudio]);

  if (loading) return null;

  return (
    <div
      ref={rowRef}
      className={`content-row ${isInView ? 'is-in-view' : ''}`}
      style={{ zIndex }}
      onFocus={() => setIsRowActive(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setIsRowActive(false)}
    >
      <style>{ADDON_ORB_STYLES}</style>
      <div className="flex items-center gap-3 px-6 mb-4">
        <h2 className={`text-lg md:text-xl font-bold text-white transition-all duration-300 ease-out origin-left ${isRowActive ? 'scale-100' : 'scale-90 text-zinc-400'}`}>
          <i className="fa-solid fa-puzzle-piece mr-2 text-red-600" />
          {t('latestAddons')}
        </h2>
        <button
          onClick={openStudio}
          className="text-xs text-zinc-400 hover:text-white focusable rounded-full px-3 py-1 border border-zinc-700 hover:border-zinc-400 transition-colors"
        >
          {t('addonStudio')} <i className="fa-solid fa-arrow-right text-[10px]" />
        </button>
      </div>
      {/* py-12/-my-12 gives the focus glow (60px blur) room to render without
          being hard-clipped top/bottom by this overflow-hidden scroll container,
          while keeping the row's outer layout size exactly the same. */}
      <div ref={scrollContainerRef} className="overflow-hidden py-12 -my-12">
        <div
          ref={rowContentRef}
          className="flex gap-5 px-6 py-4 transition-transform duration-300 ease-out"
        >
          <AddonOrb isCreate onActivate={openStudio} onFocusCard={handleCardFocus} />
          {latestAddons.map((addon) => (
            <AddonOrb
              key={addon.manifest.meta.id}
              addon={addon}
              onActivate={() => openAddon(addon)}
              onFocusCard={handleCardFocus}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
