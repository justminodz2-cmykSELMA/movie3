import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Hls from 'hls.js';

// Tuned for smooth playback over serverless proxies (Vercel):
// - big forward buffer rides through slow segment fetches
// - next fragment is prefetched while the current one plays
// - retries are quick and bounded so errors recover fast instead of stalling
const HLS_TUNING: Partial<Hls.HlsConfig> = {
    enableWorker: true,
    maxBufferLength: 60,
    maxMaxBufferLength: 120,
    maxBufferSize: 90 * 1000 * 1000,
    backBufferLength: 30,
    startFragPrefetch: true,
    startLevel: -1, // let ABR pick the first level from the bandwidth estimate
    abrEwmaDefaultEstimate: 1_600_000,
    abrEwmaFastVoD: 2, // adapt quickly to the real bandwidth after start
    fragLoadingMaxRetry: 4,
    fragLoadingRetryDelay: 500,
    fragLoadingMaxRetryTimeout: 8000,
    levelLoadingMaxRetry: 3,
    manifestLoadingMaxRetry: 2,
};
import mpegts from 'mpegts.js';
import { Movie, Episode, SubtitleTrack, SubtitleSettings, StreamLink } from '../types';
import VideoEnhancer4K from './videoEnhancer';
import { useProfile } from '../contexts/ProfileContext';
import { useTranslation } from '../contexts/LanguageContext';
import { fetchStreamUrl, fetchFromTMDB, analyzeSubtitlesForSkips, streamDubbing, DubbingBatch } from '../services/apiService';
import { useAddons } from '../addons/AddonContext';
import { collectAddonPlayerConfig, fetchAddonSubtitles } from '../addons/playerBridge';
import { translateSrtWithGemini } from '../services/geminiSubtitleService';
import * as Icons from './Icons';
import { IMAGE_BASE_URL, BACKDROP_SIZE_MEDIUM } from '../contexts/constants';
import { translateSrtViaGoogle } from '../services/translationService';

interface PlayerProps {
    item: Movie;
    itemType: 'movie' | 'tv';
    initialSeason: number | undefined;
    initialEpisode: Episode | null;
    initialTime?: number;
    initialStreamUrl?: string | null;
    onEnterPip: (streamUrl: string, currentTime: number, isPlaying: boolean, dimensions: DOMRect) => void;
    selectedProvider: string | null;
    onProviderSelected: (provider: string) => void;
    onStreamFetchStateChange: (isFetching: boolean) => void;
    setVideoNode?: (node: HTMLVideoElement | null) => void;
    serverPreferences: string[];
    episodes: Episode[];
    onEpisodeSelect: (episode: Episode) => void;
    isOffline?: boolean;
    downloadId?: string;
    liveChannels?: any[];
    currentChannelIndex?: number;
    logo?: string;
    hideLogo?: boolean;
    isLiveScheduleMode?: boolean;
    onVideoEnded?: () => void;
    liveReason?: string;
    needsProxy?: boolean;
}

interface SkipSegment {
    start: number;
    end: number;
}

const ChannelListPanel: React.FC<{
  channels: any[];
  currentIndex: number;
  onSelect: (index: number) => void;
  onClose: () => void;
  isVisible: boolean;
}> = ({ channels, currentIndex, onSelect, onClose, isVisible }) => {
  const [focusedIndex, setFocusedIndex] = useState(currentIndex);
  const [isRendered, setIsRendered] = useState(isVisible);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (isVisible) {
      setIsRendered(true);
      setFocusedIndex(currentIndex);
    } else {
      const timer = setTimeout(() => setIsRendered(false), 300); // match animation duration
      return () => clearTimeout(timer);
    }
  }, [isVisible, currentIndex]);

  useEffect(() => {
    if (isVisible) {
      const focusItem = () => {
        const item = itemRefs.current[focusedIndex];
        if (item) {
          item.focus();
          // TV browsers struggle with smooth scrolling; use snappy instant scrolling for TV.
          const isTV = typeof navigator !== 'undefined' && /SmartTV|Tizen|Web0S|AppleTV|AndroidTV|TV|PlayStation/i.test(navigator.userAgent);
          item.scrollIntoView({ behavior: isTV ? 'auto' : 'smooth', block: 'center' });
        }
      };
      const timer = setTimeout(focusItem, 150);
      return () => clearTimeout(timer);
    }
  }, [isVisible, focusedIndex]);

  useEffect(() => {
    if (!isVisible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex(prev => (prev > 0 ? prev - 1 : channels.length - 1));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex(prev => (prev < channels.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onSelect(focusedIndex);
      } else if (['ArrowLeft', 'Escape', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, channels.length, focusedIndex, onSelect, onClose]);

  if (!isRendered) return null;

  const animationClass = isVisible ? 'animate-slide-in-from-right' : 'animate-slide-out-to-right';

  return (
    <div className={`fixed top-0 right-0 h-full w-full max-w-xs bg-black/80 backdrop-blur-lg z-30 p-4 ${animationClass}`}>
      <h2 className="text-2xl font-bold text-white mb-4">Channels</h2>
      <div className="h-[calc(100%-4rem)] overflow-y-auto no-scrollbar">
        {channels.map((channel, index) => (
          <button
            key={channel.id}
            // FIX: Ref callback should not return a value. Changed to a block statement.
            ref={el => { itemRefs.current[index] = el; }}
            onClick={() => onSelect(index)}
            className="w-full flex items-center gap-4 p-3 my-1 rounded-lg text-left transition-colors duration-200 focus:outline-none focus:bg-white/20 hover:bg-white/10"
          >
            <img 
              src={channel.logo} 
              alt={channel.name} 
              className="w-16 h-12 object-contain flex-shrink-0 rounded-md bg-zinc-700 p-1" 
              onError={(e) => {
                const target = e.currentTarget;
                target.onerror = null;
                const cleanName = channel.name.replace(/^(AR|FR|EN|ES|DE|IT|UK|US|MA|TN|DZ|LY|SY|LB|ZA|PT|TR|AL|PL|RO|RU|KSA|OSN|beIN|MBC|TOD|BTV|OCS|Starz|Dragon|Hulu|Skyflix|ART|Rotana|ON|DMC|CBC|Al Alhy|Zamalek|Nile|Sada Elbalad|Star|Paramount|Comedy|TNT|HBO|ESPN|Fox|Sony|ZDF|RTL|SAT|Pro7|Super RTL|Vox|VOX|Kika|Arte|TF1|M6|W9|RMC|BFM|LCI|DAZN|TMC|France)\s*:\s*/i, '').trim();
                const letter = cleanName.charAt(0).toUpperCase() || '📺';
                target.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100" height="100" rx="10" fill="%23eab308"/><text x="50" y="55" font-family="sans-serif" font-size="45" font-weight="bold" fill="%23000000" text-anchor="middle" dominant-baseline="middle">${letter}</text></svg>`;
              }}
            />
            <span className="text-white font-semibold truncate">{channel.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};


const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const date = new Date(seconds * 1000);
    const hh = date.getUTCHours();
    const mm = date.getUTCMinutes().toString().padStart(2, '0');
    const ss = date.getUTCSeconds().toString().padStart(2, '0');
    if (hh > 0) return `${hh.toString().padStart(2, '0')}:${mm}:${ss}`;
    return `${mm}:${ss}`;
};

const SidePanel: React.FC<{
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    show: boolean;
}> = ({ title, onClose, children, show }) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const [isRendered, setIsRendered] = useState(false);
    const [isAnimatingOut, setIsAnimatingOut] = useState(false);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (show) {
            setIsRendered(true);
            setIsAnimatingOut(false);
        } else if (isRendered) {
            setIsAnimatingOut(true);
            const timer = setTimeout(() => {
                setIsRendered(false);
                setIsAnimatingOut(false);
            }, 300); // Animation duration
            return () => clearTimeout(timer);
        }
    }, [show, isRendered]);

    // Focus trapping and keyboard navigation handling
    useEffect(() => {
        if (isRendered && !isAnimatingOut) {
            const panelNode = panelRef.current;
            if (!panelNode) return;

            const focusTimer = setTimeout(() => {
                const focusableElements = Array.from(
                    panelNode.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
                ).filter(el => !(el as HTMLElement).hasAttribute('disabled')) as HTMLElement[];
                
                if (focusableElements.length > 0) {
                    focusableElements[0].focus();
                }
            }, 100);

            const handleKeyDown = (e: KeyboardEvent) => {
                e.stopPropagation(); 

                const focusableElements = Array.from(
                    panelNode.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
                ).filter(el => !(el as HTMLElement).hasAttribute('disabled')) as HTMLElement[];
                
                if (focusableElements.length === 0) return;

                const firstElement = focusableElements[0];
                const lastElement = focusableElements[focusableElements.length - 1];
                const currentElement = document.activeElement as HTMLElement;
                const currentIndex = focusableElements.indexOf(currentElement);

                if (e.key === 'Escape' || e.key === 'ArrowLeft') {
                    onCloseRef.current();
                } else if (e.key === 'Tab') {
                    if (e.shiftKey) {
                        if (document.activeElement === firstElement) {
                            e.preventDefault();
                            lastElement.focus();
                        }
                    } else {
                        if (document.activeElement === lastElement) {
                            e.preventDefault();
                            firstElement.focus();
                        }
                    }
                } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (currentIndex === -1) { 
                        firstElement.focus();
                        return;
                    }
                    if (e.key === 'ArrowDown') {
                        const nextIndex = (currentIndex + 1) % focusableElements.length;
                        focusableElements[nextIndex]?.focus();
                    } else if (e.key === 'ArrowUp') {
                        const prevIndex = (currentIndex - 1 + focusableElements.length) % focusableElements.length;
                        focusableElements[prevIndex]?.focus();
                    }
                }
            };

            document.addEventListener('keydown', handleKeyDown);

            return () => {
                clearTimeout(focusTimer);
                document.removeEventListener('keydown', handleKeyDown);
            }
        }
    }, [isRendered, isAnimatingOut]);
    
    if (!isRendered) return null;

    const animationClass = isAnimatingOut ? 'animate-slide-out-right' : 'animate-slide-in-right';

    return (
        <div
            ref={panelRef}
            className={`fixed top-0 right-0 h-full w-full max-w-md bg-black/80 backdrop-blur-lg z-30 p-4 flex flex-col ${animationClass}`}
            onClick={(e) => e.stopPropagation()}
        >
            <header className="flex items-center justify-between mb-4 flex-shrink-0">
                <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors">
                    <i className="fa-solid fa-arrow-left text-lg"></i>
                </button>
                <h2 className="text-xl font-bold">{title}</h2>
                <div className="w-10 h-10"></div> {/* Spacer */}
            </header>
            <div className="flex-1 overflow-y-auto no-scrollbar">
                {children}
            </div>
        </div>
    );
};

const SubtitlesPanel: React.FC<{
    tracks: { lang: string; url: string; label: string }[],
    activeLang: string | null,
    onSelect: (lang: string | null) => void,
    onClose: () => void,
    triggerRef: React.RefObject<HTMLElement>,
    show: boolean,
    aiLangs?: { code: string; label: string }[],
    onAiTranslate?: (code: string, label: string) => void,
    aiLoadingLabel?: string | null,
}> = ({ tracks, activeLang, onSelect, onClose, triggerRef, show, aiLangs, onAiTranslate, aiLoadingLabel }) => {

    // Return focus on close
    useEffect(() => {
        if (!show) {
            setTimeout(() => triggerRef.current?.focus(), 50);
        }
    }, [show, triggerRef]);

    // AI targets that have not been generated yet (generated ones appear as normal tracks above)
    const pendingAiLangs = (aiLangs || []).filter(l => !tracks.some(t => t.lang === `ai-${l.code}`));

    return (
        <SidePanel title="Subtitles" onClose={onClose} show={show}>
            <div className="flex flex-col gap-2">
                <button onClick={() => { onSelect(null); onClose(); }} className={`player-panel-button ${!activeLang ? 'active' : ''}`}>Off</button>
                {tracks.map(track => (
                    <button key={track.lang} onClick={() => { onSelect(track.lang); onClose(); }} className={`player-panel-button ${activeLang === track.lang ? 'active' : ''}`}>{track.label}</button>
                ))}
                {pendingAiLangs.length > 0 && onAiTranslate && (
                    <>
                        <div className="flex items-center gap-2 mt-3 mb-1 px-1">
                            <i className="fa-solid fa-wand-magic-sparkles text-xs text-purple-400" />
                            <span className="text-zinc-500 text-[10px] uppercase tracking-widest font-bold">AI Subtitles · Gemini</span>
                        </div>
                        {pendingAiLangs.map(lang => (
                            <button
                                key={`ai-${lang.code}`}
                                disabled={!!aiLoadingLabel}
                                onClick={() => { onAiTranslate(lang.code, lang.label); }}
                                className={`player-panel-button justify-between ${aiLoadingLabel === lang.label ? 'active' : ''} ${aiLoadingLabel ? 'opacity-60' : ''}`}
                            >
                                <span>{lang.label}</span>
                                {aiLoadingLabel === lang.label
                                    ? <div className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-white rounded-full animate-spin" />
                                    : <i className="fa-solid fa-wand-magic-sparkles text-xs text-purple-400" />}
                            </button>
                        ))}
                    </>
                )}
            </div>
        </SidePanel>
    );
};

const SettingsPanel: React.FC<{
    onClose: () => void,
    triggerRef: React.RefObject<HTMLElement>,
    playbackRate: number,
    onRateChange: (rate: number) => void,
    qualities: string[],
    activeQuality: string | null,
    onQualityChange: (quality: string) => void,
    show: boolean,
    subtitleSettings: SubtitleSettings;
    onSubtitleSettingsChange: (settings: Partial<SubtitleSettings>) => void;
    activeDubbingLang: string | null;
    onDubbingChange: (lang: string | null) => void;
    isEnhancementActive: boolean;
    onToggleEnhancement: () => void;
}> = ({ onClose, triggerRef, playbackRate, onRateChange, qualities, activeQuality, onQualityChange, show, subtitleSettings, onSubtitleSettingsChange, activeDubbingLang, onDubbingChange, isEnhancementActive, onToggleEnhancement }) => {
    const [view, setView] = useState<'main' | 'speed' | 'quality' | 'subtitleSettings' | 'dubbing'>('main');
    const { t } = useTranslation();
    const mainPanelButtonsRef = useRef<Record<string, HTMLButtonElement | null>>({});
    const previousViewRef = useRef(view);
    
    useEffect(() => {
        if (previousViewRef.current !== 'main' && view === 'main') {
            const buttonToFocus = mainPanelButtonsRef.current[previousViewRef.current];
            setTimeout(() => buttonToFocus?.focus(), 50);
        }
        previousViewRef.current = view;
    }, [view]);

    useEffect(() => {
        if (!show) {
            triggerRef.current?.focus();
            setTimeout(() => setView('main'), 300); 
        }
    }, [show, triggerRef]);

    const renderMain = () => (
        <div className="flex flex-col gap-2">
            <button ref={el => {mainPanelButtonsRef.current['dubbing'] = el}} disabled className="player-panel-button justify-between opacity-50 cursor-not-allowed">
                <span>{t('dubbing')}</span>
                <span className="text-zinc-500 text-xs uppercase tracking-wider font-bold">Coming Soon</span>
            </button>
            <button disabled className="player-panel-button justify-between opacity-50 cursor-not-allowed">
                <span>4K Video Enhancer (AI)</span>
                <span className="text-zinc-500 text-xs uppercase tracking-wider font-bold">Coming Soon</span>
            </button>
            <button ref={el => {mainPanelButtonsRef.current['speed'] = el}} onClick={() => setView('speed')} className="player-panel-button justify-between">
                <span>{t('playbackSpeed')}</span>
                <span className="text-zinc-400">{playbackRate === 1 ? t('auto') : `${playbackRate}x`} <i className="fa-solid fa-chevron-right text-xs"></i></span>
            </button>
            <button ref={el => {mainPanelButtonsRef.current['quality'] = el}} onClick={() => setView('quality')} className="player-panel-button justify-between">
                <span>{t('quality')}</span>
                <span className="text-zinc-400">{activeQuality || t('auto')} <i className="fa-solid fa-chevron-right text-xs"></i></span>
            </button>
            <button ref={el => {mainPanelButtonsRef.current['subtitleSettings'] = el}} onClick={() => setView('subtitleSettings')} className="player-panel-button justify-between">
                <span>{t('subtitleSettings')}</span>
                <span><i className="fa-solid fa-chevron-right text-xs"></i></span>
            </button>
        </div>
    );
    
    const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 2];

    const renderSpeed = () => (
        <div className="flex flex-col gap-2">
            {playbackRates.map(rate => (
                <button key={rate} onClick={() => { onRateChange(rate); setView('main'); }} className={`player-panel-button ${playbackRate === rate ? 'active' : ''}`}>
                    {rate === 1 ? t('auto') : `${rate}x`}
                </button>
            ))}
        </div>
    );

    const renderQuality = () => (
        <div className="flex flex-col gap-2">
            {qualities.map(q => (
                <button key={q} onClick={() => { onQualityChange(q); setView('main'); }} className={`player-panel-button ${activeQuality === q ? 'active' : ''}`}>
                    {q}
                </button>
            ))}
        </div>
    );
    
    const renderDubbing = () => (
        <div className="flex flex-col gap-2">
            <button onClick={() => { onDubbingChange(null); setView('main'); }} className={`player-panel-button ${!activeDubbingLang ? 'active' : ''}`}>
                {t('originalAudio')}
            </button>
            <button onClick={() => { onDubbingChange('ar-ai'); setView('main'); }} className={`player-panel-button ${activeDubbingLang === 'ar-ai' ? 'active' : ''}`}>
                {t('arabicAi')}
            </button>
        </div>
    );

    const renderSubtitleSettings = () => (
        <div className="flex flex-col gap-4">
            {/* Font Size */}
            <div className="mb-2">
                <h4 className="text-sm font-semibold text-zinc-400 mb-2">{t('fontSize')}</h4>
                <div className="flex flex-wrap gap-2">
                    {[75, 100, 125, 150, 175, 200].map(size => (
                        <button key={size} onClick={() => onSubtitleSettingsChange({ fontSize: size })} className={`px-4 py-2 text-sm font-medium rounded-md hover:bg-white/10 transition-colors flex-1 text-center ${subtitleSettings.fontSize === size ? 'bg-white text-black' : 'bg-white/5'}`}>
                            {size}%
                        </button>
                    ))}
                </div>
            </div>

            {/* Background Opacity */}
            <div className="mb-2">
                <h4 className="text-sm font-semibold text-zinc-400 mb-2">{t('backgroundOpacity')}</h4>
                <div className="flex flex-wrap gap-2">
                     {[0, 25, 50, 75, 100].map(opacity => (
                        <button key={opacity} onClick={() => onSubtitleSettingsChange({ backgroundOpacity: opacity })} className={`px-4 py-2 text-sm font-medium rounded-md hover:bg-white/10 transition-colors flex-1 text-center ${subtitleSettings.backgroundOpacity === opacity ? 'bg-white text-black' : 'bg-white/5'}`}>
                            {opacity}%
                        </button>
                    ))}
                </div>
            </div>

            {/* Edge Style */}
            <div className="mb-2">
                <h4 className="text-sm font-semibold text-zinc-400 mb-2">{t('edgeStyle')}</h4>
                <div className="flex flex-wrap gap-2">
                    {(['none', 'drop-shadow', 'outline'] as const).map(style => (
                        <button key={style} onClick={() => onSubtitleSettingsChange({ edgeStyle: style })} className={`px-4 py-2 text-sm font-medium rounded-md hover:bg-white/10 transition-colors flex-1 text-center ${subtitleSettings.edgeStyle === style ? 'bg-white text-black' : 'bg-white/5'}`}>
                            {t(style as any)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Subtitle Timing Offset */}
            <div className="mb-2">
                <h4 className="text-sm font-semibold text-zinc-400 mb-2">{t('timeOffset')}</h4>
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => onSubtitleSettingsChange({ timingOffset: Math.max(-30, Math.round(((subtitleSettings.timingOffset ?? 0) - 0.5) * 10) / 10) })} className="px-4 py-2 text-sm font-medium rounded-md hover:bg-white/10 transition-colors flex-1 text-center bg-white/5">
                        −0.5s
                    </button>
                    <button onClick={() => onSubtitleSettingsChange({ timingOffset: 0 })} className={`px-4 py-2 text-sm font-bold rounded-md hover:bg-white/10 transition-colors flex-1 text-center ${(subtitleSettings.timingOffset ?? 0) !== 0 ? 'bg-white text-black' : 'bg-white/5'}`}>
                        {(subtitleSettings.timingOffset ?? 0) > 0 ? `+${subtitleSettings.timingOffset}s` : `${subtitleSettings.timingOffset ?? 0}s`}
                    </button>
                    <button onClick={() => onSubtitleSettingsChange({ timingOffset: Math.min(30, Math.round(((subtitleSettings.timingOffset ?? 0) + 0.5) * 10) / 10) })} className="px-4 py-2 text-sm font-medium rounded-md hover:bg-white/10 transition-colors flex-1 text-center bg-white/5">
                        +0.5s
                    </button>
                </div>
            </div>

            {/* Vertical Position */}
            <div className="mb-2">
                <h4 className="text-sm font-semibold text-zinc-400 mb-2">{t('verticalPosition')}</h4>
                <input 
                    type="range" 
                    min="5" 
                    max="50" 
                    value={subtitleSettings.verticalPosition}
                    onChange={e => onSubtitleSettingsChange({ verticalPosition: parseInt(e.target.value, 10) })}
                    className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-[var(--primary)]"
                />
            </div>
        </div>
    );

    const titles = {
        main: t('settings'),
        speed: t('playbackSpeed'),
        quality: t('quality'),
        subtitleSettings: t('subtitleSettings'),
        dubbing: t('dubbing')
    };

    return (
        <SidePanel title={titles[view]} onClose={() => view === 'main' ? onClose() : setView('main')} show={show}>
            {view === 'main' && renderMain()}
            {view === 'speed' && renderSpeed()}
            {view === 'quality' && renderQuality()}
            {view === 'subtitleSettings' && renderSubtitleSettings()}
            {view === 'dubbing' && renderDubbing()}
        </SidePanel>
    );
};

const VideoPlayer: React.FC<PlayerProps> = ({ item, itemType, initialSeason, initialEpisode, initialTime, initialStreamUrl, onProviderSelected, onStreamFetchStateChange, setVideoNode, serverPreferences, episodes, onEpisodeSelect, selectedProvider, liveChannels, currentChannelIndex, logo, hideLogo, isLiveScheduleMode, onVideoEnded, liveReason, needsProxy }) => {
    const navigate = useNavigate();
    const { setToast, getScreenSpecificData, setScreenSpecificData } = useProfile();
    const { t, language: userLanguage } = useTranslation();

    const videoRef = useRef<HTMLVideoElement>(null);
    const playerContainerRef = useRef<HTMLDivElement>(null);
    const fetchIdRef = useRef(0);
    const timeOnSwitchRef = useRef(0);
    
    const infoPanelRef = useRef<HTMLDivElement>(null);
    const controlsPanelRef = useRef<HTMLDivElement>(null);
    const progressBarRef = useRef<HTMLDivElement>(null);
    const recsPanelRef = useRef<HTMLDivElement>(null);
    const settingsButtonRef = useRef<HTMLButtonElement>(null);
    const subtitlesButtonRef = useRef<HTMLButtonElement>(null);
    const skipButtonRef = useRef<HTMLButtonElement>(null);
    const adSkipButtonRef = useRef<HTMLButtonElement>(null);
    const lastFocusedControlRef = useRef<HTMLElement | null>(null);
    const channelListButtonRef = useRef<HTMLButtonElement>(null);


    const [streamLinks, setStreamLinks] = useState<StreamLink[]>([]);
    const [activeStreamUrl, setActiveStreamUrl] = useState<string | null>(initialStreamUrl || null);
    const [activeQuality, setActiveQuality] = useState<string | null>(null);
    // HLS level-based qualities (when a single m3u8 master exposes multiple renditions)
    const [hlsQualities, setHlsQualities] = useState<string[]>([]);
    const [recommendations, setRecommendations] = useState<Movie[]>([]);
    
    const [isPlaying, setIsPlaying] = useState(false);
    const [adState, setAdState] = useState<{
        isActive: boolean;
        adIndex: number;
        canSkip: boolean;
        skipCountdown: number;
        adProgress: number;
        hasPlayedInSession: boolean;
    }>({
        isActive: false,
        adIndex: 0,
        canSkip: false,
        skipCountdown: 5,
        adProgress: 0,
        hasPlayedInSession: false
    });
    
    const adStateRef = useRef(adState);
    useEffect(() => {
        adStateRef.current = adState;
    }, [adState]);
    const adVideoRef = useRef<HTMLVideoElement>(null);
    const totalAdTimeRef = useRef(0);
    const lastAdTimeRef = useRef(0);
    // Tracks REAL watched time of the main video (seeking is ignored),
    // so jumping on the progress bar never triggers the ad pause.
    const mainWatchTimeRef = useRef(0);
    const lastMainTimeRef = useRef(0);

    const AD_SOURCES = [
        "https://media.w3.org/2010/05/sintel/trailer.mp4?utm_source=chatgpt.com",
        "https://rr7---sn-5abxgpxuxaxjvh-j1ae.googlevideo.com/videoplayback?expire=1782862368&ei=wP1DaqvSBoiUhcIPlcLe-Ak&ip=41.110.126.207&id=o-APwaxZfkaXGtmisLipcLXVwclVeNY9vBGaYd31WK14Kl&itag=299&source=youtube&requiressl=yes&xpc=EgVo2aDSNQ%3D%3D&cps=292&met=1782840768%2C&mh=jE&mm=31%2C29&mn=sn-5abxgpxuxaxjvh-j1ae%2Csn-h5q7kned&ms=au%2Crdu&mv=m&mvi=7&pl=23&rms=au%2Cau&initcwndbps=576250&bui=ARmQxEVIX3PNIEFF_DhnLzxuOLPXFfqs-xOSRkwqBbLS1hQa2h7VWax4hSiXONifCUaH-IlC9FaSsufB&spc=SQ-umurvU3ICwW_HuF7-WyjTZ8_5Miw30lGI0-TykhC-&vprv=1&svpuc=1&mime=video%2Fmp4&rqh=1&gir=yes&clen=35473092&dur=153.340&lmt=1767239705822326&mt=1782840292&fvip=4&keepalive=yes&fexp=51565116%2C51565681%2C52017147&c=ANDROID_VR&txp=5532534&sparams=expire%2Cei%2Cip%2Cid%2Citag%2Csource%2Crequiressl%2Cxpc%2Cbui%2Cspc%2Cvprv%2Csvpuc%2Cmime%2Crqh%2Cgir%2Cclen%2Cdur%2Clmt&sig=AHEqNM4wRQIgNESy7wlWJYfnje061LjDWs975tOYegZfvtStDJDwjI4CIQC79f6WqlxpGmyHxGjGywZZeRc7OU2cImEOWv5Mfl2ooQ%3D%3D&lsparams=cps%2Cmet%2Cmh%2Cmm%2Cmn%2Cms%2Cmv%2Cmvi%2Cpl%2Crms%2Cinitcwndbps&lsig=APaTxxMwRQIgYKzfybAHaDpnDDjXm80r6kAl3jp4S4yPHuk0kwEIW1oCIQCLdayw-aw7gvDdAdZ96mtDVKOyrPI6JKET9LkYkJAsOg%3D%3D&cpn=zAw7EOY6o-kd4JSJ"
    ];

    useEffect(() => {
        const adVid = adVideoRef.current;
        if (adState.isActive && adVid) {
            adVid.play().catch(e => console.error("Failed to play ad:", e));
        }
        return () => {
            if (adVid) {
                adVid.pause();
                adVid.removeAttribute('src');
                adVid.load();
            }
        };
    }, [adState.isActive, adState.adIndex]);

    const [showAutoSkipAlert, setShowAutoSkipAlert] = useState(false);
    const [isAutoSkipAlertExiting, setIsAutoSkipAlertExiting] = useState(false);

    // Prevent browser scrolling via arrow keys/space while the video player is mounted
    useEffect(() => {
        const preventScrollKeys = (e: KeyboardEvent) => {
            const scrollKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'PageUp', 'PageDown', 'Home', 'End'];
            if (scrollKeys.includes(e.key)) {
                const target = e.target as HTMLElement;
                if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
                    return;
                }
                e.preventDefault();
            }
        };
        window.addEventListener('keydown', preventScrollKeys, { passive: false });
        return () => {
            window.removeEventListener('keydown', preventScrollKeys);
        };
    }, []);

    // Callback to trigger ad auto-skip after 30 seconds of actual continuous playback
    const triggerAdAutoSkip = useCallback(() => {
        if (adStateRef.current.isActive) {
            console.log("Ad auto-skipped after 30 seconds of continuous playback");
            
            setAdState(prev => ({ ...prev, isActive: false, hasPlayedInSession: true }));
            videoRef.current?.play().catch(()=>{});

            // Explicitly focus player controls so focus is not lost on TV
            setTimeout(() => {
                const controlsFocusables = Array.from(controlsPanelRef.current?.querySelectorAll('.focusable') || []) as HTMLElement[];
                if (controlsFocusables.length > 0) {
                    controlsFocusables[0].focus({ preventScroll: true });
                } else if (progressBarRef.current) {
                    progressBarRef.current.focus({ preventScroll: true });
                }
                setIsOverlayVisible(true);
            }, 100);

            setShowAutoSkipAlert(true);
            setIsAutoSkipAlertExiting(false);

            setTimeout(() => {
                setIsAutoSkipAlertExiting(true);
                setTimeout(() => {
                    setShowAutoSkipAlert(false);
                    setIsAutoSkipAlertExiting(false);
                }, 400);
            }, 4000);
        }
    }, []);



    const [isBuffering, setIsBuffering] = useState(true);
    const [isOverlayVisible, setIsOverlayVisible] = useState(true);
    const [isRecsFocused, setIsRecsFocused] = useState(false);
    const [currentTime, setCurrentTime] = useState(initialTime || 0);
    const [duration, setDuration] = useState(0);
    const [bufferedTime, setBufferedTime] = useState(0);
    const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
    const [vttTracks, setVttTracks] = useState<{ lang: string; url: string; label: string }[]>([]);
    const [activeSubtitleLang, setActiveSubtitleLang] = useState<string | null>(null);

    // ---- Addon platform: subtitle sources, AI translate & auto-skip (all optional, best-effort) ----
    const { addons } = useAddons();
    const addonPlayerConfig = useMemo(() => collectAddonPlayerConfig(addons), [addons]);
    const [addonSubtitles, setAddonSubtitles] = useState<SubtitleTrack[]>([]);
    const [aiVttTracks, setAiVttTracks] = useState<{ lang: string; url: string; label: string }[]>([]);
    const [aiSubLoadingLabel, setAiSubLoadingLabel] = useState<string | null>(null);
    const aiSubProgressRef = useRef('');
    const autoSkipDoneRef = useRef<{ intro?: boolean; outro?: boolean }>({});
    const skipAnalysisFromAddonRef = useRef(false);
    // Stream subtitles + addon subtitles, deduplicated by language (stream tracks win)
    const allSubtitles = useMemo(() => {
        const seen = new Set<string>();
        const merged: SubtitleTrack[] = [];
        for (const sub of [...subtitles, ...addonSubtitles]) {
            if (!sub || !sub.url || seen.has(sub.language)) continue;
            seen.add(sub.language);
            merged.push(sub);
        }
        return merged;
    }, [subtitles, addonSubtitles]);
    const [activeCues, setActiveCues] = useState<VTTCue[]>([]);
    const defaultSubtitleSettings: SubtitleSettings = { fontSize: 100, backgroundOpacity: 0, edgeStyle: 'outline', verticalPosition: 10, timingOffset: 0 };
    const [subtitleSettings, setSubtitleSettings] = useState<SubtitleSettings>(() => getScreenSpecificData('subtitleSettings', defaultSubtitleSettings));
    
    const [showSettingsPanel, setShowSettingsPanel] = useState(false);
    const [showSubtitlesPanel, setShowSubtitlesPanel] = useState(false);
    const [isChannelListVisible, setIsChannelListVisible] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1);

    const [skipSegments, setSkipSegments] = useState<{ intro: SkipSegment | null; outro: SkipSegment | null }>({ intro: null, outro: null });
    const [activeSkip, setActiveSkip] = useState<'intro' | 'outro' | null>(null);

    const [upNextItem, setUpNextItem] = useState<{ title: string, subtitle: string, type: 'tv' | 'movie', data: any } | null>(null);
    const [showUpNext, setShowUpNext] = useState(false);
    const upNextTriggeredRef = useRef(false);
    const upNextAutoPlayTriggeredRef = useRef(false);
    const upNextItemRef = useRef(upNextItem);
    const showUpNextRef = useRef(showUpNext);

    useEffect(() => { upNextItemRef.current = upNextItem; }, [upNextItem]);
    useEffect(() => { showUpNextRef.current = showUpNext; }, [showUpNext]);

    const recommendationsRef = useRef(recommendations);
    useEffect(() => { recommendationsRef.current = recommendations; }, [recommendations]);

    const episodesRef = useRef(episodes);
    useEffect(() => { episodesRef.current = episodes; }, [episodes]);
    
    const initialEpisodeRef = useRef(initialEpisode);
    useEffect(() => { initialEpisodeRef.current = initialEpisode; }, [initialEpisode]);

    const handlePlayNext = useCallback((nextItem: any) => {
        if (nextItem.type === 'tv') {
            onEpisodeSelect(nextItem.data);
        } else {
            navigate('/player', { state: { item: nextItem.data, type: 'movie' }, replace: true });
        }
        setShowUpNext(false);
        upNextTriggeredRef.current = false;
        upNextAutoPlayTriggeredRef.current = false;
        setUpNextItem(null);
    }, [onEpisodeSelect, navigate]);

    const [activeDubbingLang, setActiveDubbingLang] = useState<string | null>(null);
    const [isDubbingLoading, setIsDubbingLoading] = useState(false);
    const [dubbingProgress, setDubbingProgress] = useState('');
    const audioContextRef = useRef<AudioContext | null>(null);
    const dubbingSegmentsRef = useRef<Map<string, { audioBuffer: AudioBuffer; startTime: number; endTime: number }>>(new Map());
    const scheduledSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const scheduledSegmentIds = useRef<Set<string>>(new Set());
    const dubbingTimestampsRef = useRef<{ start: number; end: number }[]>([]);

    const [isMuted, setIsMuted] = useState(true);
    const hlsRef = useRef<Hls.default | null>(null);
    const mpegtsRef = useRef<any>(null);
    const [isEnhancementActive, setIsEnhancementActive] = useState(false);
    const [enhancerCssFallback, setEnhancerCssFallback] = useState(false);
    const enhancementCanvasRef = useRef<HTMLCanvasElement>(null);
    const enhancementAnimFrame = useRef<number>(0);

    const toggleMute = useCallback(() => {
        setIsMuted(prev => !prev);
    }, []);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.muted = isMuted;
        }
    }, [isMuted]);

    const handleSelectChannel = useCallback((index: number) => {
        if (!liveChannels || typeof currentChannelIndex !== 'number') return;
        if (index === currentChannelIndex) {
            setIsChannelListVisible(false);
            return;
        }
    
        const nextChannel = liveChannels[index];
    
        const nextState = {
            item: { id: nextChannel.id, name: nextChannel.name, title: nextChannel.name, logo: nextChannel.logo },
            streamUrl: nextChannel.streamUrl,
            liveChannels: liveChannels,
            currentChannelIndex: index,
            logo: nextChannel.logo,
            hideLogo: hideLogo,
            needsProxy: nextChannel.needsProxy,
        };
    
        if (nextChannel.playerType === 'iframe') {
            navigate('/iframe-player', { state: nextState, replace: true });
        } else {
            navigate('/player', { state: { ...nextState, type: 'movie' }, replace: true });
        }
    }, [liveChannels, currentChannelIndex, navigate]);

    const handleSubtitleSettingsChange = (newSettings: Partial<SubtitleSettings>) => {
        setSubtitleSettings(prev => {
            const updated = { ...prev, ...newSettings };
            setScreenSpecificData('subtitleSettings', updated);
            return updated;
        });
    };

    useEffect(() => {
        if (setVideoNode && videoRef.current) {
            setVideoNode(videoRef.current);
        }
    }, [setVideoNode]);

    // Effect to handle initial and subsequent focusing when controls become visible
    useEffect(() => {
        if (isOverlayVisible && !showSettingsPanel && !showSubtitlesPanel) {
            const focusTimer = setTimeout(() => {
                const playerContainer = playerContainerRef.current;
                if (!playerContainer) return;

                const activeElement = document.activeElement;
                const isFocusOutsidePlayer = !activeElement || activeElement === document.body || !playerContainer.contains(activeElement);

                if (isFocusOutsidePlayer) {
                    const titleElement = infoPanelRef.current?.querySelector<HTMLElement>('.focusable');
                    if (titleElement) {
                        titleElement.focus({ preventScroll: true });
                    }
                }
            }, 150);
            return () => clearTimeout(focusTimer);
        }
    }, [isOverlayVisible, showSettingsPanel, showSubtitlesPanel]);

    useEffect(() => {
        if(videoRef.current) {
            videoRef.current.playbackRate = playbackRate;
        }
    }, [playbackRate]);

    useEffect(() => {
        if (!isEnhancementActive) {
            setEnhancerCssFallback(false);
            return;
        }
        const video = videoRef.current;
        const canvas = enhancementCanvasRef.current;
        if (!video || !canvas) return;

        let enhancer: VideoEnhancer4K | null = null;
        try {
            // True 4K enhancement: GPU bicubic upscale + FSR-style RCAS sharpening.
            enhancer = new VideoEnhancer4K(video, canvas, () => {
                // Device/stream can't run the GPU path — degrade to a CSS-filter
                // enhancement on the video element itself (zero overhead).
                setEnhancerCssFallback(true);
            });
            enhancer.start();
            setEnhancerCssFallback(false);
        } catch (e) {
            enhancer = null;
            setEnhancerCssFallback(true);
        }

        return () => {
            enhancer?.dispose();
        };
    }, [isEnhancementActive, activeStreamUrl]);

    // Effect 1: Fetch the stream URL and other data
    useEffect(() => {
        let isMounted = true;
        if (initialStreamUrl) {
            setActiveStreamUrl(initialStreamUrl);
        }
        const fetchData = async () => {
            const fetchId = ++fetchIdRef.current;
            onStreamFetchStateChange(true);
            setIsBuffering(true);
            if (!initialStreamUrl) setActiveStreamUrl(null);
            setSubtitles([]);
            setVttTracks([]);
            setSkipSegments({ intro: null, outro: null });
            // Reset addon-provided subtitle state for the new title
            setAddonSubtitles([]);
            setAiVttTracks(prev => { prev.forEach(t2 => URL.revokeObjectURL(t2.url)); return []; });
            autoSkipDoneRef.current = {};
            skipAnalysisFromAddonRef.current = false;
            
            try {
                // Fetch recommendations in the background — never block video start
                if (!liveChannels && !isLiveScheduleMode) {
                    fetchFromTMDB(`/${itemType}/${item.id}/recommendations`)
                        .then((recsData) => { if (isMounted) setRecommendations(recsData.results.filter((m: Movie) => m.backdrop_path)); })
                        .catch(() => {});
                }


                // Fetch stream
                 if (!initialStreamUrl) {
                    const data = await fetchStreamUrl(item, itemType, initialSeason, initialEpisode?.episode_number, selectedProvider || undefined, serverPreferences);
                    if (!isMounted || fetchIdRef.current !== fetchId) return;

                    if (data.links && data.links.length > 0) {
                        setStreamLinks(data.links);
                        const initialLink = data.links[0];
                        setActiveStreamUrl(initialLink.url);
                        setActiveQuality(initialLink.quality);
                        if (data.subtitles && data.subtitles.length > 0) {
                            setSubtitles(data.subtitles);
                            // Trigger analysis non-blocking
                            const firstSub = data.subtitles[0];
                            fetch(firstSub.url)
                                .then(res => res.ok ? res.text() : Promise.reject('Failed to fetch subs'))
                                .then(srtText => analyzeSubtitlesForSkips(srtText))
                                .then(segments => { if (isMounted) setSkipSegments(segments); })
                                .catch(e => console.error("Failed to fetch/analyze subtitles for skip markers", e));
                        }
                        onProviderSelected(data.provider);
                    } else {
                        throw new Error(t('noStreamLinks'));
                    }
                }
            } catch (error: any) {
                if (isMounted && fetchIdRef.current === fetchId) {
                    setToast({ message: error.message, type: 'error' });
                }
            } finally {
                if (isMounted && fetchIdRef.current === fetchId) {
                    onStreamFetchStateChange(false);
                }
            }
        };
        if (!isLiveScheduleMode) {
            fetchData();
        }
        return () => {
            isMounted = false;
        };
    }, [item.id, initialEpisode?.id, selectedProvider, serverPreferences.join(), isLiveScheduleMode]);

    // Effect 2: Play the video
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !activeStreamUrl) {
            setIsBuffering(true);
            return;
        }
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }
        if (mpegtsRef.current) {
            try {
                mpegtsRef.current.pause();
                mpegtsRef.current.unload();
                mpegtsRef.current.detachMediaElement();
                mpegtsRef.current.destroy();
            } catch (e) {
                console.error("Error destroying mpegts player:", e);
            }
            mpegtsRef.current = null;
        }
        const hls = new Hls.default(HLS_TUNING);
        hlsRef.current = hls;
        setHlsQualities([]);
        const savedTime = timeOnSwitchRef.current > 0 ? timeOnSwitchRef.current : (initialTime || 0);
        timeOnSwitchRef.current = 0;
        
        const loadProxiedSource = async (sourceUrl: string, hlsInstance: Hls.default) => {
            const proxy = 'https://api.codetabs.com/v1/proxy?quest=';
            try {
                const res = await fetch(proxy + encodeURIComponent(sourceUrl));
                let manifest = await res.text();
                const baseUrl = sourceUrl.substring(0, sourceUrl.lastIndexOf('/') + 1);
                const resolveUrl = (base: string, relative: string) => {
                    try { return new URL(relative, base).href; } catch { return relative; }
                }
                manifest = manifest.replace(/^(?!#)(.*)$/gm, line => {
                    const trimmedLine = line.trim();
                    if(trimmedLine.length > 0) {
                        const absolute = resolveUrl(baseUrl, trimmedLine);
                        return proxy + encodeURIComponent(absolute);
                    }
                    return line;
                });
                const blob = new Blob([manifest], { type: 'application/vnd.apple.mpegurl' });
                const blobUrl = URL.createObjectURL(blob);
                
                hlsInstance.loadSource(blobUrl);
                hlsInstance.attachMedia(video);
                hlsInstance.on(Hls.default.Events.MANIFEST_PARSED, () => {
                    video.currentTime = savedTime;
                    video.play().catch(() => {});
                });
            } catch(error) {
                console.error("Failed to load proxied source", error);
                setToast({ message: "Failed to load proxied video stream.", type: 'error' });
            }
        };

        if (needsProxy) {
            loadProxiedSource(activeStreamUrl, hls);
        } else if (activeStreamUrl.includes('.m3u8') && Hls.default.isSupported()) {
            let errorHandled = false;
            let internalRetries = 0;
            // Our own backend proxy URLs must never be wrapped in an external
            // proxy (it breaks relative URLs). They self-heal server-side,
            // so a simple delayed reload is the correct recovery.
            const isInternalUrl = activeStreamUrl.startsWith('/api/') || activeStreamUrl.startsWith(window.location.origin);
            hls.on(Hls.default.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    switch (data.type) {
                        case Hls.default.ErrorTypes.NETWORK_ERROR:
                            if (isInternalUrl) {
                                if (internalRetries < 3) {
                                    internalRetries++;
                                    console.log(`fatal network error, retrying internal stream (${internalRetries}/3)`);
                                    setTimeout(() => { try { hls.startLoad(); } catch {} }, 1000 * internalRetries);
                                } else {
                                    hls.destroy();
                                    setToast({ message: t('noStreamLinks'), type: 'error' });
                                }
                            } else if (!errorHandled) {
                                console.log("fatal network error encountered, try to recover using proxy");
                                errorHandled = true;
                                hls.destroy();
                                const newHls = new Hls.default(HLS_TUNING);
                                hlsRef.current = newHls;
                                loadProxiedSource(activeStreamUrl, newHls);
                            }
                            break;
                        case Hls.default.ErrorTypes.MEDIA_ERROR:
                            console.log("fatal media error encountered, try to recover");
                            hls.recoverMediaError();
                            break;
                        default:
                            hls.destroy();
                            break;
                    }
                }
            });

            // Expose HLS renditions in the quality modal (Auto + heights),
            // exactly like multi-link providers, when the source is a
            // single master playlist with multiple levels. Published once,
            // re-checked on LEVEL_LOADED in case levels arrive late.
            let levelsPublished = false;
            const publishHlsLevels = () => {
                if (levelsPublished) return;
                try {
                    const levels = hls.levels || [];
                    if (levels.length > 1) {
                        const heights = [...new Set(levels.map(l => l.height).filter(Boolean))].sort((a, b) => b - a);
                        if (heights.length > 1) {
                            levelsPublished = true;
                            setHlsQualities(heights.map(h => `${h}p`));
                            hls.currentLevel = -1; // Auto by default
                        }
                    }
                } catch {}
            };

            hls.loadSource(activeStreamUrl);
            hls.attachMedia(video);
            hls.on(Hls.default.Events.MANIFEST_PARSED, () => {
                video.currentTime = savedTime;
                video.play().catch(() => {});
                publishHlsLevels();
            });
            hls.on(Hls.default.Events.LEVEL_LOADED, publishHlsLevels);
        } else if (activeStreamUrl.includes('/api/live-proxy') && !activeStreamUrl.match(/\.(mp4|mkv|webm)$/i) && mpegts.isSupported()) {
            const player = mpegts.createPlayer({
                type: 'mpegts',
                isLive: true,
                url: activeStreamUrl,
            }, {
                enableWorker: false,
                lazyLoad: false,
                liveBufferLatencyChasing: true,
                liveBufferLatencyMaxLatency: 3,
                liveBufferLatencyMinRemain: 1,
                enableStashBuffer: false
            });
            mpegtsRef.current = player;
            
            player.on(mpegts.Events.ERROR, (errorType: string, errorDetail: string, errorInfo: string) => {
                console.error("MpegTS Error:", errorType, errorDetail, errorInfo);
                setToast({ message: `MPEG-TS Error: ${errorType} - ${errorDetail}`, type: 'error' });
            });

            player.on(mpegts.Events.MEDIA_INFO, (mediaInfo: any) => {
                console.log("MpegTS Media Info:", mediaInfo);
            });

            player.attachMediaElement(video);
            player.load();
            
            // Wait for media info before playing to avoid interruption
            const playPromise = player.play();
            if (playPromise !== undefined) {
                playPromise.catch((error: any) => {
                    console.warn("MpegTS autoplay prevented or interrupted:", error);
                    // Often just an interruption, the video will still play once buffered if autoPlay is set
                });
            }
        } else {
            video.src = activeStreamUrl;
            video.addEventListener('loadeddata', () => {
                video.currentTime = savedTime;
                video.play().catch(error => console.warn("Autoplay was prevented.", error));
            }, { once: true });
        }
        return () => {
            hlsRef.current?.destroy();
            if (mpegtsRef.current) {
                try {
                    mpegtsRef.current.pause();
                    mpegtsRef.current.unload();
                    mpegtsRef.current.detachMediaElement();
                    mpegtsRef.current.destroy();
                } catch (e) {
                    console.error("Error destroying mpegts player:", e);
                }
                mpegtsRef.current = null;
            }
            if (video) {
                video.pause();
                video.removeAttribute('src');
                video.load();
            }
        };
    }, [activeStreamUrl, needsProxy]);

    // Effect for handling quality changes
    useEffect(() => {
        // Do nothing if quality is not selected or video isn't ready
        if (!activeQuality || !videoRef.current) return;

        // HLS level-based switching (single master playlist): instant, no reload
        if (hlsQualities.length > 0 && hlsRef.current) {
            const hls = hlsRef.current;
            if (activeQuality === 'Auto') {
                if (hls.currentLevel !== -1) hls.currentLevel = -1;
                return;
            }
            const wantedHeight = parseInt(activeQuality);
            if (!isNaN(wantedHeight)) {
                const idx = (hls.levels || []).findIndex(l => l.height === wantedHeight);
                if (idx >= 0 && hls.currentLevel !== idx) {
                    console.log(`Switching HLS level to: ${activeQuality}`);
                    hls.currentLevel = idx;
                }
                return;
            }
        }

        if (streamLinks.length === 0) return;
        const newLink = streamLinks.find(link => link.quality === activeQuality);

        // Check if a new link is found and it's different from the current one
        if (newLink && newLink.url !== activeStreamUrl) {
            console.log(`Changing quality to: ${activeQuality}`);
            // Save current time to resume playback smoothly
            timeOnSwitchRef.current = videoRef.current.currentTime;
            // Set the new stream URL, which will trigger the playback effect
            setActiveStreamUrl(newLink.url);
        }
    }, [activeQuality, streamLinks, activeStreamUrl, hlsQualities]);
    
    // Effect 2.5: Fetch subtitles contributed by enabled addons (best effort)
    useEffect(() => {
        if (liveChannels || isLiveScheduleMode || !item?.id) return;
        if (addonPlayerConfig.sources.length === 0) return;
        let active = true;
        fetchAddonSubtitles(
            addonPlayerConfig.sources,
            itemType === 'tv' ? 'tv' : 'movie',
            item.id,
            initialSeason,
            initialEpisode?.episode_number,
        ).then(tracks => {
            if (active && tracks.length > 0) setAddonSubtitles(tracks);
        }).catch(() => {});
        return () => { active = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item.id, itemType, initialEpisode?.id, addonPlayerConfig.sources]);

    // Effect 2.6: If the stream itself had no subtitles, run the Gemini
    // intro/outro analysis on the first addon-provided subtitle instead.
    useEffect(() => {
        if (liveChannels || isLiveScheduleMode) return;
        if (subtitles.length > 0 || addonSubtitles.length === 0) return;
        if (skipAnalysisFromAddonRef.current) return;
        skipAnalysisFromAddonRef.current = true;
        let active = true;
        const first = addonSubtitles.find(s => s.language.startsWith('en')) || addonSubtitles[0];
        fetch(first.url)
            .then(res => res.ok ? res.text() : Promise.reject('Failed to fetch addon subs'))
            .then(srtText => analyzeSubtitlesForSkips(srtText))
            .then(segments => { if (active) setSkipSegments(segments); })
            .catch(e => console.error("Failed to analyze addon subtitles for skip markers", e));
        return () => { active = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [addonSubtitles, subtitles]);

    // Effect 3: Process subtitles
    useEffect(() => {
        let active = true;
        let createdUrls: string[] = [];
        const processSubtitles = async () => {
            const srtTimestampLineRegex = /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/g;
            const processSrtToVtt = (srtText: string) => {
                let vttContent = "WEBVTT\n\n";
                vttContent += srtText.replace(/\r/g, '').replace(srtTimestampLineRegex, (_, s, e) => `${s.replace(',', '.')} --> ${e.replace(',', '.')}`);
                const blob = new Blob([vttContent], { type: 'text/vtt' });
                const vttUrl = URL.createObjectURL(blob);
                createdUrls.push(vttUrl);
                return vttUrl;
            };
            const newTracks: { lang: string; url: string; label: string }[] = [];
            for (const sub of allSubtitles) {
                try {
                    const res = await fetch(sub.url);
                    if (!res.ok || !active) continue;
                    const srtText = await res.text();
                    const vttUrl = processSrtToVtt(srtText);
                    newTracks.push({ lang: sub.language, url: vttUrl, label: sub.display });
                } catch (e) { console.error(`Failed to process subtitle: ${sub.display}`, e); }
            }
            if (active) setVttTracks(newTracks);
        };
        if (allSubtitles.length > 0) processSubtitles(); else setVttTracks([]);
        return () => {
            active = false;
            createdUrls.forEach(url => URL.revokeObjectURL(url));
        }
    }, [allSubtitles]);

     useEffect(() => {
        const video = videoRef.current;
        if (!video || !video.textTracks) return;

        let activeTrack: TextTrack | null = null;
        const onCueChange = () => {
            if (activeTrack && activeTrack.activeCues) {
                setActiveCues(Array.from(activeTrack.activeCues) as VTTCue[]);
            } else { setActiveCues([]); }
        };

        for (let i = 0; i < video.textTracks.length; i++) {
            const track = video.textTracks[i];
            track.mode = 'hidden';
            if (track.language === activeSubtitleLang) activeTrack = track;
        }

        if (activeTrack) {
            onCueChange();
            activeTrack.addEventListener('cuechange', onCueChange);
        } else { setActiveCues([]); }

        return () => { if (activeTrack) activeTrack.removeEventListener('cuechange', onCueChange); };
    }, [activeSubtitleLang, vttTracks, aiVttTracks]);

    // Subtitle timing offset (+/-): shifts every cue by the configured amount.
    // Original times are remembered on each cue, so the offset is always
    // applied from the true baseline and can be changed or reset at any time.
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !video.textTracks) return;
        const offset = subtitleSettings.timingOffset ?? 0;
        const applyOffset = () => {
            for (let i = 0; i < video.textTracks.length; i++) {
                const cues = video.textTracks[i].cues;
                if (!cues) continue;
                for (let j = 0; j < cues.length; j++) {
                    const cue = cues[j] as VTTCue & { _origStart?: number; _origEnd?: number };
                    if (cue._origStart === undefined) { cue._origStart = cue.startTime; cue._origEnd = cue.endTime; }
                    const newStart = Math.max(0, cue._origStart + offset);
                    const newEnd = Math.max(newStart + 0.1, (cue._origEnd ?? cue.endTime) + offset);
                    if (cue.startTime !== newStart) cue.startTime = newStart;
                    if (cue.endTime !== newEnd) cue.endTime = newEnd;
                }
            }
        };
        applyOffset();
        // Cues can load asynchronously after tracks mount, so retry briefly.
        const timers = [setTimeout(applyOffset, 500), setTimeout(applyOffset, 2000)];
        return () => timers.forEach(clearTimeout);
    }, [subtitleSettings.timingOffset, activeSubtitleLang, vttTracks, aiVttTracks]);

    useEffect(() => {
        if (userLanguage === 'ar' && vttTracks.length > 0) {
            const arabicTrack = vttTracks.find(track => track.lang === 'ar');
            setActiveSubtitleLang(arabicTrack ? 'ar' : null);
        }
    }, [vttTracks, userLanguage]);
    
    // Effect 4: Handle video events to update UI state
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const onPlay = () => {
            if (adStateRef.current.isActive) {
                video.pause();
                setIsPlaying(false);
            } else {
                setIsPlaying(true);
            }
        };
        const onPause = () => setIsPlaying(false);
        const onTimeUpdate = () => {
            if (adStateRef.current.isActive) {
                video.pause();
                return;
            }
            setCurrentTime(video.currentTime);

            // Accumulate only continuously-watched time. Large jumps (seeks)
            // are excluded so moving on the progress bar never pauses playback.
            const mainDelta = video.currentTime - lastMainTimeRef.current;
            if (mainDelta > 0 && mainDelta < 1) {
                mainWatchTimeRef.current += mainDelta;
            }
            lastMainTimeRef.current = video.currentTime;

            // Ad trigger logic (after 5 minutes = 300 seconds of actual watched playback)
            if (!adStateRef.current.hasPlayedInSession && !adStateRef.current.isActive && mainWatchTimeRef.current >= 300) {
                totalAdTimeRef.current = 0;
                lastAdTimeRef.current = 0;
                setAdState(prev => ({ ...prev, isActive: true, skipCountdown: 5, adProgress: 0 }));
                video.pause();
            }

            if (activeDubbingLang === 'ar-ai') {
                const isDubPlaying = dubbingTimestampsRef.current.some(
                    seg => video.currentTime >= seg.start && video.currentTime < seg.end
                );
                video.volume = isDubPlaying ? 0 : 1.0;
            }

            if (!liveChannels && !isLiveScheduleMode && video.duration > 0) {
                const remaining = video.duration - video.currentTime;
                
                if (remaining <= 30 && remaining > 0 && !upNextTriggeredRef.current) {
                    upNextTriggeredRef.current = true;
                    let nextData = null;
                    if (itemType === 'tv' && initialEpisodeRef.current && episodesRef.current.length > 0) {
                        const currentIndex = episodesRef.current.findIndex(e => e.id === initialEpisodeRef.current?.id);
                        if (currentIndex !== -1 && currentIndex < episodesRef.current.length - 1) {
                            const nextEp = episodesRef.current[currentIndex + 1];
                            nextData = {
                                title: nextEp.name,
                                subtitle: `${t('season')} ${initialSeason} ${t('episodeCountLabel')} ${nextEp.episode_number}`,
                                type: 'tv',
                                data: nextEp
                            };
                        }
                    } else if (itemType === 'movie' && recommendationsRef.current.length > 0) {
                        const randRec = recommendationsRef.current[Math.floor(Math.random() * recommendationsRef.current.length)];
                        nextData = {
                            title: randRec.title || randRec.name || 'Next Movie',
                            subtitle: randRec.release_date ? randRec.release_date.substring(0, 4) : '',
                            type: 'movie',
                            data: randRec
                        };
                    }
                    
                    if (nextData) {
                        setUpNextItem(nextData as any);
                        setShowUpNext(true);
                    }
                }

                if (remaining <= 5 && remaining > 0 && showUpNextRef.current && upNextItemRef.current && !upNextAutoPlayTriggeredRef.current) {
                    upNextAutoPlayTriggeredRef.current = true;
                    handlePlayNext(upNextItemRef.current);
                }
            }
        };
        const onDurationChange = () => {
            const currentDuration = video.duration;
            if (currentDuration && currentDuration > 0 && !isNaN(currentDuration)) {
                setDuration(currentDuration);
            }
        };
        const onWaiting = () => setIsBuffering(true);
        const onPlaying = () => { setIsBuffering(false); };
        const onProgress = () => {
            if (video.buffered.length > 0) {
                setBufferedTime(video.buffered.end(video.buffered.length - 1));
            }
        };
        const onEnded = () => { if(onVideoEnded) onVideoEnded(); };
        video.addEventListener('play', onPlay); video.addEventListener('pause', onPause);
        video.addEventListener('timeupdate', onTimeUpdate); video.addEventListener('durationchange', onDurationChange);
        video.addEventListener('waiting', onWaiting); video.addEventListener('playing', onPlaying);
        video.addEventListener('progress', onProgress);
        video.addEventListener('ended', onEnded);
        
        setIsPlaying(!video.paused);
        setCurrentTime(video.currentTime);
        setDuration(video.duration || 0);
        setIsBuffering(video.readyState < 3 && !video.paused);
        
        return () => {
            video.removeEventListener('play', onPlay); video.removeEventListener('pause', onPause);
            video.removeEventListener('timeupdate', onTimeUpdate); video.removeEventListener('durationchange', onDurationChange);
            video.removeEventListener('waiting', onWaiting); video.removeEventListener('playing', onPlaying);
            video.removeEventListener('progress', onProgress);
            video.removeEventListener('ended', onEnded);
        };
    }, [activeDubbingLang, onVideoEnded]);

    const togglePlay = useCallback(() => {
        if (showSettingsPanel || showSubtitlesPanel) return;
        if (adState.isActive) {
            const adVideo = adVideoRef.current;
            if (adVideo) {
                if (adVideo.paused) {
                    adVideo.play().catch(() => {});
                } else {
                    adVideo.pause();
                }
            }
            return;
        }
        const video = videoRef.current;
        if (!video) return;
    
        if (video.paused) {
            video.play().catch(e => setToast({ message: t('failedToLoadVideo'), type: "error" }));
        } else {
            video.pause();
        }
    }, [setToast, t, showSettingsPanel, showSubtitlesPanel, adState.isActive]);

    // Keyboard navigation and visibility control
     useEffect(() => {
        if (showSettingsPanel || showSubtitlesPanel || isChannelListVisible) {
            return;
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (adState.isActive) {
                if (adState.canSkip) {
                    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                        e.preventDefault();
                        e.stopPropagation();
                        adSkipButtonRef.current?.focus();
                    } else if (e.key === 'Enter' || e.key === ' ') {
                        if (document.activeElement === adSkipButtonRef.current) {
                            // Handled by the button click
                        } else {
                            e.preventDefault();
                            e.stopPropagation();
                            adSkipButtonRef.current?.click();
                        }
                    }
                }
                return;
            }

            const active = document.activeElement as HTMLElement;
            const skipButton = skipButtonRef.current;
            const isSkipVisible = skipButton && getComputedStyle(skipButton).visibility !== 'hidden' && getComputedStyle(skipButton).display !== 'none';
            const infoFocusables = Array.from(infoPanelRef.current?.querySelectorAll('.focusable') || []) as HTMLElement[];
            const controlsFocusables = Array.from(controlsPanelRef.current?.querySelectorAll('.focusable') || []) as HTMLElement[];
            const allTopControls = [...infoFocusables, ...controlsFocusables];
            const progressFocusable = progressBarRef.current;
            const recsFocusables = Array.from(recsPanelRef.current?.querySelectorAll('.focusable') || []) as HTMLElement[];

            const allPlayerFocusables = [
                ...(isSkipVisible ? [skipButton] : []),
                ...allTopControls,
                ...(progressFocusable ? [progressFocusable] : []),
                ...recsFocusables
            ].filter((el): el is HTMLElement => !!el);

            const isFocusInPlayer = allPlayerFocusables.includes(active);

            if (!isFocusInPlayer) {
                // Controls are hidden: OK toggles play/pause instead of revealing them.
                // Arrow keys still reveal the controls.
                if ((e.key === 'Enter' || e.key === ' ') && !isOverlayVisible) {
                    e.preventDefault();
                    e.stopPropagation();
                    togglePlay();
                    return;
                }
                if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(e.key)) {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsOverlayVisible(true);
                    
                    if (isSkipVisible && skipButton) {
                        skipButton.focus({ preventScroll: true });
                    } else if (controlsFocusables.length > 0) {
                        controlsFocusables[0].focus({ preventScroll: true });
                    } else if (progressFocusable) {
                        progressFocusable.focus({ preventScroll: true });
                    } else if (infoFocusables.length > 0) {
                        infoFocusables[0].focus({ preventScroll: true });
                    }
                }
                return;
            }

            const channelBtn = channelListButtonRef.current;
            
            if (allTopControls.includes(active)) {
                lastFocusedControlRef.current = active;
            }

            if (e.key === 'ArrowUp') {
                if (isSkipVisible && allTopControls.includes(active)) {
                    e.preventDefault();
                    e.stopPropagation();
                    skipButton.focus({ preventScroll: true });
                    return;
                }
            }
            if (e.key === 'ArrowDown') {
                if (isSkipVisible && active === skipButton) {
                   e.preventDefault();
                   e.stopPropagation();
                   (lastFocusedControlRef.current || controlsFocusables[0])?.focus({ preventScroll: true });
                   return;
               }
           }

            if (!isOverlayVisible) {
                if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsOverlayVisible(true);
                    return;
                }
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    togglePlay();
                }
                return;
            }
            
            const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' '];
             if (!arrowKeys.includes(e.key) || (document.activeElement?.tagName === 'INPUT')) return;
             
             e.stopPropagation();
             if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
                 e.preventDefault();
             }

            if (e.key === 'ArrowUp' && (allTopControls.includes(active) || controlsFocusables.includes(active))) {
                setIsOverlayVisible(false);
                if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                }
                return;
            }

            const seek = (offset: number) => {
                const video = videoRef.current;
                if (video) {
                    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + offset));
                }
            };

            switch (e.key) {
                case 'ArrowUp':
                    if (recsFocusables.includes(active)) {
                        progressFocusable?.focus();
                        setIsRecsFocused(false);
                    } else if (active === progressFocusable) {
                        infoFocusables[0]?.focus();
                    }
                    break;
                case 'ArrowDown':
                    if (infoFocusables.includes(active) || controlsFocusables.includes(active)) {
                        progressFocusable?.focus();
                        setIsRecsFocused(false);
                    } else if (active === progressFocusable) {
                        recsFocusables[0]?.focus();
                        setIsRecsFocused(true);
                    }
                    break;
                case 'ArrowRight':
                    if (infoFocusables.includes(active)) {
                        controlsFocusables[0]?.focus();
                    } else if (controlsFocusables.includes(active)) {
                        const currentIndex = controlsFocusables.indexOf(active);
                        if (currentIndex < controlsFocusables.length - 1) {
                            controlsFocusables[currentIndex + 1].focus();
                        }
                    } else if (active === progressFocusable) {
                        seek(5);
                    } else if (recsFocusables.includes(active)) {
                        const currentIndex = recsFocusables.indexOf(active);
                        if (currentIndex < recsFocusables.length - 1) {
                            recsFocusables[currentIndex + 1].focus();
                        }
                    }
                    break;
                case 'ArrowLeft':
                    if (controlsFocusables.includes(active)) {
                        const currentIndex = controlsFocusables.indexOf(active);
                        if (currentIndex > 0) {
                            controlsFocusables[currentIndex - 1].focus();
                        } else {
                            infoFocusables[0]?.focus();
                        }
                    } else if (active === progressFocusable) {
                        seek(-5);
                    } else if (recsFocusables.includes(active)) {
                        const currentIndex = recsFocusables.indexOf(active);
                        if (currentIndex > 0) {
                            recsFocusables[currentIndex - 1].focus();
                        }
                    }
                    break;
            }
        };
        
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOverlayVisible, showSettingsPanel, showSubtitlesPanel, isChannelListVisible, togglePlay, activeSkip, liveChannels, adState.isActive, adState.canSkip]);

    const handleRecommendationPlay = (recItem: Movie) => {
        const mediaType = recItem.media_type || (recItem.title ? 'movie' : 'tv');
        navigate('/player', { 
            state: { 
                item: recItem, 
                type: mediaType, 
                season: null,
                episode: null,
            },
            replace: true 
        });
    };

    // Effect for Skip Intro/Outro logic
    useEffect(() => {
        const { intro, outro } = skipSegments;
        const video = videoRef.current;
        if (intro && currentTime >= intro.start && currentTime < intro.end) {
            // Addon-powered auto skip: jump the intro without waiting for a click
            if (addonPlayerConfig.autoSkipIntro && video && !autoSkipDoneRef.current.intro && currentTime >= intro.start + 1) {
                autoSkipDoneRef.current.intro = true;
                video.currentTime = intro.end;
                setActiveSkip(null);
                setToast({ message: 'Intro skipped automatically', type: 'success' });
                return;
            }
            setActiveSkip('intro');
        } else if (outro && duration > 0 && currentTime >= outro.start && currentTime < outro.end) {
            if (addonPlayerConfig.autoSkipOutro && video && !autoSkipDoneRef.current.outro && currentTime >= outro.start + 1) {
                autoSkipDoneRef.current.outro = true;
                video.currentTime = outro.end;
                setActiveSkip(null);
                setToast({ message: 'Outro skipped automatically', type: 'success' });
                return;
            }
            setActiveSkip('outro');
        } else if (activeSkip) {
            setActiveSkip(null);
        }
    }, [currentTime, duration, skipSegments, activeSkip, addonPlayerConfig.autoSkipIntro, addonPlayerConfig.autoSkipOutro, setToast]);

    // Addon-powered AI subtitle translation (Gemini): translates an existing
    // track into the requested language and adds it to the Subtitles panel.
    const handleAiTranslate = useCallback(async (code: string, label: string) => {
        const aiLang = `ai-${code}`;
        const existing = aiVttTracks.find(t2 => t2.lang === aiLang);
        if (existing) { setActiveSubtitleLang(aiLang); return; }
        if (aiSubLoadingLabel) return;
        const source = allSubtitles.find(s => s.language.startsWith('en')) || allSubtitles[0];
        if (!source) {
            setToast({ message: 'No subtitles available to translate yet', type: 'error' });
            return;
        }
        setAiSubLoadingLabel(label);
        aiSubProgressRef.current = '';
        try {
            const res = await fetch(source.url);
            if (!res.ok) throw new Error('Could not download the source subtitles');
            const srtText = await res.text();
            const translated = await translateSrtWithGemini(srtText, label, (done, total) => {
                aiSubProgressRef.current = `${done}/${total}`;
            });
            // Convert translated SRT to a VTT blob track
            const srtTimestampLineRegex = /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/g;
            let vttContent = "WEBVTT\n\n";
            vttContent += translated.replace(/\r/g, '').replace(srtTimestampLineRegex, (_, s, e) => `${s.replace(',', '.')} --> ${e.replace(',', '.')}`);
            const vttUrl = URL.createObjectURL(new Blob([vttContent], { type: 'text/vtt' }));
            const track = { lang: aiLang, url: vttUrl, label: `✨ ${label} · AI` };
            setAiVttTracks(prev => [...prev.filter(p => p.lang !== aiLang), track]);
            setActiveSubtitleLang(aiLang);
            setToast({ message: `AI subtitles ready: ${label}`, type: 'success' });
        } catch (e: any) {
            console.error('AI subtitle translation failed:', e);
            setToast({ message: e?.message || 'AI subtitle translation failed', type: 'error' });
        } finally {
            setAiSubLoadingLabel(null);
        }
    }, [aiVttTracks, aiSubLoadingLabel, allSubtitles, setToast]);

    const handleSkip = useCallback(() => {
        const video = videoRef.current;
        if (!video || !activeSkip || !skipSegments[activeSkip]) return;
        
        const segment = skipSegments[activeSkip];
        if (segment) {
            video.currentTime = segment.end;
        }
        setActiveSkip(null);

        // Explicitly focus a player control button so focus is never lost
        setTimeout(() => {
            const controlsFocusables = Array.from(controlsPanelRef.current?.querySelectorAll('.focusable') || []) as HTMLElement[];
            if (controlsFocusables.length > 0) {
                controlsFocusables[0].focus();
            } else if (progressBarRef.current) {
                progressBarRef.current.focus();
            }
            setIsOverlayVisible(true);
        }, 100);
    }, [activeSkip, skipSegments]);


    useEffect(() => {
        const stopDubbing = () => {
            setIsDubbingLoading(false);
            setDubbingProgress('');
            dubbingSegmentsRef.current.clear();
            scheduledSegmentIds.current.clear();
            scheduledSourcesRef.current.forEach(source => { try { source.stop(); } catch (e) {} });
            scheduledSourcesRef.current.clear();
            dubbingTimestampsRef.current = [];
            if (videoRef.current) {
                videoRef.current.volume = 1.0;
                videoRef.current.muted = false;
            }
        };
    
        if (activeDubbingLang === 'ar-ai') {
            const arabicSub = subtitles.find(s => s.language === 'ar');
            if (!arabicSub) {
                setToast({ message: "Arabic subtitles not available for AI dubbing.", type: 'error' });
                setActiveDubbingLang(null);
                return;
            }
    
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }
            audioContextRef.current.resume();
    
            stopDubbing();
            setIsDubbingLoading(true);
            if (videoRef.current) {
                videoRef.current.muted = false;
                videoRef.current.volume = 0;
            }
    
            const onData = async (data: DubbingBatch) => {
                if (data.progress) setDubbingProgress(data.progress);
                if (!audioContextRef.current) return;
    
                const audioCtx = audioContextRef.current;
                for (const segment of data.batch) {
                    const segmentId = `${segment.start_ms}-${segment.end_ms}`;
                    if (dubbingSegmentsRef.current.has(segmentId)) continue;
    
                    try {
                        const response = await fetch(segment.audio_url, { headers: { 'ngrok-skip-browser-warning': 'true' }});

                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }

                        const contentType = response.headers.get('content-type');
                        if (!contentType || !contentType.startsWith('audio/')) {
                            throw new Error(`Invalid content type for audio: ${contentType}`);
                        }

                        const arrayBuffer = await response.arrayBuffer();
                        if (arrayBuffer.byteLength < 256) {
                            throw new Error("Audio data is too small to be valid.");
                        }

                        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                        dubbingSegmentsRef.current.set(segmentId, { audioBuffer, startTime: segment.start_ms, endTime: segment.end_ms });
                        dubbingTimestampsRef.current.push({
                            start: segment.start_ms / 1000,
                            end: segment.end_ms / 1000
                        });
                    } catch (e) { 
                        console.error("Failed to process audio segment", segment.audio_url, e);
                    }
                }
            };
    
            const onError = (error: Error) => {
                setToast({ message: `Dubbing failed: ${error.message}`, type: 'error' });
                stopDubbing();
            };
    
            const onClose = () => setIsDubbingLoading(false);
    
            streamDubbing(arabicSub.url, onData, onError, onClose);
        } else {
            stopDubbing();
        }
    
        return () => { stopDubbing(); };
    }, [activeDubbingLang, subtitles, setToast]);
    
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !audioContextRef.current || activeDubbingLang !== 'ar-ai') return;
    
        const audioCtx = audioContextRef.current;
        const playbackCheckInterval = setInterval(() => {
            if (video.paused) return;
    
            const videoTimeMs = video.currentTime * 1000;
            const lookaheadMs = 1500;
    
            dubbingSegmentsRef.current.forEach((segment, id) => {
                if (!scheduledSegmentIds.current.has(id) && segment.startTime >= videoTimeMs && segment.startTime < videoTimeMs + lookaheadMs) {
                    const delay = (segment.startTime - videoTimeMs) / 1000;
                    
                    const source = audioCtx.createBufferSource();
                    source.buffer = segment.audioBuffer;
                    
                    const audioDuration = segment.audioBuffer.duration;
                    const targetDuration = (segment.endTime - segment.startTime) / 1000;

                    if (targetDuration > 0 && audioDuration > targetDuration) {
                        const requiredRate = audioDuration / targetDuration;
                        source.playbackRate.value = Math.min(requiredRate, 1.5); // Cap at 1.5x speed
                    }

                    source.connect(audioCtx.destination);
                    source.start(audioCtx.currentTime + (delay > 0 ? delay : 0));
                    
                    scheduledSourcesRef.current.add(source);
                    source.onended = () => { scheduledSourcesRef.current.delete(source); };
                    scheduledSegmentIds.current.add(id);
                }
            });
        }, 250);
    
        const handleSeeking = () => {
            scheduledSourcesRef.current.forEach(source => { try { source.stop(); } catch(e) {} });
            scheduledSourcesRef.current.clear();
            scheduledSegmentIds.current.clear();
        };
    
        video.addEventListener('seeking', handleSeeking);
    
        return () => {
            clearInterval(playbackCheckInterval);
            video.removeEventListener('seeking', handleSeeking);
            scheduledSourcesRef.current.forEach(source => { try { source.stop(); } catch(e) {} });
            scheduledSourcesRef.current.clear();
            scheduledSegmentIds.current.clear();
        };
    }, [activeDubbingLang]);


    return (
        <div ref={playerContainerRef} className="player-container-scope relative w-full h-full bg-black flex items-center justify-center overflow-hidden" onClick={togglePlay}>
            {/* Auto Skip Ad Toast / Modal */}
            {showAutoSkipAlert && (
                <div 
                    className={`absolute top-24 left-8 z-[200] max-w-sm flex items-center gap-3 bg-red-600/95 backdrop-blur-md text-white px-5 py-4 rounded-xl border border-red-500/50 shadow-2xl shadow-red-900/40 ${isAutoSkipAlertExiting ? 'animate-slide-out-left' : 'animate-slide-in-left'}`}
                    style={{ direction: userLanguage === 'ar' ? 'rtl' : 'ltr' }}
                >
                    <div className="flex-shrink-0 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                        <i className="fa-solid fa-circle-exclamation text-xl"></i>
                    </div>
                    <div>
                        <h4 className="font-bold text-white text-base">
                            {userLanguage === 'ar' ? 'تم تخطي الإعلان' : 'Ad Skipped'}
                        </h4>
                        <p className="text-sm text-red-100 font-medium">
                            {userLanguage === 'ar' ? 'تم تخطي الإعلان تلقائياً بعد 30 ثانية' : 'Skipped ad automatically after 30s'}
                        </p>
                    </div>
                </div>
            )}

            {/* Ad Overlay */}
            {adState.isActive && (
                <div className="absolute inset-0 z-[100] bg-black">
                    <video 
                        ref={adVideoRef}
                        className="w-full h-full object-cover"
                        autoPlay
                        playsInline
                        src={AD_SOURCES[adState.adIndex]}
                        onTimeUpdate={(e) => {
                            const target = e.target as HTMLVideoElement;
                            const adDur = target.duration || 1;
                            const adCur = target.currentTime;
                            const pct = (adCur / adDur) * 100;
                            
                            const delta = adCur - lastAdTimeRef.current;
                            if (delta > 0 && delta < 1) { // Normal playback
                                totalAdTimeRef.current += delta;
                            }
                            lastAdTimeRef.current = adCur;

                            if (totalAdTimeRef.current >= 30) {
                                triggerAdAutoSkip();
                            }

                            let newCountdown = Math.max(0, 5 - Math.floor(adCur));
                            setAdState(prev => ({
                                ...prev,
                                adProgress: pct,
                                canSkip: newCountdown === 0,
                                skipCountdown: newCountdown
                            }));
                        }}
                        onError={() => {
                            // If an ad fails to load, never freeze playback:
                            // try the next ad, or end ads and resume the video.
                            if (adState.adIndex < AD_SOURCES.length - 1) {
                                setAdState(prev => ({
                                    ...prev,
                                    adIndex: prev.adIndex + 1,
                                    canSkip: false,
                                    skipCountdown: 5,
                                    adProgress: 0
                                }));
                            } else {
                                setAdState(prev => ({ ...prev, isActive: false, hasPlayedInSession: true }));
                                videoRef.current?.play().catch(()=>{});
                            }
                        }}
                        onEnded={() => {
                            if (adState.adIndex < AD_SOURCES.length - 1) {
                                // Next Ad
                                setAdState(prev => ({
                                    ...prev,
                                    adIndex: prev.adIndex + 1,
                                    canSkip: false,
                                    skipCountdown: 5,
                                    adProgress: 0
                                }));
                            } else {
                                // End of all ads
                                setAdState(prev => ({ ...prev, isActive: false, hasPlayedInSession: true }));
                                videoRef.current?.play().catch(()=>{});

                                // Explicitly focus a player control button so focus is never lost
                                setTimeout(() => {
                                    const controlsFocusables = Array.from(controlsPanelRef.current?.querySelectorAll('.focusable') || []) as HTMLElement[];
                                    if (controlsFocusables.length > 0) {
                                        controlsFocusables[0].focus({ preventScroll: true });
                                    } else if (progressBarRef.current) {
                                        progressBarRef.current.focus({ preventScroll: true });
                                    }
                                    setIsOverlayVisible(true);
                                }, 100);
                            }
                        }}
                    />
                    
                    {/* SKIP Button */}
                    <button 
                        ref={adSkipButtonRef}
                        className={`absolute bottom-24 right-8 z-[110] px-6 py-3 bg-black/60 backdrop-blur-md rounded-full text-white font-semibold text-lg transition-all duration-300 ${adState.canSkip ? 'cursor-pointer hover:bg-white hover:text-black focusable animate-fade-in-up' : 'opacity-70 cursor-not-allowed'}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (adState.canSkip) {
                                // End of all ads
                                setAdState(prev => ({ ...prev, isActive: false, hasPlayedInSession: true }));
                                videoRef.current?.play().catch(()=>{});

                                // Explicitly focus a player control button so focus is never lost
                                setTimeout(() => {
                                    const controlsFocusables = Array.from(controlsPanelRef.current?.querySelectorAll('.focusable') || []) as HTMLElement[];
                                    if (controlsFocusables.length > 0) {
                                        controlsFocusables[0].focus({ preventScroll: true });
                                    } else if (progressBarRef.current) {
                                        progressBarRef.current.focus({ preventScroll: true });
                                    }
                                    setIsOverlayVisible(true);
                                }, 100);
                            }
                        }}
                    >
                        {adState.canSkip ? 'Skip Ad' : `Skip in ${adState.skipCountdown}`}
                    </button>

                    {/* Ad Information */}
                    <div className="absolute top-8 left-8 px-5 py-3 bg-black/60 text-white border border-white/20 rounded-xl font-bold text-sm tracking-wider uppercase z-[110] backdrop-blur-md">
                        Advertisement {adState.adIndex + 1} of {AD_SOURCES.length}
                    </div>

                    {/* Yellow bottom progress bar */}
                    <div className="absolute bottom-0 left-0 h-1.5 bg-yellow-500 transition-all duration-200 z-[110]" style={{ width: `${adState.adProgress}%` }}></div>
                </div>
            )}

            {/* FIX: The `inert` attribute expects a boolean value, not a string. */}
            <div inert={isChannelListVisible ? true : undefined} className="absolute inset-0 w-full h-full bg-black">
                <video 
                    ref={videoRef} 
                    className={`w-full h-full object-contain bg-black ${isEnhancementActive && !enhancerCssFallback ? 'opacity-0' : ''}`} 
                    style={{ background: 'black', filter: isEnhancementActive && enhancerCssFallback ? 'contrast(1.08) saturate(1.12) brightness(1.03)' : undefined }}
                    playsInline 
                    autoPlay 
                    preload="metadata"
                    poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
                >
                {[...vttTracks, ...aiVttTracks].map(track => (
                        <track key={track.lang} kind="subtitles" srcLang={track.lang} src={track.url} label={track.label} default={activeSubtitleLang === track.lang} />
                    ))}
                </video>
                
                <canvas 
                    ref={enhancementCanvasRef} 
                    className={`absolute inset-0 w-full h-full object-contain pointer-events-none transition-opacity duration-300 ${isEnhancementActive && !enhancerCssFallback ? 'opacity-100' : 'opacity-0'}`} 
                />
                
                <div 
                    className="absolute left-1/2 -translate-x-1/2 w-full max-w-4xl px-4 text-center pointer-events-none z-10 transition-all duration-200"
                    style={{
                        bottom: `${subtitleSettings.verticalPosition + (isOverlayVisible ? 20 : 5)}%`,
                        fontSize: `${subtitleSettings.fontSize / 100 * 1.5}rem`,
                        lineHeight: '1.4',
                    }}
                >
                    {activeCues.map((cue, i) => (
                        <span
                            key={i}
                            className="py-1 px-3 rounded whitespace-pre-line"
                            style={{
                                color: 'white',
                                backgroundColor: `rgba(0, 0, 0, ${subtitleSettings.backgroundOpacity / 100})`,
                                textShadow: subtitleSettings.edgeStyle === 'drop-shadow' ? '2px 2px 3px rgba(0,0,0,0.8)' : 
                                            subtitleSettings.edgeStyle === 'outline' ? 'rgb(0, 0, 0) 1px 1px 2px, rgb(0, 0, 0) -1px -1px 2px, rgb(0, 0, 0) -1px 1px 2px, rgb(0, 0, 0) 1px -1px 2px' : 'none',
                            }}
                        >
                            {cue.text}
                        </span>
                    ))}
                </div>

                {isBuffering && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                        <div className="w-16 h-16 border-4 border-zinc-600 border-t-white rounded-full animate-spin"></div>
                    </div>
                )}

                {((!hideLogo && logo) || isLiveScheduleMode) && (
                    <div className={`absolute top-4 left-4 z-20 transition-opacity duration-300 ${isOverlayVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                        {isLiveScheduleMode ? (
                            <div className="px-3 py-1.5 bg-black/50 backdrop-blur-md rounded-lg flex items-center gap-2">
                                <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span></span>
                                <span className="font-bold text-white uppercase tracking-wider">{t('live')}</span>
                            </div>
                        ) : (
                             <img 
                               src={logo} 
                               alt={`${item.name} logo`} 
                               className="h-20 max-w-[240px] object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)]" 
                               onError={(e) => {
                                 const target = e.currentTarget;
                                 target.onerror = null;
                                 const cleanName = item.name.replace(/^(AR|FR|EN|ES|DE|IT|UK|US|MA|TN|DZ|LY|SY|LB|ZA|PT|TR|AL|PL|RO|RU|KSA|OSN|beIN|MBC|TOD|BTV|OCS|Starz|Dragon|Hulu|Skyflix|ART|Rotana|ON|DMC|CBC|Al Alhy|Zamalek|Nile|Sada Elbalad|Star|Paramount|Comedy|TNT|HBO|ESPN|Fox|Sony|ZDF|RTL|SAT|Pro7|Super RTL|Vox|VOX|Kika|Arte|TF1|M6|W9|RMC|BFM|LCI|DAZN|TMC|France)\s*:\s*/i, '').trim();
                                 const letter = cleanName.charAt(0).toUpperCase() || '📺';
                                 target.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100" height="100" rx="10" fill="%23eab308"/><text x="50" y="55" font-family="sans-serif" font-size="45" font-weight="bold" fill="%23000000" text-anchor="middle" dominant-baseline="middle">${letter}</text></svg>`;
                               }}
                             />
                        )}
                    </div>
                )}

                {isLiveScheduleMode && liveReason && (
                    <div className={`absolute top-16 left-4 z-20 max-w-xs px-3 py-2 bg-black/50 backdrop-blur-md rounded-lg text-sm text-white transition-opacity duration-300 ${isOverlayVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                       <strong>Up next: {item.title || item.name}.</strong> {liveReason}
                    </div>
                )}


                {isDubbingLoading && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 bg-black/60 backdrop-blur-md rounded-full text-white font-semibold text-sm flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-zinc-400 border-t-white rounded-full animate-spin"></div>
                        <span>{t('translating')} {dubbingProgress}</span>
                    </div>
                )}

                {aiSubLoadingLabel && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 bg-black/60 backdrop-blur-md rounded-full text-white font-semibold text-sm flex items-center gap-2">
                        <i className="fa-solid fa-wand-magic-sparkles text-purple-400 text-xs"></i>
                        <div className="w-4 h-4 border-2 border-zinc-400 border-t-white rounded-full animate-spin"></div>
                        <span>AI Subtitles · {aiSubLoadingLabel} {aiSubProgressRef.current}</span>
                    </div>
                )}
                
                {activeSkip && (
                    <button
                        ref={skipButtonRef}
                        onClick={(e) => { e.stopPropagation(); handleSkip(); }}
                        className="absolute top-6 right-6 z-20 px-6 py-3 bg-black/60 backdrop-blur-md rounded-full text-white font-semibold text-lg hover:bg-white hover:text-black transition-all duration-300 animate-fade-in-up focusable"
                    >
                        {activeSkip === 'intro' ? 'Skip Intro' : 'Skip Outro'}
                    </button>
                )}

                {showUpNext && upNextItem && (
                    <div className="absolute bottom-24 right-0 z-50 pointer-events-none animate-slide-in-right">
                        <div className="flex items-stretch overflow-hidden rounded-l-2xl bg-black/75 backdrop-blur-xl border border-white/10 border-r-0 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)]">
                            {(upNextItem.data?.still_path || upNextItem.data?.backdrop_path) && (
                                <div className="relative w-28 md:w-44 flex-shrink-0">
                                    <img
                                        src={`${IMAGE_BASE_URL}${BACKDROP_SIZE_MEDIUM}${upNextItem.data?.still_path || upNextItem.data?.backdrop_path}`}
                                        alt={upNextItem.title}
                                        className="absolute inset-0 w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-black/80"></div>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-black/50 border border-white/40 backdrop-blur-sm flex items-center justify-center">
                                            <i className="fa-solid fa-play text-white text-[10px] md:text-xs ml-0.5"></i>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div className="flex flex-col justify-center gap-0.5 md:gap-1 px-4 md:px-6 py-3 md:py-4 min-w-[170px] max-w-[260px] md:max-w-[380px]">
                                <div className="flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                                    <span className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.25em] text-zinc-300">Playing Next</span>
                                </div>
                                <span className="font-extrabold text-sm md:text-lg text-white truncate leading-tight">{upNextItem.title}</span>
                                {upNextItem.subtitle && (
                                    <span className="text-zinc-400 text-[10px] md:text-xs truncate font-medium">{upNextItem.subtitle}</span>
                                )}
                                {duration > 0 && (
                                    <div className="mt-1.5 md:mt-2 flex items-center gap-2">
                                        <div className="flex-1 h-1 rounded-full bg-white/15 overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-red-500 to-red-700 rounded-full transition-[width] duration-500 ease-linear"
                                                style={{ width: `${Math.min(100, Math.max(0, ((30 - Math.max(0, duration - currentTime)) / 30) * 100))}%` }}
                                            />
                                        </div>
                                        <span className="text-[9px] md:text-[11px] font-bold text-zinc-300 tabular-nums w-7 text-right">
                                            {Math.max(0, Math.ceil(duration - currentTime))}s
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div className="w-1.5 bg-gradient-to-b from-red-500 to-red-800 flex-shrink-0"></div>
                        </div>
                    </div>
                )}

                <Controls
                    showControls={isOverlayVisible} isPlaying={isPlaying} currentTime={currentTime} duration={duration}
                    bufferedTime={bufferedTime}
                    togglePlay={togglePlay}
                    isMuted={isMuted}
                    toggleMute={toggleMute}
                    navigate={navigate} t={t} item={item} episode={initialEpisode}
                    onSettingsClick={() => { setShowSettingsPanel(p => !p); setShowSubtitlesPanel(false); }}
                    onSubtitlesClick={() => { setShowSubtitlesPanel(p => !p); setShowSettingsPanel(false); }}
                    settingsButtonRef={settingsButtonRef}
                    subtitlesButtonRef={subtitlesButtonRef}
                    recommendations={recommendations}
                    onRecommendationClick={handleRecommendationPlay}
                    infoPanelRef={infoPanelRef}
                    controlsPanelRef={controlsPanelRef}
                    progressBarRef={progressBarRef}
                    recsPanelRef={recsPanelRef}
                    isRecsFocused={isRecsFocused}
                    skipSegments={skipSegments}
                    liveChannels={liveChannels}
                    isLiveScheduleMode={isLiveScheduleMode}
                    onChannelListClick={(e: React.MouseEvent) => { e.stopPropagation(); setIsChannelListVisible(true); }}
                    channelListButtonRef={channelListButtonRef}
                    activeSkip={activeSkip}
                />

                <SubtitlesPanel
                    show={showSubtitlesPanel}
                    tracks={[...vttTracks, ...aiVttTracks]}
                    activeLang={activeSubtitleLang}
                    onSelect={setActiveSubtitleLang}
                    onClose={() => setShowSubtitlesPanel(false)}
                    triggerRef={subtitlesButtonRef}
                    aiLangs={addonPlayerConfig.aiTranslate}
                    onAiTranslate={handleAiTranslate}
                    aiLoadingLabel={aiSubLoadingLabel}
                />

                <SettingsPanel
                    show={showSettingsPanel}
                    onClose={() => setShowSettingsPanel(false)}
                    triggerRef={settingsButtonRef}
                    playbackRate={playbackRate}
                    onRateChange={setPlaybackRate}
                    qualities={hlsQualities.length > 0 ? ['Auto', ...hlsQualities] : streamLinks.map(l => l.quality)}
                    activeQuality={activeQuality}
                    onQualityChange={setActiveQuality}
                    subtitleSettings={subtitleSettings}
                    onSubtitleSettingsChange={handleSubtitleSettingsChange}
                    activeDubbingLang={activeDubbingLang}
                    onDubbingChange={setActiveDubbingLang}
                    isEnhancementActive={isEnhancementActive}
                    onToggleEnhancement={() => setIsEnhancementActive(!isEnhancementActive)}
                />
            </div>

            {liveChannels && (
                <ChannelListPanel
                    channels={liveChannels}
                    currentIndex={currentChannelIndex ?? 0}
                    isVisible={isChannelListVisible}
                    onSelect={handleSelectChannel}
                    onClose={() => setIsChannelListVisible(false)}
                />
            )}
        </div>
    );
};

const PlayerRecommendationCard: React.FC<{
    rec: Movie;
    index: number;
    isKidsMode: boolean;
    onCardFocus: (element: HTMLElement) => void;
    onCardClick: (movie: Movie) => void;
}> = ({ rec, index, isKidsMode, onCardFocus, onCardClick }) => {
    const [isFocused, setIsFocused] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);

    const handleFocus = () => {
        setIsFocused(true);
        if (cardRef.current) {
            onCardFocus(cardRef.current);
        }
    };

    const handleBlur = () => {
        setIsFocused(false);
    };

    return (
        <div
            ref={cardRef}
            tabIndex={0}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onClick={() => onCardClick(rec)}
            onKeyDown={(e) => e.key === 'Enter' && onCardClick(rec)}
            className="interactive-card-container relative flex-shrink-0 w-[32vw] min-w-[280px] max-w-[400px] cursor-pointer focusable player-recommendation-card-wrapper"
            style={{ animationDelay: `${index * 50}ms` }}
        >
            <div className={`relative overflow-hidden transition-all duration-300 ease-in-out transform rounded-lg shadow-lg bg-[var(--surface)] interactive-card ${isKidsMode ? 'golden-worm-border' : ''}`}>
                <div className={isKidsMode ? 'golden-worm-border-inner' : 'w-full h-full'}>
                    <img 
                        src={`${IMAGE_BASE_URL}${BACKDROP_SIZE_MEDIUM}${rec.backdrop_path}`} 
                        alt={rec.title || rec.name} 
                        className="w-full aspect-video object-cover animate-page-enter" 
                        loading="lazy"
            decoding="async"
                    />
                </div>
            </div>
            <div
                className={`absolute -bottom-10 left-2 right-2 text-left transition-all duration-300 ease-in-out ${isFocused ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"}`}
            >
                <p className="text-sm font-semibold text-white truncate drop-shadow-lg">
                    {rec.title || rec.name}
                </p>
            </div>
        </div>
    );
};

const Controls: React.FC<any> = ({
    showControls, isPlaying, currentTime, duration, bufferedTime,
    togglePlay, isMuted, toggleMute, navigate, t, item, episode,
    onSettingsClick, onSubtitlesClick,
    settingsButtonRef, subtitlesButtonRef,
    recommendations, onRecommendationClick,
    infoPanelRef, controlsPanelRef, progressBarRef, recsPanelRef,
    isRecsFocused, skipSegments, liveChannels, isLiveScheduleMode, onChannelListClick, channelListButtonRef,
    activeSkip
}) => {
    
    const handleProgressInteraction = (e: React.MouseEvent | React.TouchEvent) => {
        if (isLiveScheduleMode || !progressBarRef.current || duration === 0) return;
        e.stopPropagation();
        const event = 'touches' in e ? e.touches[0] : e;
        const rect = progressBarRef.current.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const width = rect.width;
        let newTime = (clickX / width) * duration;
        newTime = Math.max(0, Math.min(newTime, duration));
        
        const video = (progressBarRef.current.closest('.player-container-scope')?.querySelector('video'));
        if(video) video.currentTime = newTime;
    };
    
    const title = item.title || item.name || '';
    const subtitle = isLiveScheduleMode ? "CineTV Kids" : `Sky Sports Premier Leagu... • 200K views • 12 hr ago`;
    const hasRecs = recommendations && recommendations.length > 0;

    const { isKidsMode } = useProfile();
    const rowContentRef = useRef<HTMLDivElement>(null);

    const handleCardFocus = useCallback((cardElement: HTMLElement) => {
        if (!recsPanelRef.current || !rowContentRef.current) return;

        const containerWidth = recsPanelRef.current.clientWidth;
        const contentWidth = rowContentRef.current.scrollWidth;
        const padding = 24; // from px-6

        let targetScroll = cardElement.offsetLeft - padding;

        const maxScroll = contentWidth - containerWidth;
        if (targetScroll > maxScroll) {
            targetScroll = maxScroll;
        }

        if (targetScroll < 0) {
            targetScroll = 0;
        }

        rowContentRef.current.style.transform = `translateX(${-targetScroll}px)`;
    }, [recsPanelRef]);

    const chapters = useMemo(() => {
        if (!duration || duration <= 0) return [];
        
        const segments = [];
        const hasIntro = !!(skipSegments?.intro && skipSegments.intro.start < skipSegments.intro.end);
        const hasOutro = !!(skipSegments?.outro && skipSegments.outro.start < skipSegments.outro.end);

        if (!hasIntro && !hasOutro) {
            segments.push({
                id: 'main',
                start: 0,
                end: duration,
                label: 'Main Video',
                type: 'regular'
            });
            return segments;
        }

        const introStart = hasIntro ? Math.max(0, skipSegments.intro!.start) : 0;
        const introEnd = hasIntro ? Math.min(duration, skipSegments.intro!.end) : 0;
        const outroStart = hasOutro ? Math.max(0, skipSegments.outro!.start) : duration;
        const outroEnd = hasOutro ? Math.min(duration, skipSegments.outro!.end) : duration;

        let lastT = 0;

        if (hasIntro && introStart > lastT) {
            segments.push({
                id: 'pre-intro',
                start: lastT,
                end: introStart,
                label: 'Start',
                type: 'regular'
            });
            lastT = introStart;
        }

        if (hasIntro) {
            segments.push({
                id: 'intro',
                start: introStart,
                end: introEnd,
                label: 'Intro',
                type: 'intro'
            });
            lastT = introEnd;
        }

        const nextStop = hasOutro ? outroStart : duration;
        if (nextStop > lastT) {
            segments.push({
                id: 'main',
                start: lastT,
                end: nextStop,
                label: 'Main Video',
                type: 'regular'
            });
            lastT = nextStop;
        }

        if (hasOutro) {
            segments.push({
                id: 'outro',
                start: outroStart,
                end: outroEnd,
                label: 'Outro',
                type: 'outro'
            });
            lastT = outroEnd;
        }

        if (duration > lastT) {
            segments.push({
                id: 'post-outro',
                start: lastT,
                end: duration,
                label: 'Credits',
                type: 'regular'
            });
        }

        return segments;
    }, [duration, skipSegments]);

    return (
        <div className={`absolute inset-x-0 bottom-0 text-white transition-all duration-300 ease-in-out flex flex-col ${showControls ? `opacity-100 ${!hasRecs || isRecsFocused ? 'translate-y-0' : 'translate-y-[112px]'}` : 'opacity-0 pointer-events-none translate-y-[200px]'}`} onClick={(e) => e.stopPropagation()}>
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent pointer-events-none"></div>
            
            <div className="relative p-4 lg:p-6 pb-8 lg:pb-10 flex flex-col gap-4">
                <div className="flex items-end justify-between gap-4">
                    {/* Left Info Panel */}
                    <div ref={infoPanelRef} className="bg-white/10 p-5 rounded-lg max-w-lg focus-within:bg-white/90 focus-within:text-black transition-colors duration-300">
                        <h1 tabIndex={0} className="text-2xl font-bold focusable outline-none">{title}</h1>
                        <p className="text-base mt-1">{subtitle}</p>
                    </div>

                    {/* Right Controls Panel */}
                    <div ref={controlsPanelRef} className="flex items-center gap-2">
                        <button onClick={toggleMute} className="player-control-button focusable">
                            {isMuted ? <Icons.VolumeMuteIcon className="w-6 h-6" /> : <Icons.VolumeHighIcon className="w-6 h-6" />}
                        </button>
                        <button ref={subtitlesButtonRef} onClick={onSubtitlesClick} className="player-control-button focusable"><Icons.CCIcon className="w-6 h-6"/></button>
                        <button className="player-control-button focusable"><Icons.LikeIcon className="w-6 h-6"/></button>
                        <button className="player-control-button focusable"><Icons.DislikeIcon className="w-6 h-6"/></button>
                        <button className="player-control-button focusable"><Icons.AddToPlaylistIcon className="w-6 h-6"/></button>
                        <button ref={settingsButtonRef} onClick={onSettingsClick} className="player-control-button focusable"><Icons.SettingsIcon className="w-6 h-6"/></button>
                        {liveChannels && (
                            <button ref={channelListButtonRef} onClick={onChannelListClick} className="player-control-button focusable" aria-label="Channel List">
                                <i className="fas fa-list-ul"></i>
                            </button>
                        )}
                    </div>
                </div>

                {/* Progress Bar & Timestamps */}
                {!isLiveScheduleMode && (
                    <div className="w-full flex flex-col gap-1">
                        <div 
                            ref={progressBarRef} 
                            tabIndex={0} 
                            onClick={handleProgressInteraction} 
                            onMouseMove={e => e.buttons === 1 && handleProgressInteraction(e)} 
                            className="w-full flex items-center cursor-pointer group h-7 focusable progress-bar-focusable relative"
                        >
                            <div className="w-full flex gap-[4px] h-[5px] group-hover:h-[8px] group-focus-within:h-[8px] transition-all duration-200">
                                {chapters.map((chap) => {
                                    const chapDuration = chap.end - chap.start;
                                    
                                    // Watched % inside segment
                                    let watchedPct = 0;
                                    if (currentTime >= chap.end) {
                                        watchedPct = 100;
                                    } else if (currentTime <= chap.start) {
                                        watchedPct = 0;
                                    } else {
                                        watchedPct = ((currentTime - chap.start) / chapDuration) * 100;
                                    }
                                    
                                    // Buffered % inside segment
                                    let bufPct = 0;
                                    if (bufferedTime >= chap.end) {
                                        bufPct = 100;
                                    } else if (bufferedTime <= chap.start) {
                                        bufPct = 0;
                                    } else {
                                        bufPct = ((bufferedTime - chap.start) / chapDuration) * 100;
                                    }

                                    return (
                                        <div 
                                            key={chap.id}
                                            className="relative h-full bg-white/20 transition-all rounded-[1px] overflow-hidden"
                                            style={{ 
                                                flexGrow: chapDuration
                                            }}
                                        >
                                            {/* Buffered progress track */}
                                            <div 
                                                className="absolute h-full bg-white/40 left-0 top-0 transition-all"
                                                style={{ width: `${bufPct}%` }}
                                            />
                                            {/* Active progress track */}
                                            <div 
                                                className={`absolute h-full left-0 top-0 transition-all ${
                                                    chap.type === 'intro' ? 'bg-red-800' : 
                                                    chap.type === 'outro' ? 'bg-red-800' : 
                                                    'bg-red-600'
                                                }`}
                                                style={{ width: `${watchedPct}%` }}
                                            />
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Scrub Handle Dot */}
                            <div 
                                className="absolute top-1/2 pointer-events-none"
                                style={{ 
                                    left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                                    transform: 'translate(-50%, -50%)',
                                }}
                            >
                                <div className="w-3.5 h-3.5 bg-white rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.5)] transition-transform duration-200 group-hover:scale-150 group-focus-within:scale-150" />
                            </div>
                        </div>

                        {/* Centered Intro/Outro indicator with timestamps in a single horizontal row */}
                        <div className="flex justify-between items-center mt-1 px-1">
                            <span className="text-xs font-mono text-zinc-300">{formatTime(currentTime)}</span>
                            {activeSkip && (
                                <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">
                                    {activeSkip === 'intro' ? 'Intro' : 'Outro'}
                                </span>
                            )}
                            <span className="text-xs font-mono text-zinc-300">{formatTime(duration)}</span>
                        </div>
                    </div>
                )}

                {/* Recommendations Shelf */}
                {recommendations && recommendations.length > 0 && (
                    <div className="transition-all duration-500 ease-in-out">
                        <div className={`transition-all duration-500 ease-in-out overflow-hidden flex items-baseline justify-between px-6 ${
                            isRecsFocused 
                                ? "h-8 mt-5 mb-3 opacity-100" 
                                : "h-0 mt-2 mb-0 opacity-0 pointer-events-none"
                        }`}>
                            <h2 className={`text-lg md:text-xl font-bold text-white transition-all duration-500 ease-out origin-left ${isRecsFocused ? "scale-100 opacity-100" : "scale-90 opacity-0"}`}>
                                {t('similar')}
                            </h2>
                        </div>
                        <div ref={recsPanelRef} className="overflow-x-hidden no-scrollbar py-12 -my-12">
                            <div 
                                ref={rowContentRef} 
                                className="flex flex-nowrap gap-x-6 px-6"
                                style={{
                                    transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                                    willChange: "transform",
                                }}
                            >
                                {recommendations.map((rec, index) => (
                                    <PlayerRecommendationCard 
                                        key={rec.id} 
                                        rec={rec}
                                        index={index}
                                        isKidsMode={isKidsMode}
                                        onCardFocus={handleCardFocus}
                                        onCardClick={onRecommendationClick}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default VideoPlayer;
