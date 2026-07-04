import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAddons } from '../contexts/AddonContext';
import { useProfile } from '../contexts/ProfileContext';
import { InstalledAddon } from '../services/addonEngine';

const TYPE_LABEL: Record<string, string> = {
  theme: 'Theme',
  page: 'Page',
  provider: 'Provider',
};

const AddonOrb: React.FC<{
  addon: InstalledAddon;
  isActiveTheme: boolean;
  index: number;
  onActivate: () => void;
  onCardFocus: (el: HTMLElement) => void;
}> = ({ addon, isActiveTheme, index, onActivate, onCardFocus }) => {
  const m = addon.manifest;
  const cardRef = useRef<HTMLDivElement>(null);

  const handleFocus = useCallback(() => {
    if (cardRef.current) onCardFocus(cardRef.current);
  }, [onCardFocus]);

  return (
    <div
      ref={cardRef}
      className="addon-orb-wrap flex-shrink-0 w-28 md:w-32 flex flex-col items-center gap-3 cursor-pointer focusable"
      tabIndex={0}
      role="button"
      aria-label={`${m.name} — ${TYPE_LABEL[m.type]} addon`}
      onClick={onActivate}
      onKeyDown={(e) => e.key === 'Enter' && onActivate()}
      onFocus={handleFocus}
      style={{ animationDelay: `${index * 50}ms`, ['--orb-accent' as any]: m.color }}
    >
      <div className="addon-orb w-24 h-24 md:w-28 md:h-28">
        <div
          className="addon-orb-inner flex flex-col items-center justify-center gap-1"
          style={{
            background: `radial-gradient(circle at 30% 25%, ${m.color}30, var(--surface) 70%)`,
          }}
        >
          <i
            className={`fa-solid ${m.icon} text-3xl md:text-4xl drop-shadow-lg`}
            style={{ color: m.color }}
          ></i>
          {!addon.enabled && (
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Off</span>
          )}
          {isActiveTheme && (
            <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400">
              Active
            </span>
          )}
        </div>
      </div>
      <div className="text-center min-w-0 w-full">
        <p className="text-xs md:text-sm font-semibold text-white truncate drop-shadow-lg">
          {m.name}
        </p>
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
          {TYPE_LABEL[m.type]}
        </p>
      </div>
    </div>
  );
};

const AddonsRow: React.FC<{ title: string; zIndex?: number }> = ({ title, zIndex }) => {
  const navigate = useNavigate();
  const { setToast } = useProfile();
  const { latestAddons, activeThemeAddonId, applyThemeAddon } = useAddons();
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

  const handleActivate = useCallback(
    (addon: InstalledAddon) => {
      const m = addon.manifest;
      if (m.type === 'page' && m.page && addon.enabled) {
        navigate(`/addon/${m.page.route}`);
        return;
      }
      if (m.type === 'theme' && addon.enabled) {
        const isActive = activeThemeAddonId === addon.id;
        applyThemeAddon(isActive ? null : addon.id);
        setToast({
          message: isActive ? 'Theme reverted to default' : `"${m.name}" applied`,
          type: 'success',
        });
        return;
      }
      navigate('/addons');
    },
    [navigate, activeThemeAddonId, applyThemeAddon, setToast],
  );

  return (
    <div
      className="content-row is-in-view"
      style={{ zIndex }}
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
          {title}
        </h2>
        <button
          onClick={() => navigate('/addons')}
          className="focusable text-xs font-bold text-zinc-400 hover:text-white transition-colors rounded-full px-3 py-1"
        >
          Addon Studio <i className="fa-solid fa-chevron-right ml-1 text-[10px]"></i>
        </button>
      </div>
      <div ref={scrollContainerRef} className="overflow-x-hidden no-scrollbar py-6 -my-6">
        <div
          ref={rowContentRef}
          className="flex flex-nowrap items-start gap-x-6 px-6"
          style={{
            transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            willChange: 'transform',
          }}
        >
          {/* Create orb */}
          <div
            className="addon-orb-wrap flex-shrink-0 w-28 md:w-32 flex flex-col items-center gap-3 cursor-pointer focusable"
            tabIndex={0}
            role="button"
            aria-label="Create a new addon"
            onClick={() => navigate('/addons')}
            onKeyDown={(e) => e.key === 'Enter' && navigate('/addons')}
            style={{ ['--orb-accent' as any]: '#ffffff' }}
          >
            <div className="addon-orb w-24 h-24 md:w-28 md:h-28">
              <div className="addon-orb-inner flex items-center justify-center bg-[var(--surface)] border-2 border-dashed border-zinc-700">
                <i className="fa-solid fa-plus text-3xl text-zinc-400"></i>
              </div>
            </div>
            <div className="text-center w-full">
              <p className="text-xs md:text-sm font-semibold text-white truncate drop-shadow-lg">
                Create Addon
              </p>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                CineScript
              </p>
            </div>
          </div>

          {latestAddons.map((addon, index) => (
            <AddonOrb
              key={addon.id}
              addon={addon}
              isActiveTheme={activeThemeAddonId === addon.id}
              index={index}
              onActivate={() => handleActivate(addon)}
              onCardFocus={handleCardFocus}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default AddonsRow;
