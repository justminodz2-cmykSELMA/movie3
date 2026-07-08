// ============================================================
// StudioTipModal — a neutral, top-anchored tip that tells the
// user how to manage addons: open their personal Addon Studio
// link on a PC (QR for phones). TV-remote friendly, dismissible.
// ============================================================

import React, { useEffect, useRef } from 'react';
import { useTranslation } from '../contexts/LanguageContext';

const MODAL_STYLES = `
@keyframes studio-tip-in {
  from { opacity: 0; transform: translateY(-14px) scale(0.985); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.studio-tip-card { animation: studio-tip-in 0.35s cubic-bezier(0.2, 0.9, 0.3, 1) both; }
@keyframes studio-tip-backdrop { from { opacity: 0; } to { opacity: 1; } }
.studio-tip-backdrop { animation: studio-tip-backdrop 0.25s ease-out both; }
.studio-tip-btn:focus-visible, .studio-tip-btn:focus {
  outline: 3px solid rgba(255, 255, 255, 0.9);
  outline-offset: 3px;
}
`;

const StudioTipModal: React.FC<{ url: string | null; onClose: () => void }> = ({ url, onClose }) => {
  const { t } = useTranslation();
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => okRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack' || e.key === 'BrowserBack') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(timer); window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const qrSrc = url
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&bgcolor=ffffff&color=18181b&data=${encodeURIComponent(url)}`
    : null;

  return (
    <div
      className="studio-tip-backdrop fixed inset-0 z-[120] bg-black/75 backdrop-blur-sm flex items-start justify-center pt-[4vh] pb-[4vh] px-3 sm:px-4 overflow-y-auto"
      onClick={onClose}
    >
      <style>{MODAL_STYLES}</style>
      <div
        className="studio-tip-card details-modal-content w-full max-w-xl max-h-full overflow-y-auto bg-zinc-900/95 border border-zinc-700/70 rounded-2xl shadow-[0_30px_90px_rgba(0,0,0,0.85)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('studioTipTitle')}
      >
        {/* subtle neutral accent line */}
        <div className="h-1 w-full bg-gradient-to-r from-transparent via-zinc-400/60 to-transparent" />

        <div className="p-4 sm:p-5 md:p-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-zinc-800/90 border border-zinc-700 flex items-center justify-center flex-shrink-0">
              <i className="fa-solid fa-circle-info text-lg text-zinc-300" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg md:text-xl font-extrabold text-white">{t('studioTipTitle')}</h2>
                <span className="text-[9px] font-bold tracking-widest px-2 py-0.5 rounded-full border border-zinc-600 text-zinc-400 bg-zinc-800/60">
                  TIP
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">{t('addonStudio')}</p>
            </div>
          </div>

          {/* Body */}
          <p className="text-[13px] md:text-sm text-zinc-300 leading-relaxed mb-4">{t('studioTipBody')}</p>

          <div className="flex flex-col sm:flex-row items-stretch gap-3">
            {/* Personal link */}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase mb-2">
                <i className="fa-solid fa-link mr-1.5" />{t('studioYourLink')}
              </p>
              {url ? (
                <div className="bg-black/60 border border-zinc-700/80 rounded-xl px-3 py-2.5 font-mono text-xs md:text-[13px] text-emerald-300 break-all leading-relaxed select-all">
                  {url}
                </div>
              ) : (
                <div className="bg-black/60 border border-zinc-700/80 rounded-xl px-3 py-2.5 text-sm text-zinc-500 flex items-center gap-3">
                  <span className="w-4 h-4 border-2 border-t-transparent border-zinc-500 rounded-full animate-spin inline-block" />
                  {t('studioTipPreparing')}
                </div>
              )}
              <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
                <i className="fa-solid fa-desktop mr-1.5" />{t('studioTipScan')}
              </p>
            </div>

            {/* QR code */}
            {qrSrc && (
              <div className="flex-shrink-0 flex flex-col items-center justify-center gap-2 sm:pl-2">
                <div className="bg-white rounded-xl p-2 shadow-lg">
                  <img src={qrSrc} alt="QR" className="w-24 h-24 md:w-28 md:h-28"  loading="lazy" decoding="async" />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end mt-5">
            <button
              ref={okRef}
              onClick={onClose}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onClose(); } }}
              className="studio-tip-btn focusable btn-press px-7 py-2 rounded-full bg-white text-black font-bold text-sm hover:bg-zinc-200 transition-colors"
            >
              {t('gotIt')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudioTipModal;
