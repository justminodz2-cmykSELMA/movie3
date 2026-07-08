import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Short, YTPlayer } from '../types';
import { useProfile } from '../contexts/ProfileContext';
import { IMAGE_BASE_URL, POSTER_SIZE } from '../contexts/constants';

// UI Overlay Component
const ShortsUIOverlay: React.FC<{ short: Short; onBackClick: () => void }> = ({ short, onBackClick }) => {
    const actionButtonClass = "flex flex-col items-center gap-1.5 transition-transform hover:scale-110 focus:outline-none";
    const iconWrapperClass = "w-12 h-12 flex items-center justify-center bg-black/30 rounded-full backdrop-blur-sm transition-colors hover:bg-black/50";

    return (
        <>
            {/* Gradient for text readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none"></div>

            {/* Top Controls */}
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 animate-fade-in" style={{ animationDuration: '0.5s' }}>
                <button onClick={onBackClick} className="w-10 h-10 text-white bg-black/40 rounded-full backdrop-blur-sm transition-transform hover:scale-110">
                    <i className="fa-solid fa-arrow-left"></i>
                </button>
                <h2 className="text-white font-bold text-lg" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.5)' }}>Shorts</h2>
                <div className="w-10 h-10"></div> {/* Spacer to center title */}
            </div>
            
            {/* Side Action Buttons */}
            <div className="absolute bottom-24 right-3 flex flex-col items-center gap-6 text-white z-10" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.7)' }}>
                <button className={`${actionButtonClass} animate-slide-in-right-short`} style={{animationDelay: '0.2s'}}>
                    <div className={iconWrapperClass}>
                        <i className="fa-solid fa-heart text-2xl"></i>
                    </div>
                    <span className="text-xs font-semibold">1.2M</span>
                </button>
                <button className={`${actionButtonClass} animate-slide-in-right-short`} style={{animationDelay: '0.3s'}}>
                    <div className={iconWrapperClass}>
                        <i className="fa-solid fa-comment-dots text-2xl"></i>
                    </div>
                    <span className="text-xs font-semibold">3.4k</span>
                </button>
                <button className={`${actionButtonClass} animate-slide-in-right-short`} style={{animationDelay: '0.4s'}}>
                    <div className={iconWrapperClass}>
                        <i className="fa-solid fa-share text-2xl"></i>
                    </div>
                    <span className="text-xs font-semibold">Share</span>
                </button>
                 {short.poster_path &&
                    <button className="flex flex-col items-center transition-transform hover:scale-110 animate-slide-in-right-short" style={{animationDelay: '0.5s'}}>
                        <img 
                            src={`${IMAGE_BASE_URL}${POSTER_SIZE}${short.poster_path}`} 
                            className="w-10 h-10 rounded-full border-2 border-white object-cover animate-[spin_8s_linear_infinite]" 
                            alt="poster" 
                         loading="lazy" decoding="async" />
                    </button>
                }
            </div>

            {/* Bottom Info Panel */}
            <div className="absolute bottom-0 left-0 p-4 text-white z-10 w-4/5 animate-slide-in-up-short" style={{ animationDelay: '0.1s', textShadow: '1px 1px 3px rgba(0,0,0,0.7)' }}>
                <h3 className="text-base font-bold">@{short.title?.replace(/\s+/g, '').toLowerCase() || 'cineshorts'}</h3>
                <p className="text-sm mt-1 line-clamp-2">{short.title || short.name}</p>
            </div>
        </>
    );
};

// Sound Indicator Component
const SoundIndicator: React.FC<{ isMuted: boolean }> = ({ isMuted }) => {
    return (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
            <div className="w-20 h-20 bg-black/50 rounded-full flex items-center justify-center animate-double-tap">
                <i className={`fas ${isMuted ? 'fa-volume-xmark' : 'fa-volume-high'} text-white text-4xl`}></i>
            </div>
        </div>
    );
};

// YouTube Player Component using IFrame API
interface ShortsPlayerProps {
    videoKey: string;
    isMuted: boolean;
    isActive: boolean;
}

const ShortsPlayer: React.FC<ShortsPlayerProps> = ({ videoKey, isMuted, isActive }) => {
    const playerRef = useRef<YTPlayer | null>(null); // YT.Player instance
    const playerDivId = `shorts-player-${videoKey}-${Math.random().toString(36).substring(7)}`;

    useEffect(() => {
        let player: YTPlayer | null = null;
        if (window.YT && window.YT.Player) {
            player = new window.YT.Player(playerDivId, {
                videoId: videoKey,
                playerVars: {
                    autoplay: 0,
                    controls: 0,
                    rel: 0,
                    loop: 1,
                    playlist: videoKey,
                    playsinline: 1,
                    modestbranding: 1,
                    iv_load_policy: 3,
                    disablekb: 1,
                },
                events: {
                    onReady: (event: { target: YTPlayer }) => {
                        playerRef.current = event.target;
                        if (isMuted) event.target.mute();
                        if (isActive) event.target.playVideo();
                    },
                },
            });
        }
        return () => {
            player?.destroy();
            playerRef.current = null;
        };
    }, [videoKey]); // Create player only once

    useEffect(() => {
        if (playerRef.current?.playVideo && playerRef.current?.pauseVideo) {
             if (isActive) {
                playerRef.current.playVideo();
            } else {
                playerRef.current.pauseVideo();
            }
        }
    }, [isActive]);

    useEffect(() => {
        if (playerRef.current?.mute && playerRef.current?.unMute) {
            if (isMuted) {
                playerRef.current.mute();
            } else {
                playerRef.current.unMute();
            }
        }
    }, [isMuted, isActive]); // Re-apply mute state if active video changes

    return (
        <div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{
                width: 'max(100vw, calc(100vh * 16 / 9))',
                height: 'max(100vh, calc(100vw * 9 / 16))'
            }}
        >
            <div id={playerDivId} className="w-full h-full" />
        </div>
    );
};


const ShortsPage: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { activeProfile } = useProfile();
    const { items = [], startIndex = 0 } = location.state || {};
    
    const [visibleIndex, setVisibleIndex] = useState(startIndex);
    const [isMuted, setIsMuted] = useState(true);
    const [showSoundIcon, setShowSoundIcon] = useState(false);
    const [isApiReady, setIsApiReady] = useState(false);
    
    const containerRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
    const soundTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Load YouTube API script
    useEffect(() => {
        if (window.YT && window.YT.Player) {
            setIsApiReady(true);
            return;
        }
        if (!document.getElementById('youtube-iframe-api')) {
            const tag = document.createElement('script');
            tag.id = 'youtube-iframe-api';
            tag.src = "https://www.youtube.com/iframe_api";
            const firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

            window.onYouTubeIframeAPIReady = () => {
                setIsApiReady(true);
            };
        }
    }, []);

    useEffect(() => {
        if (!activeProfile) navigate('/', { replace: true });
        if (!items || items.length === 0) navigate('/home', { replace: true });
    }, [activeProfile, items, navigate]);

    useEffect(() => {
        // When the visible video changes, reset the state to muted by default
        // for a consistent autoplay experience, as requested.
        setIsMuted(true);
    }, [visibleIndex]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const index = parseInt(entry.target.getAttribute('data-index') || '0', 10);
                        setVisibleIndex(index);
                    }
                });
            },
            { threshold: 0.6 }
        );

        const currentRefs = itemRefs.current.filter(ref => ref !== null) as HTMLDivElement[];
        currentRefs.forEach(ref => observer.observe(ref));

        return () => {
            currentRefs.forEach(ref => observer.unobserve(ref));
        };
    }, [items.length]);

    useEffect(() => {
        const initialRef = itemRefs.current[startIndex];
        if (initialRef) {
            initialRef.scrollIntoView({ behavior: 'auto' });
        }
    }, [startIndex]);
    
    const handleToggleMute = useCallback(() => {
        setIsMuted(prev => !prev);
        setShowSoundIcon(true);
        if (soundTimeoutRef.current) {
            clearTimeout(soundTimeoutRef.current);
        }
        soundTimeoutRef.current = setTimeout(() => {
            setShowSoundIcon(false);
        }, 600);
    }, []);
    
    const itemsToRender = useMemo(() => {
        return items.map((item: Short, index: number) => ({
            ...item,
            shouldRender: Math.abs(index - visibleIndex) <= 1,
        }));
    }, [items, visibleIndex]);


    if (!items || items.length === 0) {
        return null;
    }

    return (
        <div className="h-dvh w-screen bg-black relative">
            <div 
                ref={containerRef} 
                className="h-full w-full overflow-y-auto snap-y snap-mandatory no-scrollbar scroll-snap-stop-always"
            >
                {itemsToRender.map((short, index) => (
                    <div
                        key={`${short.id}-${index}`}
                        ref={el => { itemRefs.current[index] = el; }}
                        data-index={index}
                        className="h-full w-full snap-start relative flex items-center justify-center overflow-hidden"
                        onClick={handleToggleMute}
                    >
                        {short.shouldRender && isApiReady ? (
                            <>
                                <ShortsPlayer
                                    videoKey={short.videoKey}
                                    isActive={index === visibleIndex}
                                    isMuted={isMuted}
                                />
                                {index === visibleIndex && (
                                    <ShortsUIOverlay
                                        key={visibleIndex} // Use index to force remount and re-animate
                                        short={short}
                                        onBackClick={() => navigate(-1)}
                                    />
                                )}
                            </>
                        ) : (
                             <div className="w-full h-full bg-black flex items-center justify-center">
                                <div className="w-16 h-16 border-t-2 border-[var(--primary)] rounded-full animate-spin"></div>
                             </div>
                        )}
                    </div>
                ))}
            </div>
            
            {showSoundIcon && <SoundIndicator isMuted={isMuted} />}
        </div>
    );
};

export default ShortsPage;