import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '../contexts/ProfileContext';
import { fetchFromTMDB } from '../services/apiService';
import { Movie, Episode, Season, YTPlayer } from '../types';
import { useTranslation } from '../contexts/LanguageContext';
import { IMAGE_BASE_URL, BACKDROP_SIZE, BACKDROP_SIZE_MEDIUM } from '../contexts/constants';

export const ToastContainer: React.FC = () => {
  const { toast, setToast } = useProfile();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (toast) {
      setShow(true);
      const timer = setTimeout(() => {
        setShow(false);
        // Allow animation to finish before clearing toast data
        setTimeout(() => setToast(null), 300);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast, setToast]);

  if (!toast) {
    return null;
  }

  const baseStyle = "fixed top-20 left-0 px-3 py-2 min-w-[180px] max-w-[280px] rounded-r-md text-white text-sm font-semibold shadow-2xl z-[100] transition-all duration-300 ease-out flex items-center gap-3";
  const typeStyles = {
    success: "bg-black border-l-4 border-green-500",
    error: "bg-black border-l-4 border-red-500",
    info: "bg-black border-l-4 border-blue-500",
  };
  const visibilityStyle = show ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-[120%]';

  return (
    <div dir="ltr" className={`${baseStyle} ${typeStyles[toast.type]} ${visibilityStyle}`}>
      <i className={`fa-solid ${toast.type === 'success' ? 'fa-check-circle text-green-500' : (toast.type === 'error' ? 'fa-exclamation-triangle text-red-500' : 'fa-info-circle text-blue-500')}`}></i>
      <span className="text-left break-words">{toast.message}</span>
    </div>
  );
};

export const useToast = () => {
    const { setToast } = useProfile();
    return setToast;
}

const RecommendationCard: React.FC<{ item: Movie; dataFocusGroup?: string; dataFocusIndex?: number; onCardFocus?: (el: HTMLElement) => void; }> = ({ item, dataFocusGroup, dataFocusIndex, onCardFocus }) => {
    const { setModalItem } = useProfile();
    const { t } = useTranslation();
    const { toggleFavorite, isKidsMode } = useProfile();
    const [isFocused, setIsFocused] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);

    const handleCardClick = () => {
        setModalItem(item);
    };
    
    const handleFocus = useCallback(() => {
        setIsFocused(true);
        if (cardRef.current && onCardFocus) {
            onCardFocus(cardRef.current);
        }
    }, [onCardFocus]);

    const handleBlur = useCallback(() => {
        setIsFocused(false);
    }, []);

    if (!item.backdrop_path) return null;

    return (
        <div 
            ref={cardRef}
            className={`flex-shrink-0 w-[24vw] min-w-[220px] max-w-[320px] cursor-pointer group focusable glow-card-container interactive-card-container relative`} 
            onClick={handleCardClick}
            onKeyDown={(e) => e.key === 'Enter' && handleCardClick()}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onMouseEnter={() => setIsFocused(true)}
            onMouseLeave={() => setIsFocused(false)}
            style={{ '--glow-image-url': `url(${IMAGE_BASE_URL}w500${item.backdrop_path})` } as React.CSSProperties}
            tabIndex={0}
            data-focus-group={dataFocusGroup}
            data-focus-index={dataFocusIndex}
        >
            <div className={`relative overflow-hidden transition-all duration-300 ease-in-out transform rounded-lg shadow-lg bg-[var(--surface)] interactive-card ${isKidsMode ? 'golden-worm-border' : ''}`}>
                <div className={isKidsMode ? 'golden-worm-border-inner' : 'w-full h-full'}>
                    <div className="relative w-full aspect-video bg-black">
                        <img
                            src={`${IMAGE_BASE_URL}${BACKDROP_SIZE_MEDIUM}${item.backdrop_path}`}
                            alt={item.title || item.name}
                            className="w-full aspect-video object-cover"
                            loading="lazy"
                            decoding="async"
                        />
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <i className="fas fa-play text-white text-3xl drop-shadow-lg"></i>
                        </div>
                        
                        <div className="absolute top-2 left-2 flex flex-col gap-1 z-10 pointer-events-none">
                             <div className={`transform transition-all duration-300 ease-out ${isFocused ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-4 opacity-0 scale-95'}`}>
                                 <span className="px-2 py-0.5 text-[11px] font-bold text-white bg-green-600 rounded-sm shadow-md">
                                     {(item.vote_average * 10).toFixed(0)}% {t('match')}
                                 </span>
                             </div>
                             <div className={`transform transition-all duration-300 ease-out delay-75 ${isFocused ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-4 opacity-0 scale-95'}`}>
                                 <span className="px-2 py-0.5 text-[11px] font-bold text-white bg-black/60 backdrop-blur-sm rounded-sm shadow-md border border-white/20">
                                     {item.release_date?.substring(0, 4) || item.first_air_date?.substring(0, 4)}
                                 </span>
                             </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div
                className={`absolute -bottom-10 left-2 right-2 text-left transition-all duration-300 ease-in-out ${isFocused ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            >
                <p className="text-sm font-semibold text-white truncate drop-shadow-lg">
                    {item.title || item.name}
                </p>
            </div>
        </div>
    );
};

const SimilarRow: React.FC<{ movies: Movie[] }> = ({ movies }) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const rowContentRef = useRef<HTMLDivElement>(null);
    const { t } = useTranslation();
    const [isRowActive, setIsRowActive] = useState(false);
    
    const handleCardFocus = useCallback((cardElement: HTMLElement) => {
        if (!scrollContainerRef.current || !rowContentRef.current) return;
        const containerWidth = scrollContainerRef.current.clientWidth;
        const contentWidth = rowContentRef.current.scrollWidth;
        const padding = 40; 
        
        let targetScroll = cardElement.offsetLeft - padding;
        const maxScroll = contentWidth - containerWidth;
        if (targetScroll > maxScroll) targetScroll = maxScroll;
        if (targetScroll < 0) targetScroll = 0;
        
        if (rowContentRef.current) {
            rowContentRef.current.style.transform = `translateX(${-targetScroll}px)`;
        }
    }, []);

    if (!movies || movies.length === 0) return null;

    return (
        <div 
            className="mt-10 relative" 
            id="similar-section"
            onFocus={() => setIsRowActive(true)}
            onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setIsRowActive(false);
                }
            }}
        >
            <div className="flex items-baseline justify-between mb-3 px-2">
                <h2
                    className={`text-lg md:text-xl font-bold text-white transition-all duration-300 ease-out origin-left ${isRowActive ? "scale-100" : "scale-90 text-zinc-400"}`}
                >
                    {t('similar')}
                </h2>
            </div>
            <div 
                ref={scrollContainerRef}
                className="overflow-x-hidden no-scrollbar py-12 -my-12 px-6 -mx-6" 
            >
                <div 
                    ref={rowContentRef}
                    className="flex flex-nowrap gap-x-6 px-2"
                    style={{
                        transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                        willChange: "transform",
                    }}
                >
                    {movies.filter(r => r.backdrop_path).slice(0, 15).map((rec, index) => (
                        <RecommendationCard 
                            key={rec.id} 
                            item={rec} 
                            dataFocusGroup="similar" 
                            dataFocusIndex={index} 
                            onCardFocus={handleCardFocus} 
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

// A memoized component that wraps the YouTube player element and doesn't re-render
// when parent states (like isAdMuted) change, preventing the iframe from being destroyed.
const YoutubeTrailerPlayer = React.memo(({ videoId, onPlayerReady, onStateChange, onError }: {
    videoId: string;
    onPlayerReady: (player: YTPlayer) => void;
    onStateChange: (event: { data: number }) => void;
    onError: () => void;
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!window.YT || !window.YT.Player || !containerRef.current) return;

        const player = new window.YT.Player(containerRef.current, {
            videoId: videoId,
            playerVars: {
                autoplay: 1,
                controls: 0,
                showinfo: 0,
                rel: 0,
                iv_load_policy: 3,
                modestbranding: 1,
                loop: 1,
                playlist: videoId,
                playsinline: 1,
            },
            events: {
                onReady: (event: any) => {
                    onPlayerReady(event.target);
                },
                onStateChange,
                onError,
            }
        });

        return () => {
            if (player && typeof player.destroy === 'function') {
                player.destroy();
            }
        };
    }, [videoId, onPlayerReady, onStateChange, onError]);

    return <div ref={containerRef} className="w-full h-full pointer-events-none" />;
});

export const DetailsModal: React.FC<{ item: Movie, onClose: () => void }> = ({ item, onClose }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { isFavorite, toggleFavorite, setToast, isYtApiReady } = useProfile();
    const [details, setDetails] = useState<Movie | null>(null);
    const [loading, setLoading] = useState(true);
    const [episodes, setEpisodes] = useState<Episode[]>([]);
    const [selectedSeason, setSelectedSeason] = useState<number>(1);
    const [animationState, setAnimationState] = useState<'entering' | 'exiting' | 'visible'>('entering');
    const [isExpanded, setIsExpanded] = useState(false);

    // Ad state
    const [showAd, setShowAd] = useState(false);
    // True only once the trailer is ACTUALLY playing. Until then the backdrop
    // image stays visible, so TVs never show a gray placeholder + play icon.
    const [isAdPlaying, setIsAdPlaying] = useState(false);
    const [isAdMuted, setIsAdMuted] = useState(true);
    const adEverPlayedRef = useRef(false);
    const playerRef = useRef<YTPlayer | null>(null);

    const modalRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const playButtonRef = useRef<HTMLButtonElement>(null);
    const seasonSelectContainerRef = useRef<HTMLDivElement>(null);

    const type = item.media_type || (item.title ? 'movie' : 'tv');

    useEffect(() => {
        const expandTimer = setTimeout(() => {
            setIsExpanded(true);
        }, 3000);
        
        const adTimer = setTimeout(() => {
            setShowAd(true);
        }, 3000);

        return () => {
            clearTimeout(expandTimer);
            clearTimeout(adTimer);
        };
    }, []);

    const handlePlayerReady = useCallback((player: YTPlayer) => {
        playerRef.current = player;
        player.mute();
        setIsAdMuted(true);
        player.playVideo();
    }, []);

    const handlePlayerStateChange = useCallback((event: { data: number }) => {
        if (event.data === 1) {
            adEverPlayedRef.current = true;
            setIsAdPlaying(true);
        }
    }, []);

    const handlePlayerError = useCallback(() => {
        setShowAd(false);
        setIsAdPlaying(false);
    }, []);

    useEffect(() => {
        if (showAd && !isAdPlaying) {
            const watchdog = setTimeout(() => {
                if (!adEverPlayedRef.current) {
                    setShowAd(false);
                    setIsAdPlaying(false);
                }
            }, 30000);
            return () => clearTimeout(watchdog);
        }
    }, [showAd, isAdPlaying]);


    const handleToggleAdMute = () => {
        if (playerRef.current) {
            const isMutedNow = typeof playerRef.current.isMuted === 'function' ? playerRef.current.isMuted() : isAdMuted;
            if (isMutedNow) {
                if (typeof playerRef.current.unMute === 'function') {
                    playerRef.current.unMute();
                }
                if (typeof playerRef.current.setVolume === 'function') {
                    playerRef.current.setVolume(100);
                }
                setIsAdMuted(false);
                // Only call play if the video is not already in playing state (state 1 === YT.PlayerState.PLAYING)
                if (typeof playerRef.current.getPlayerState === 'function') {
                    if (playerRef.current.getPlayerState() !== 1 && typeof playerRef.current.playVideo === 'function') {
                        playerRef.current.playVideo();
                    }
                }
            } else {
                if (typeof playerRef.current.mute === 'function') {
                    playerRef.current.mute();
                }
                setIsAdMuted(true);
            }
        }
    };
    
    useEffect(() => {
        document.body.classList.add('modal-open');
        return () => {
            document.body.classList.remove('modal-open');
        };
    }, []);

    // Auto-focus the Play button once the details finish loading.
    // (On mount the modal still shows the loading spinner, so focusing
    // immediately never worked — arrows then selected nothing for movies.)
    useEffect(() => {
        if (!loading && details) {
            const timer = setTimeout(() => {
                playButtonRef.current?.focus({ preventScroll: true });
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [loading, details]);
    
    // New Unified Keyboard Navigation Handler
    useEffect(() => {
        const modalNode = modalRef.current;
        if (!modalNode || !details) return;
        
        const focusAndScroll = (element: HTMLElement | null | undefined) => {
            // Make sure we only focus elements that are actually visible
            if (element && element.offsetParent !== null) {
                element.focus({ preventScroll: true });
                // Custom scroll to ensure visibility without jarring jumps
                // TV browsers are laggy with smooth scrolling. Snappy instant scrolling is standard.
                const isTV = typeof navigator !== 'undefined' && /SmartTV|Tizen|Web0S|AppleTV|AndroidTV|TV|PlayStation/i.test(navigator.userAgent);
                element.scrollIntoView({ behavior: isTV ? 'auto' : 'smooth', block: 'nearest', inline: 'nearest' });
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            const isDropdownOpen = seasonSelectContainerRef.current?.querySelector('[aria-expanded="true"]');
            if (isDropdownOpen && ['ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) {
                // Let the CustomSelect component handle its own navigation when open
                return;
            }

            // We only care about arrow keys for this logic
            if (!e.key.startsWith('Arrow')) {
                // Allow other keys to work, but stop propagation of arrows to prevent global handlers from interfering
                if (e.key === 'Tab') e.stopPropagation();
                return;
            }
            
            e.preventDefault();
            e.stopPropagation();

            const active = document.activeElement as HTMLElement;

            // If focus is lost or outside the modal, reset it.
            if (!active || !modalNode.contains(active)) {
                focusAndScroll(modalNode.querySelector('[data-focus-group="main-actions"][data-focus-index="0"]') as HTMLElement);
                return;
            }
            
            // Find the parent element that defines the focus group. This handles nested components.
            const focusContainer = active.closest('[data-focus-group]') as HTMLElement | null;

            // If the focused element isn't inside a recognized group, reset to a safe default.
            if (!focusContainer) {
                focusAndScroll(modalNode.querySelector('[data-focus-group="main-actions"][data-focus-index="0"]') as HTMLElement);
                return;
            }

            const group = focusContainer.dataset.focusGroup;
            // The index can be on the active element itself or on the focus group container.
            const index = parseInt(active.dataset.focusIndex || focusContainer.dataset.focusIndex || '0', 10);

            // A helper to quickly get a focusable element by its selector
            const getElement = (selector: string) => modalNode.querySelector(selector) as HTMLElement | null;

            switch (group) {
                case 'top-right':
                    if (e.key === 'ArrowUp') {
                        const isTV = typeof navigator !== 'undefined' && /SmartTV|Tizen|Web0S|AppleTV|AndroidTV|TV|PlayStation/i.test(navigator.userAgent);
                        scrollContainerRef.current?.scrollTo({ top: 0, behavior: isTV ? 'auto' : 'smooth' });
                    } else if (e.key === 'ArrowRight' && index === 0) {
                        focusAndScroll(getElement(`[data-focus-group="top-right"][data-focus-index="1"]`));
                    } else if (e.key === 'ArrowLeft' && index === 1) {
                        focusAndScroll(getElement(`[data-focus-group="top-right"][data-focus-index="0"]`));
                    } else if (e.key === 'ArrowDown') {
                        focusAndScroll(getElement('[data-focus-group="main-actions"][data-focus-index="0"]'));
                    }
                    break;

                case 'main-actions':
                    const actions = Array.from(modalNode.querySelectorAll('[data-focus-group="main-actions"]')).filter(el => (el as HTMLElement).offsetParent !== null) as HTMLElement[];
                    const currentIndex = actions.indexOf(active);
                    if (e.key === 'ArrowRight') focusAndScroll(actions[(currentIndex + 1) % actions.length]);
                    else if (e.key === 'ArrowLeft') focusAndScroll(actions[(currentIndex - 1 + actions.length) % actions.length]);
                    else if (e.key === 'ArrowUp') focusAndScroll(getElement('[data-focus-group="top-right"][data-focus-index="0"]'));
                    else if (e.key === 'ArrowDown') {
                        const seasonSelect = getElement('[data-focus-group="season-select"] button');
                        const firstEpisode = getElement('[data-focus-group="episodes"][data-focus-index="0"]');
                        const firstSimilar = getElement('[data-focus-group="similar"][data-focus-index="0"]');
                        if (seasonSelect) focusAndScroll(seasonSelect);
                        else if (firstEpisode) focusAndScroll(firstEpisode);
                        else if (firstSimilar) focusAndScroll(firstSimilar);
                    }
                    break;

                case 'season-select':
                    if (e.key === 'ArrowUp') focusAndScroll(getElement('[data-focus-group="main-actions"][data-focus-index="0"]'));
                    else if (e.key === 'ArrowDown') {
                        const firstEpisode = getElement('[data-focus-group="episodes"][data-focus-index="0"]');
                        const firstSimilar = getElement('[data-focus-group="similar"][data-focus-index="0"]');
                        if (firstEpisode) focusAndScroll(firstEpisode);
                        else if (firstSimilar) focusAndScroll(firstSimilar);
                    }
                    break;

                case 'episodes':
                    const episodes = Array.from(modalNode.querySelectorAll('[data-focus-group="episodes"]'));
                    if (e.key === 'ArrowDown') {
                        if (index < episodes.length - 1) focusAndScroll(getElement(`[data-focus-group="episodes"][data-focus-index="${index + 1}"]`));
                        else focusAndScroll(getElement('[data-focus-group="similar"][data-focus-index="0"]'));
                    } else if (e.key === 'ArrowUp') {
                        if (index > 0) focusAndScroll(getElement(`[data-focus-group="episodes"][data-focus-index="${index - 1}"]`));
                        else focusAndScroll(getElement('[data-focus-group="season-select"] button') || getElement('[data-focus-group="main-actions"][data-focus-index="0"]'));
                    } else if (e.key === 'ArrowLeft') {
                        focusAndScroll(getElement('[data-focus-group="similar"][data-focus-index="0"]'));
                    } else if (e.key === 'ArrowRight') {
                        focusAndScroll(getElement('[data-focus-group="season-select"] button'));
                    }
                    break;

                case 'similar':
                    const similarContainer = getElement('#similar-section');
                    if (!similarContainer) break;
                    
                    const similarCards = Array.from(similarContainer.querySelectorAll('[data-focus-group="similar"]')).filter(el => (el as HTMLElement).offsetParent !== null) as HTMLElement[];
                    if (similarCards.length === 0) break;

                    const cardIndex = similarCards.indexOf(active);
                    if (cardIndex === -1) break;

                    if (e.key === 'ArrowRight') {
                        if (cardIndex < similarCards.length - 1) focusAndScroll(similarCards[cardIndex + 1]);
                    } else if (e.key === 'ArrowLeft') {
                        if (cardIndex > 0) focusAndScroll(similarCards[cardIndex - 1]);
                    } else if (e.key === 'ArrowUp') {
                        const firstEpisode = getElement('[data-focus-group="episodes"][data-focus-index="0"]');
                        if (firstEpisode) {
                            focusAndScroll(firstEpisode);
                        } else {
                            focusAndScroll(getElement('[data-focus-group="main-actions"][data-focus-index="0"]'));
                        }
                    } else if (e.key === 'ArrowDown') {
                        const isTV = typeof navigator !== 'undefined' && /SmartTV|Tizen|Web0S|AppleTV|AndroidTV|TV|PlayStation/i.test(navigator.userAgent);
                        scrollContainerRef.current?.scrollBy({ top: 180, behavior: isTV ? 'auto' : 'smooth' });
                    }
                    break;
            }
        };

        modalNode.addEventListener('keydown', handleKeyDown);
        return () => {
            modalNode.removeEventListener('keydown', handleKeyDown);
        };
    }, [details]);


    const handleClose = useCallback(() => {
        setAnimationState('exiting');
    }, []);

    const handleAnimationEnd = () => {
        if (animationState === 'exiting') {
            onClose();
        }
    };

    useEffect(() => {
        const fetchDetails = async () => {
            setLoading(true);
            try {
                const data = await fetchFromTMDB(`/${type}/${item.id}`, {
                    append_to_response: 'videos,credits,recommendations,content_ratings,images',
                    include_image_language: 'en,null',
                });
                setDetails(data);
                if (type === 'tv' && data.seasons && data.seasons.length > 0) {
                    const firstValidSeason = data.seasons.find((s: Season) => s.season_number > 0 && s.episode_count > 0);
                    if (firstValidSeason) {
                        setSelectedSeason(firstValidSeason.season_number);
                        fetchEpisodes(item.id, firstValidSeason.season_number);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch modal details", error);
                setToast({ message: t('failedToLoadDetails'), type: 'error' });
                handleClose();
            } finally {
                setLoading(false);
            }
        };

        fetchDetails();
    }, [item.id, type, t, setToast, handleClose]);

    const fetchEpisodes = async (tvId: number, seasonNumber: number) => {
        try {
            const data = await fetchFromTMDB(`/tv/${tvId}/season/${seasonNumber}`);
            setEpisodes(data.episodes);
            setSelectedSeason(seasonNumber);
        } catch (error) {
            console.error(`Failed to fetch episodes for season ${seasonNumber}`, error);
            setToast({ message: t('failedToLoadEpisodes'), type: 'error' });
        }
    };

    const handlePlay = () => {
        onClose();
        navigate('/player', { state: { item: details, type, season: selectedSeason, episode: null } });
    };

    const handleEpisodePlay = (episode: Episode) => {
        onClose();
        navigate('/player', { state: { item: details, type, season: selectedSeason, episode } });
    };
    
    const seasonOptions = useMemo(() => {
        if (!details?.seasons) return [];
        return details.seasons
            .filter(s => s.season_number > 0 && s.episode_count > 0)
            .map(season => ({
                value: String(season.season_number),
                label: `${t('season')} ${season.season_number}`
            }));
    }, [details?.seasons, t]);

    const logoUrl = useMemo(() => {
        if (!details?.images?.logos || details.images.logos.length === 0) return null;
        
        const logos = details.images.logos;
        let logo = null;
        // Prefer PNG logos for transparency
        logo = logos.find(l => l.iso_639_1 === 'en' && l.file_path.endsWith('.png'));
        if (logo) return `https://image.tmdb.org/t/p/w500${logo.file_path}`;

        // Fallback to any English logo
        logo = logos.find(l => l.iso_639_1 === 'en');
        if (logo) return `https://image.tmdb.org/t/p/w500${logo.file_path}`;

        // Fallback to a language-neutral logo (TMDB sometimes uses 'zxx' or it's null)
        logo = logos.find(l => !l.iso_639_1 || l.iso_639_1 === 'zxx');
        if (logo) return `https://image.tmdb.org/t/p/w500${logo.file_path}`;
        
        // As a last resort, just grab the first logo if any exist.
        logo = logos[0];
        if (logo) return `https://image.tmdb.org/t/p/w500${logo.file_path}`;

        return null;
    }, [details]);


    const isFav = details ? isFavorite(details.id) : false;

    return ReactDOM.createPortal(
        <div className={`details-modal-backdrop ${animationState === 'exiting' ? 'exiting' : ''}`} onClick={handleClose}>
            <div
                ref={modalRef}
                className={`details-modal-content ${isExpanded ? 'expanded' : ''} ${animationState === 'exiting' ? 'exiting' : ''}`}
                onClick={(e) => e.stopPropagation()}
                onAnimationEnd={handleAnimationEnd}
                role="dialog"
                aria-modal="true"
            >
                {loading || !details ? (
                    <div className="flex items-center justify-center h-full bg-[var(--background)]">
                        <div className="w-16 h-16 border-4 border-t-transparent border-[var(--primary)] rounded-full animate-spin"></div>
                    </div>
                ) : (
                    <>
                        <div className="absolute top-4 right-4 z-20 flex gap-2">
                           <button onClick={() => setIsExpanded(!isExpanded)} className="w-9 h-9 flex items-center justify-center bg-black/60 rounded-full text-white text-lg btn-press focusable" data-focus-group="top-right" data-focus-index="0">
                                <i className={`fas ${isExpanded ? 'fa-compress' : 'fa-expand'} pointer-events-none`}></i>
                            </button>
                            <button onClick={handleClose} className="w-9 h-9 flex items-center justify-center bg-black/60 rounded-full text-white text-xl btn-press focusable" data-focus-group="top-right" data-focus-index="1">
                                <i className="fas fa-times pointer-events-none"></i>
                            </button>
                        </div>
                        <div ref={scrollContainerRef} className="w-full h-full overflow-y-auto no-scrollbar">
                            <div className="relative w-full h-[56.25%] min-h-[250px] md:min-h-[400px] overflow-hidden">
                                {/* Backdrop stays as the base layer: no gray placeholder can
                                    ever be visible while the trailer loads (or if it fails). */}
                                <img
                                    src={`${IMAGE_BASE_URL}${BACKDROP_SIZE}${details.backdrop_path}`}
                                    alt={details.title || details.name}
                                    className="absolute inset-0 object-cover w-full h-full"
                                />
                                {showAd && details.videos?.results?.length && isYtApiReady ? (
                                    <div className={`absolute top-1/2 left-1/2 w-full h-full transform -translate-x-1/2 -translate-y-1/2 scale-125 transition-opacity duration-500 ${isAdPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                                        {(() => {
                                            const trailer =
                                                details.videos.results.find((v: any) => v.type === 'Trailer' && v.site === 'YouTube') ||
                                                details.videos.results.find((v: any) => v.type === 'Teaser' && v.site === 'YouTube') ||
                                                details.videos.results.find((v: any) => v.site === 'YouTube');
                                            
                                            return trailer?.key ? (
                                                <YoutubeTrailerPlayer
                                                    videoId={trailer.key}
                                                    onPlayerReady={handlePlayerReady}
                                                    onStateChange={handlePlayerStateChange}
                                                    onError={handlePlayerError}
                                                />
                                            ) : null;
                                        })()}
                                        <div className="absolute inset-0" />
                                    </div>
                                ) : null}
                                <div className="absolute inset-0 bg-gradient-to-t from-[var(--background)] via-[var(--background)]/70 to-transparent"></div>
                                <div className="absolute bottom-8 left-8 z-10 max-w-[70%]">
                                    {logoUrl ? (
                                        <img 
                                            src={logoUrl} 
                                            alt={`${details.title || details.name} logo`} 
                                            className="w-full max-w-xs md:max-w-sm max-h-36 object-contain object-left drop-shadow-lg"
                                        />
                                    ) : (
                                        <h1 className="text-4xl font-black text-white" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.7)' }}>{details.title || details.name}</h1>
                                    )}
                                    <div className="flex items-center gap-3 mt-4">
                                        <button ref={playButtonRef} onClick={handlePlay} className="px-6 py-2 text-lg font-bold text-black bg-white rounded-md hover:bg-opacity-80 flex items-center justify-center gap-2 btn-press focusable" data-focus-group="main-actions" data-focus-index="0">
                                            <i className="fas fa-play"></i><span>{t('play')}</span>
                                        </button>
                                        <button onClick={() => toggleFavorite(details)} className={`w-11 h-11 flex items-center justify-center rounded-full border-2 border-zinc-400 text-white text-xl btn-press hover:border-white focusable`} data-focus-group="main-actions" data-focus-index="1">
                                            <i className={`fas ${isFav ? 'fa-check' : 'fa-plus'}`}></i>
                                        </button>
                                        {showAd && isAdPlaying && details.videos?.results && (
                                            <button 
                                                onClick={handleToggleAdMute} 
                                                className="w-11 h-11 flex items-center justify-center rounded-full border-2 border-zinc-400 text-white text-xl btn-press hover:border-white focusable"
                                                aria-label={isAdMuted ? "Unmute Ad" : "Mute Ad"}
                                                data-focus-group="main-actions" data-focus-index="2"
                                            >
                                                <i className={`fas ${isAdMuted ? 'fa-volume-xmark' : 'fa-volume-high'}`}></i>
                                            </button>
                                        )}
                                        <button className="w-11 h-11 flex items-center justify-center rounded-full border-2 border-zinc-400 text-white text-xl btn-press hover:border-white focusable" data-focus-group="main-actions" data-focus-index="3">
                                            <i className="far fa-thumbs-up"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className="p-8">
                                <div className="grid grid-cols-3 gap-8">
                                    <div className="col-span-2">
                                        <div className="flex items-center gap-2 text-sm">
                                            <span className="font-bold text-green-500">{(details.vote_average * 10).toFixed(0)}% {t('match')}</span>
                                            <span className="text-zinc-400">{details.release_date?.substring(0, 4) || details.first_air_date?.substring(0, 4)}</span>
                                            {details.runtime && <span className="text-zinc-400">{Math.floor(details.runtime/60)}{t('hoursShort')} {details.runtime%60}{t('minutesShort')}</span>}
                                            <span className="px-1.5 py-0.5 border border-white/50 text-xs rounded">HD</span>
                                        </div>
                                        <p className="mt-4 text-sm text-white leading-relaxed">{details.overview}</p>
                                    </div>
                                    <div className="text-xs space-y-2">
                                        <p><span className="text-zinc-500">{t('cast')}: </span>{details.credits?.cast.slice(0, 3).map(c => c.name).join(', ')}, ...</p>
                                        <p><span className="text-zinc-500">{t('genres')}: </span>{details.genres?.map(g => g.name).join(', ')}</p>
                                    </div>
                                </div>
                                
                                {type === 'tv' && details.seasons && details.seasons.filter(s => s.season_number > 0).length > 0 && (
                                    <div className="mt-8">
                                        <div className="flex items-center justify-between mb-4">
                                            <h2 className="text-2xl font-bold">{t('episodes')}</h2>
                                            <div ref={seasonSelectContainerRef} data-focus-group="season-select">
                                                <CustomSelect
                                                    value={String(selectedSeason)}
                                                    onChange={(value) => {
                                                        if (value) {
                                                            fetchEpisodes(details.id, parseInt(value, 10));
                                                        }
                                                    }}
                                                    options={seasonOptions}
                                                    placeholder={t('season')}
                                                    className="w-48"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-4 max-h-80 overflow-y-auto pr-2">
                                        {episodes.map((episode, index) => (
                                            <div 
                                                key={episode.id} 
                                                className="group flex items-center gap-4 p-2 rounded-xl cursor-pointer hover:bg-zinc-800 focusable focus:scale-100" 
                                                onClick={() => handleEpisodePlay(episode)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleEpisodePlay(episode)}
                                                tabIndex={0}
                                                data-focus-group="episodes"
                                                data-focus-index={index}
                                            >
                                                <span className="text-xl text-zinc-400 font-bold">{episode.episode_number}</span>
                                                <div className="relative flex-shrink-0 w-36 h-20 overflow-hidden rounded-md transition-transform duration-300 group-hover:scale-105 group-focus-within:scale-105">
                                                    <img src={episode.still_path ? `${IMAGE_BASE_URL}w300${episode.still_path}` : `${IMAGE_BASE_URL}${BACKDROP_SIZE_MEDIUM}${details.backdrop_path}`} alt={episode.name} className="object-cover w-full h-full" />
                                                </div>
                                                <div className="flex-1">
                                                    <h4 className="font-semibold text-sm">{episode.name}</h4>
                                                    <p className="text-xs text-zinc-400 line-clamp-2 mt-1">{episode.overview}</p>
                                                </div>
                                            </div>
                                        ))}
                                        </div>
                                    </div>
                                )}

                                {details.recommendations?.results && details.recommendations.results.length > 0 && (
                                    <SimilarRow movies={details.recommendations.results} />
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>,
        document.body
    );
};

// New component for TV remote control cursor
export const TVCursor: React.FC<{
  position: { x: number; y: number };
  visible: boolean;
  clickEffect: boolean;
}> = ({ position, visible, clickEffect }) => {
  if (!visible) {
    return null;
  }

  const cursorStyle: React.CSSProperties = {
    position: 'fixed',
    left: `${position.x}px`,
    top: `${position.y}px`,
    width: '32px',
    height: '32px',
    border: '3px solid white',
    borderRadius: '50%',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
    zIndex: 99999,
    mixBlendMode: 'difference',
    transition: 'transform 0.05s linear, border-color 0.2s, opacity 0.3s',
    opacity: visible ? 1 : 0,
  };
  
  const rippleStyle: React.CSSProperties = {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: '100%',
    height: '100%',
    border: '3px solid white',
    borderRadius: '50%',
    transform: 'translate(-50%, -50%) scale(0)',
    opacity: 0.5,
  };
  
  return (
    <div style={cursorStyle}>
        {clickEffect && <div style={rippleStyle} className="animate-ripple"></div>}
    </div>
  );
};

export const CustomSelect: React.FC<{
    options: { value: string; label: string }[];
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    className?: string;
}> = ({ options, value, onChange, placeholder, className = '' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const selectRef = useRef<HTMLDivElement>(null);
    const optionsRef = useRef<(HTMLLIElement | null)[]>([]);
    const selectedLabel = options.find(opt => opt.value === value)?.label || placeholder;

    const handleSelect = (newValue: string) => {
        onChange(newValue);
        setIsOpen(false);
    };

    // Return focus to button after closing
    useEffect(() => {
        if (!isOpen) {
            selectRef.current?.querySelector('button')?.focus();
        }
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleButtonKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (['Enter', ' '].includes(e.key)) {
            e.preventDefault();
            setIsOpen(true);
            setTimeout(() => {
                const selectedIndex = options.findIndex(opt => opt.value === value);
                const focusIndex = selectedIndex >= 0 ? selectedIndex : 0;
                optionsRef.current[focusIndex]?.focus();
            }, 50); // Small delay for render
        }
    };
    
    const handleOptionKeyDown = (e: React.KeyboardEvent<HTMLLIElement>, optionValue: string) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            handleSelect(optionValue);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setIsOpen(false);
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            e.stopPropagation();
            setIsOpen(false);
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            const validOptions = optionsRef.current.filter((el): el is HTMLLIElement => el !== null);
            if (validOptions.length === 0) return;

            const currentIndex = validOptions.indexOf(e.currentTarget);
            if (currentIndex === -1) {
                validOptions[0]?.focus();
                return;
            }

            let nextIndex;
            if (e.key === 'ArrowDown') {
                nextIndex = (currentIndex + 1) % validOptions.length;
            } else { // ArrowUp
                nextIndex = (currentIndex - 1 + validOptions.length) % validOptions.length;
            }
            validOptions[nextIndex]?.focus();
        }
    };

    return (
        <div className={`relative ${className}`} ref={selectRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                onKeyDown={handleButtonKeyDown}
                className="bg-zinc-900/90 border border-zinc-800 text-white text-sm rounded-full focus:ring-2 focus:ring-white w-full px-5 py-2.5 flex justify-between items-center transition-all duration-300 hover:bg-zinc-800 hover:border-zinc-700 focusable font-medium"
                aria-haspopup="listbox"
                aria-expanded={isOpen}
            > 
                <span>{selectedLabel}</span>
                <i className={`fas fa-chevron-down transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}></i>
            </button>
            {isOpen && (
                <div className="absolute z-50 top-full mt-2 w-full bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-2xl shadow-2xl max-h-60 overflow-y-auto overflow-hidden">
                    <ul role="listbox">
                        {options.map((option, index) => (
                            <li
                                key={option.value}
                                ref={el => { if(el) optionsRef.current[index] = el}}
                                onClick={() => handleSelect(option.value)}
                                onKeyDown={(e) => handleOptionKeyDown(e, option.value)}
                                tabIndex={0}
                                role="option"
                                aria-selected={value === option.value}
                                className={`p-2.5 text-sm cursor-pointer hover:bg-[var(--primary)] focus:bg-[var(--primary)] focus:outline-none focusable ${value === option.value ? 'bg-[var(--primary)]/50' : ''}`}
                            >
                                {option.label}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export const VirtualKeyboard: React.FC<{
    onInput: (char: string) => void;
    onBackspace: () => void;
    onClose: () => void;
    onFocusUp: () => void;
    isVisible: boolean;
}> = ({ onInput, onBackspace, onClose, onFocusUp, isVisible }) => {
    const [layout, setLayout] = useState<'en' | 'ar'>('en');
    const [isShift, setIsShift] = useState(false);
    const keyboardRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isVisible) return;

        const findElementInRow = (row: number, currentCol: number): HTMLElement | null => {
            if (!keyboardRef.current) return null;

            const targetRowElements = Array.from(keyboardRef.current.querySelectorAll<HTMLElement>(`[data-row="${row}"]`));
            if (targetRowElements.length === 0) return null;

            // 1. Try for a perfect column match
            const perfectMatch = targetRowElements.find(el => parseInt(el.dataset.col || '-1', 10) === currentCol);
            if (perfectMatch) return perfectMatch;

            // 2. Find the closest column if no perfect match
            // Fix: Explicitly type reduce callback parameters to prevent type inference issues.
            return targetRowElements.reduce((closest: HTMLElement, current: HTMLElement) => {
                const closestCol = parseInt(closest.dataset.col || '0', 10);
                const currentColAttr = parseInt(current.dataset.col || '0', 10);
                const distToClosest = Math.abs(closestCol - currentCol);
                const distToCurrent = Math.abs(currentColAttr - currentCol);

                if (distToCurrent < distToClosest) {
                    return current;
                }
                if (distToCurrent === distToClosest) {
                    return currentColAttr < closestCol ? current : closest;
                }
                return closest;
            });
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            const acceptedKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
            if (!acceptedKeys.includes(e.key)) return;

            const activeElement = document.activeElement as HTMLElement;
            if (!keyboardRef.current || !keyboardRef.current.contains(activeElement) || !activeElement.dataset.row) return;

            e.preventDefault();

            const currentRow = parseInt(activeElement.dataset.row, 10);
            const currentCol = parseInt(activeElement.dataset.col || '0', 10);

            let nextElement: HTMLElement | null = null;

            switch (e.key) {
                case 'ArrowUp':
                    if (currentRow === 0) {
                        onFocusUp();
                    } else {
                        nextElement = findElementInRow(currentRow - 1, currentCol);
                    }
                    break;
                case 'ArrowDown':
                    nextElement = findElementInRow(currentRow + 1, currentCol);
                    break;
                case 'ArrowLeft':
                    // Fix: Use generic querySelector to ensure the return type is HTMLElement.
                    nextElement = keyboardRef.current.querySelector<HTMLElement>(`[data-row="${currentRow}"][data-col="${currentCol - 1}"]`);
                    break;
                case 'ArrowRight':
                    // Fix: Use generic querySelector to ensure the return type is HTMLElement.
                    nextElement = keyboardRef.current.querySelector<HTMLElement>(`[data-row="${currentRow}"][data-col="${currentCol + 1}"]`);
                    break;
            }

            if (nextElement) {
                nextElement.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isVisible, onFocusUp]);

    const KEY_LAYOUTS = {
        en: {
            lower: [ '1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm' ],
            upper: [ '1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM' ]
        },
        ar: [ '١٢٣٤٥٦٧٨٩٠', 'ضصثقفغعهخحجد', 'شسيبلاتنمكط', 'ئءؤرلاىةوزظ' ]
    };

    const handleKeyClick = (key: string) => {
        onInput(key);
        if (isShift) setIsShift(false);
    };
    
    const handleSpecialKeyMouseDown = (e: React.MouseEvent) => {
        e.preventDefault(); 
    };

    const currentLayout = layout === 'en' ? (isShift ? KEY_LAYOUTS.en.upper : KEY_LAYOUTS.en.lower) : KEY_LAYOUTS.ar;

    const renderRow = (row: string, rowIndex: number) => {
        let colCounter = 0;
        const keys = [];

        // English Shift Key
        if (rowIndex === 3 && layout === 'en') {
            keys.push(
                <button key="shift" data-row={rowIndex} data-col={colCounter++} onClick={() => setIsShift(prev => !prev)} onMouseDown={handleSpecialKeyMouseDown} className={`w-12 h-12 flex items-center justify-center rounded-md text-lg btn-press focusable ${isShift ? 'bg-zinc-500' : 'bg-zinc-600 hover:bg-zinc-500'}`}>
                    <i className="fa-solid fa-arrow-up"></i>
                </button>
            );
        }

        // Character keys
        for (const key of row) {
            keys.push(
                <button key={key} data-row={rowIndex} data-col={colCounter++} onClick={() => handleKeyClick(key)} className="h-12 flex-1 rounded-md text-lg font-semibold bg-zinc-700 hover:bg-zinc-600 btn-press focusable">
                    {key}
                </button>
            );
        }
        
        // English Backspace
        if (rowIndex === 3 && layout === 'en') {
             keys.push(
                 <button key="backspace" data-row={rowIndex} data-col={colCounter++} onClick={onBackspace} onMouseDown={handleSpecialKeyMouseDown} className="w-12 h-12 flex items-center justify-center rounded-md bg-zinc-600 hover:bg-zinc-500 text-lg btn-press focusable">
                    <i className="fa-solid fa-delete-left"></i>
                </button>
             );
        }
        
        return <div key={rowIndex} className="flex justify-center gap-1.5">{keys}</div>;
    };
    
    const renderBottomRow = () => {
        const rowIndex = currentLayout.length;
        let colCounter = 0;
        return (  
             <div className="flex justify-center gap-1.5">
                <button data-row={rowIndex} data-col={colCounter++} onClick={() => setLayout(l => l === 'en' ? 'ar' : 'en')} onMouseDown={handleSpecialKeyMouseDown} className="w-14 h-12 flex items-center justify-center rounded-md bg-zinc-600 hover:bg-zinc-500 text-lg btn-press focusable">
                    <i className="fa-solid fa-globe"></i>
                </button>
                <button data-row={rowIndex} data-col={colCounter++} onClick={() => onInput(' ')} className="h-12 flex-[6] rounded-md bg-zinc-700 hover:bg-zinc-600 btn-press focusable"></button>
                {layout === 'ar' && (
                    <button data-row={rowIndex} data-col={colCounter++} onClick={onBackspace} onMouseDown={handleSpecialKeyMouseDown} className="w-14 h-12 flex items-center justify-center rounded-md bg-zinc-600 hover:bg-zinc-500 text-lg btn-press focusable">
                        <i className="fa-solid fa-delete-left"></i>
                    </button>
                )}
                <button data-row={rowIndex} data-col={colCounter++} onClick={onClose} onMouseDown={handleSpecialKeyMouseDown} className="w-14 h-12 flex items-center justify-center rounded-md bg-zinc-600 hover:bg-zinc-500 text-lg btn-press focusable">
                    <i className="fa-solid fa-chevron-down"></i>
                </button>
            </div>
        );
    } 

    return (
        <div 
            ref={keyboardRef}
            className="fixed bottom-0 left-0 right-0 bg-zinc-900/90 backdrop-blur-sm p-2 z-50 animate-keyboard-enter touch-manipulation"
            onMouseDown={handleSpecialKeyMouseDown}
        >
            <div className="max-w-4xl mx-auto space-y-2 text-white">
                {currentLayout.map(renderRow)}
                {renderBottomRow()}
            </div>
        </div>
    );
};
