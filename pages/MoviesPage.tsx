import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchFromTMDB } from '../services/apiService';
import { Movie, YTPlayer } from '../types';
import { useProfile } from '../contexts/ProfileContext';
import { useTranslation } from '../contexts/LanguageContext';
import Layout from '../components/Layout';
import { CustomSelect } from '../components/common';
import { IMAGE_BASE_URL, BACKDROP_SIZE, BACKDROP_SIZE_MEDIUM, POSTER_SIZE } from '../contexts/constants';

const Hero: React.FC = () => {
    const heroImage = "https://a.ltrbxd.com/resized/sm/upload/qp/uv/i4/8b/l6b9YZEokZl1nt7q0pprrur6btG-1200-1200-675-675-crop-000000.jpg?v=ed21d71137"; 
    return (
        <div className="relative w-full h-[70vh] min-h-[300px] text-white overflow-hidden rounded-xl">
            <img src={heroImage} alt="Dune: Part Two" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--background)]/80 via-transparent to-transparent"></div>
            <div className="absolute inset-0 bg-gradient-to-r from-black to-transparent"></div>
            <div className="absolute inset-0 bg-gradient-to-l from-[var(--background)]/50 to-transparent"></div>
            <div className="relative z-10 flex flex-col justify-end h-full px-4 md:px-10 pb-20">
                <div className="max-w-xl animate-hero-content-in">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-xl font-black text-red-600" style={{ fontFamily: "'Anton', sans-serif" }}>N</span>
                        <span className="text-sm font-semibold tracking-[0.2em] text-zinc-200 uppercase">MOVIE</span>
                    </div>
                    <img src="https://i.ibb.co/7tSjTY1z/dune-part-2-logo-png-4k-2024-by-andrewvm-dgifpk0.png" alt="Dune Title" className="w-full max-w-sm md:max-w-md drop-shadow-lg mb-4" />
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-zinc-200" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.7)' }}>
                        <span>Movie</span><span>•</span><span>Sci-Fi</span><span>•</span><span>2024</span><span>•</span><span>2h 46m</span><span>•</span><span className="px-2 py-0.5 border border-zinc-400 text-sm rounded">PG-13</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const PosterCard: React.FC<{ movie: Movie; onCardClick: (movie: Movie) => void; isNetflixOriginal?: boolean; onCardFocus: (element: HTMLElement) => void; index: number }> = ({ movie, onCardClick, isNetflixOriginal, onCardFocus, index }) => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { isYtApiReady } = useProfile();
    const type = 'movie';

    const [showVideo, setShowVideo] = useState(false);
    const [isMuted, setIsMuted] = useState(true);
    const [isFocused, setIsFocused] = useState(false);
    const playerRef = useRef<YTPlayer | null>(null);
    const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const playerContainerId = useMemo(() => `poster-player-${movie.id}-${Math.random().toString(36).substring(2)}`, [movie.id]);
    const cardRef = useRef<HTMLDivElement>(null);

    const handleGlow = useCallback(() => {
        // Perf: dead work removed
    }, []);

    const handleMouseEnter = useCallback(() => {
        handleGlow();
        setIsFocused(true);
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = setTimeout(() => {
          if (
            document.querySelector(
              `.interactive-card-container[data-movie-id='${movie.id}']:hover`
            )
          ) {
            setShowVideo(true);
          }
        }, 7000);
    }, [movie.id, handleGlow]);

    const handleMouseLeave = useCallback(() => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        setShowVideo(false);
        setIsFocused(false);
    }, []);

    const handleFocus = useCallback(() => {
        handleGlow();
        setIsFocused(true);
        if (cardRef.current) {
            onCardFocus(cardRef.current);
        }
    }, [handleGlow, onCardFocus]);

    const handleBlur = useCallback(() => {
        setIsFocused(false);
    }, []);

    useEffect(() => {
        if (!showVideo || !isYtApiReady) {
            if (playerRef.current) {
                playerRef.current.destroy();
                playerRef.current = null;
            }
            return;
        }

        const initPlayer = (videoId: string) => {
          if (document.getElementById(playerContainerId) && !playerRef.current) {
            playerRef.current = new window.YT.Player(playerContainerId, {
              videoId: videoId,
              playerVars: { autoplay: 1, controls: 0, rel: 0, loop: 1, playlist: videoId, playsinline: 1, modestbranding: 1, iv_load_policy: 3, fs: 0, start: 5 },
              events: { onReady: (event) => { playerRef.current = event.target; event.target.mute(); setIsMuted(true); event.target.playVideo(); } }
            });
          }
        };

        const fetchTrailerAndInit = async () => {
          try {
            const videos = await fetchFromTMDB(`/${type}/${movie.id}/videos`);
            const trailer = videos.results.find((v: any) => v.type === 'Trailer' && v.site === 'YouTube');
            initPlayer(trailer ? trailer.key : 'mF428AFx9gY');
          } catch { initPlayer('mF428AFx9gY'); }
        };

        fetchTrailerAndInit();
        return () => { if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null; } };
    }, [showVideo, movie.id, type, playerContainerId, isYtApiReady]);

    const toggleMute = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        const player = playerRef.current;
        if (!player?.isMuted) return;
        if (player.isMuted()) { player.unMute(); setIsMuted(false); } else { player.mute(); setIsMuted(true); }
    }, []);
  
    if (!movie.backdrop_path) return null;
    const imageUrl = `${IMAGE_BASE_URL}w500${movie.backdrop_path}`;

    return (
        <div 
            ref={cardRef}
            className="interactive-card-container relative flex-shrink-0 w-[24vw] min-w-[220px] max-w-[320px] cursor-pointer glow-card-container focusable rounded-lg mb-8" 
            onMouseEnter={handleMouseEnter} 
            onMouseLeave={handleMouseLeave} 
            data-movie-id={movie.id}
            onClick={() => onCardClick(movie)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={(e) => e.key === 'Enter' && onCardClick(movie)}
            tabIndex={0}
            style={{ '--glow-image-url': `url(${imageUrl})` } as React.CSSProperties}
        >
            <div className="relative transition-all duration-300 ease-in-out transform rounded-lg shadow-lg overflow-hidden interactive-card">
                {isNetflixOriginal && ( <span style={{ fontFamily: "'Anton', sans-serif", textShadow: '1px 1px 3px rgba(0,0,0,0.5)' }} className="absolute top-2 left-2 z-10 text-3xl font-black text-[var(--primary)] pointer-events-none">V</span> )}
                <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden" onClick={() => onCardClick(movie)}>
                    <img src={`${IMAGE_BASE_URL}${BACKDROP_SIZE_MEDIUM}${movie.backdrop_path}`} alt={movie.title || movie.name} className={`object-cover w-full h-full absolute inset-0 transition-opacity duration-700 ${showVideo ? 'opacity-0' : 'opacity-100'}`} loading="lazy"
            decoding="async" />
                    <div className={`absolute inset-0 w-full h-full transition-opacity duration-700 ${showVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                          <div id={playerContainerId} className="w-full h-full pointer-events-none" />
                          <div className="absolute inset-0" />
                          {showVideo && ( <div className="absolute bottom-2 right-2 z-10"><button onClick={toggleMute} className="w-8 h-8 border-2 border-white/50 rounded-full text-white/80 hover:border-white hover:text-white transition-colors text-sm flex items-center justify-center bg-black/50"><i className={`fa-solid ${isMuted ? 'fa-volume-xmark' : 'fa-volume-high'}`}></i></button></div> )}
                    </div>
                    <div className="absolute top-2 left-2 flex flex-col gap-1 z-10 pointer-events-none">
                         <div className={`transform transition-all duration-300 ease-out ${isFocused ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-4 opacity-0 scale-95'}`}>
                             <span className="px-2 py-0.5 text-[11px] font-bold text-white bg-green-600 rounded-sm shadow-md">
                                 {(movie.vote_average * 10).toFixed(0)}% {t('match')}
                             </span>
                         </div>
                         <div className={`transform transition-all duration-300 ease-out delay-75 ${isFocused ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-4 opacity-0 scale-95'}`}>
                             <span className="px-2 py-0.5 text-[11px] font-bold text-white bg-black/60 backdrop-blur-sm rounded-sm shadow-md border border-white/20">
                                 {movie.release_date?.substring(0, 4) || movie.first_air_date?.substring(0, 4)}
                             </span>
                         </div>
                    </div>
                </div>
            </div>
            <div
                className={`absolute -bottom-7 left-2 right-2 text-left transition-all duration-300 ease-in-out z-20 ${isFocused ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            >
                <p className="text-xs font-semibold text-white truncate drop-shadow-lg">
                    {movie.title || movie.name}
                </p>
            </div>
        </div>
    );
};

const ContentRow: React.FC<{ title: string; movies: Movie[]; onCardClick: (movie: Movie) => void; zIndex?: number }> = ({ title, movies, onCardClick, zIndex }) => {
    if (!movies || movies.length === 0) return null;
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
            {
                root: null,
                rootMargin: "0px",
                threshold: 0.1,
            }
        );

        const currentRef = rowRef.current;
        if (currentRef) {
            observer.observe(currentRef);
        }

        return () => {
            if (currentRef) {
                observer.unobserve(currentRef);
            }
        };
    }, []);

    const handleCardFocus = useCallback((cardElement: HTMLElement) => {
        if (!scrollContainerRef.current || !rowContentRef.current) return;

        const containerWidth = scrollContainerRef.current.clientWidth;
        const contentWidth = rowContentRef.current.scrollWidth;
        const padding = 24;

        let targetScroll = cardElement.offsetLeft - padding;

        const maxScroll = contentWidth - containerWidth;
        if (targetScroll > maxScroll) {
            targetScroll = maxScroll;
        }

        if (targetScroll < 0) {
            targetScroll = 0;
        }

        if (rowContentRef.current) {
            rowContentRef.current.style.transform = `translateX(${-targetScroll}px)`;
        }
    }, []);

    const handleMouseLeaveList = useCallback(() => {
        if (window.cineStreamBgTimeoutId) {
            clearTimeout(window.cineStreamBgTimeoutId);
            window.cineStreamBgTimeoutId = null;
        }
    }, []);

    return (
        <div 
            ref={rowRef}
            className={`my-6 md:my-8 content-row ${isInView ? "is-in-view" : ""}`} 
            style={{ zIndex }} 
            onMouseLeave={handleMouseLeaveList}
            onFocus={() => setIsRowActive(true)}
            onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setIsRowActive(false);
                }
            }}
        >
            <div className="flex items-baseline justify-between mb-3 px-6">
                <h2 className={`text-lg md:text-xl font-bold text-white transition-all duration-300 ease-out origin-left ${isRowActive ? "scale-100" : "scale-90 text-zinc-400"}`}>
                    {title}
                </h2>
            </div>
            <div ref={scrollContainerRef} className="overflow-x-hidden no-scrollbar py-32 -my-32">
                <div 
                    ref={rowContentRef} 
                    className="flex flex-nowrap gap-x-6 px-6"
                    style={{
                        transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                        willChange: "transform",
                    }}
                >
                    {movies.map((movie, index) => (
                        <PosterCard 
                            key={movie.id} 
                            movie={movie} 
                            onCardClick={onCardClick} 
                            onCardFocus={handleCardFocus}
                            index={index} 
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

const FilterBar: React.FC<{
    genres: { id: number; name: string }[];
    selectedGenre: string;
    onGenreChange: (genreId: string) => void;
    selectedYear: string;
    onYearChange: (year: string) => void;
    selectedCountry: string;
    onCountryChange: (country: string) => void;
    selectedSort: string;
    onSortChange: (sort: string) => void;
}> = ({ genres, selectedGenre, onGenreChange, selectedYear, onYearChange, selectedCountry, onCountryChange, selectedSort, onSortChange }) => {
    const { t, language } = useTranslation();
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 30 }, (_, i) => currentYear - i);

    const genreOptions = [
        { value: '', label: t('allGenres') },
        ...genres.map(g => ({ value: String(g.id), label: g.name }))
    ];

    const yearOptions = [
        { value: '', label: t('byYear') },
        ...years.map(y => ({ value: String(y), label: String(y) }))
    ];

    // Country/Region List
    const countryOptions = [
        { value: '', label: language === 'ar' ? 'البلد / المنطقة' : 'Country/Region' },
        { value: 'US', label: language === 'ar' ? 'الولايات المتحدة (US)' : 'USA' },
        { value: 'GB', label: language === 'ar' ? 'المملكة المتحدة (GB)' : 'UK' },
        { value: 'KR', label: language === 'ar' ? 'كوريا الجنوبية (KR)' : 'South Korea' },
        { value: 'FR', label: language === 'ar' ? 'فرنسا (FR)' : 'France' },
        { value: 'JP', label: language === 'ar' ? 'اليابان (JP)' : 'Japan' },
        { value: 'ES', label: language === 'ar' ? 'إسبانيا (ES)' : 'Spain' },
        { value: 'IN', label: language === 'ar' ? 'الهند (IN)' : 'India' },
        { value: 'EG', label: language === 'ar' ? 'مصر (EG)' : 'Egypt' }
    ];

    // Sort By List
    const sortOptions = [
        { value: 'popularity.desc', label: language === 'ar' ? 'ترتيب حسب: الأكثر شعبية' : 'Sort By: Popularity' },
        { value: 'release_date.desc', label: language === 'ar' ? 'تاريخ الإصدار' : 'Release Date' },
        { value: 'vote_average.desc', label: language === 'ar' ? 'الأعلى تقييماً' : 'Highest Rating' }
    ];

    return (
        <div className="flex flex-wrap items-center gap-3 my-6 px-4 md:px-10">
            <CustomSelect
                value={selectedGenre}
                onChange={onGenreChange}
                options={genreOptions}
                placeholder={t('allGenres')}
                className="w-48"
            />
            <CustomSelect
                value={selectedYear}
                onChange={onYearChange}
                options={yearOptions}
                placeholder={t('byYear')}
                className="w-32"
            />
            <CustomSelect
                value={selectedCountry}
                onChange={onCountryChange}
                options={countryOptions}
                placeholder={language === 'ar' ? 'البلد / المنطقة' : 'Country/Region'}
                className="w-48"
            />
            <CustomSelect
                value={selectedSort}
                onChange={onSortChange}
                options={sortOptions}
                placeholder={t('sortBy')}
                className="w-56"
            />
        </div>
    );
};

const FilteredItemCard: React.FC<{ item: Movie; index: number }> = ({ item, index }) => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { isYtApiReady, setModalItem } = useProfile();
    const type = 'movie';

    const [showVideo, setShowVideo] = useState(false);
    const [isMuted, setIsMuted] = useState(true);
    const [isFocused, setIsFocused] = useState(false);
    const playerRef = useRef<YTPlayer | null>(null);
    const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const playerContainerId = useMemo(() => `filtered-player-${item.id}-${Math.random().toString(36).substring(2)}`, [item.id]);

    const handleGlow = useCallback(() => {}, []);

    const handleMouseEnter = useCallback(() => {
        handleGlow();
        setIsFocused(true);
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = setTimeout(() => {
          if (
            document.querySelector(
              `.interactive-card-container[data-movie-id='${item.id}']:hover`
            )
          ) {
            setShowVideo(true);
          }
        }, 7000);
    }, [item.id, handleGlow]);

    const handleMouseLeave = useCallback(() => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        setShowVideo(false);
        setIsFocused(false);
    }, []);

    const handleFocus = useCallback(() => {
        handleGlow();
        setIsFocused(true);
    }, [handleGlow]);

    const handleBlur = useCallback(() => {
        setIsFocused(false);
    }, []);

    useEffect(() => {
        if (!showVideo || !isYtApiReady) {
            if (playerRef.current) {
                playerRef.current.destroy();
                playerRef.current = null;
            }
            return;
        }

        const initPlayer = (videoId: string) => {
          if (document.getElementById(playerContainerId) && !playerRef.current) {
            playerRef.current = new window.YT.Player(playerContainerId, {
              videoId: videoId,
              playerVars: { autoplay: 1, controls: 0, rel: 0, loop: 1, playlist: videoId, playsinline: 1, modestbranding: 1, iv_load_policy: 3, fs: 0, start: 5 },
              events: { onReady: (event) => { playerRef.current = event.target; event.target.mute(); setIsMuted(true); event.target.playVideo(); } }
            });
          }
        };

        const fetchTrailerAndInit = async () => {
          try {
            const videos = await fetchFromTMDB(`/${type}/${item.id}/videos`);
            const trailer = videos.results.find((v: any) => v.type === 'Trailer' && v.site === 'YouTube');
            initPlayer(trailer ? trailer.key : 'mF428AFx9gY');
          } catch { initPlayer('mF428AFx9gY'); }
        };

        fetchTrailerAndInit();
        return () => { if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null; } };
    }, [showVideo, item.id, type, playerContainerId, isYtApiReady]);

    const toggleMute = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        const player = playerRef.current;
        if (!player?.isMuted) return;
        if (player.isMuted()) { player.unMute(); setIsMuted(false); } else { player.mute(); setIsMuted(true); }
    }, []);
  
    if (!item.backdrop_path) return null;
    const imageUrl = `${IMAGE_BASE_URL}w500${item.backdrop_path}`;

    return (
        <div 
            className="interactive-card-container relative w-full cursor-pointer glow-card-container focusable rounded-lg mb-8" 
            onMouseEnter={handleMouseEnter} 
            onMouseLeave={handleMouseLeave} 
            data-movie-id={item.id}
            onClick={() => setModalItem({ ...item, media_type: 'movie' })}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={(e) => e.key === 'Enter' && setModalItem({ ...item, media_type: 'movie' })}
            tabIndex={0}
            style={{ '--glow-image-url': `url(${imageUrl})`, animationDelay: `${index * 30}ms` } as React.CSSProperties}
        >
            <div className="relative transition-all duration-300 ease-in-out transform rounded-lg shadow-lg overflow-hidden interactive-card">
                <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden" onClick={() => setModalItem({ ...item, media_type: 'movie' })}>
                    <img src={`${IMAGE_BASE_URL}${BACKDROP_SIZE_MEDIUM}${item.backdrop_path}`} alt={item.title || item.name} className={`object-cover w-full h-full absolute inset-0 transition-opacity duration-700 ${showVideo ? 'opacity-0' : 'opacity-100'}`} loading="lazy" decoding="async" />
                    <div className={`absolute inset-0 w-full h-full transition-opacity duration-700 ${showVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                          <div id={playerContainerId} className="w-full h-full pointer-events-none" />
                          <div className="absolute inset-0" />
                          {showVideo && ( <div className="absolute bottom-2 right-2 z-10"><button onClick={toggleMute} className="w-8 h-8 border-2 border-white/50 rounded-full text-white/80 hover:border-white hover:text-white transition-colors text-sm flex items-center justify-center bg-black/50"><i className={`fa-solid ${isMuted ? 'fa-volume-xmark' : 'fa-volume-high'}`}></i></button></div> )}
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
            <div className={`absolute -bottom-7 left-2 right-2 text-left transition-all duration-300 ease-in-out z-20 ${isFocused ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
                <p className="text-xs font-semibold text-white truncate drop-shadow-lg">
                    {item.title || item.name}
                </p>
            </div>
        </div>
    );
};

const SkeletonLoader: React.FC = () => (
    <div className="px-4 md:px-10">
        <div className="relative w-full h-[70vh] min-h-[500px] bg-[var(--surface)] skeleton rounded-xl" />
        <div className="relative z-10 space-y-8 mt-8">
            {[...Array(7)].map((_, rowIndex) => (
                <div key={rowIndex}>
                    <div className="w-1/3 h-8 mb-4 bg-zinc-800/50 rounded-lg skeleton"></div>
                    <div className="flex gap-x-2">{[...Array(7)].map((_, i) => ( <div key={i} className="flex-shrink-0 w-[24vw] min-w-[220px] max-w-[320px]"><div className="w-full aspect-video bg-zinc-800/50 rounded-lg skeleton"></div></div> ))}</div>
                </div>
            ))}
        </div>
    </div>
);

const MoviesPage: React.FC = () => {
    const [data, setData] = useState<Record<string, Movie[]>>({});
    const [genres, setGenres] = useState<{ id: number; name: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const { setModalItem } = useProfile();
    const { t } = useTranslation();

    const [selectedGenre, setSelectedGenre] = useState('');
    const [selectedYear, setSelectedYear] = useState('');
    const [selectedCountry, setSelectedCountry] = useState('');
    const [selectedSort, setSelectedSort] = useState('popularity.desc');
    const [filteredMovies, setFilteredMovies] = useState<Movie[]>([]);
    const [isFilterLoading, setIsFilterLoading] = useState(false);
    
    // Load More Page State
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    const isFiltering = !!(selectedGenre || selectedYear || selectedCountry || selectedSort !== 'popularity.desc');

    // Fetch initial filtered results (Reset page to 1)
    useEffect(() => {
        const fetchFilteredData = async () => {
            if (!isFiltering) {
                setFilteredMovies([]);
                return;
            }

            setIsFilterLoading(true);
            setPage(1);
            try {
                const params: Record<string, string | number> = { sort_by: selectedSort, page: 1 };
                if (selectedGenre) params.with_genres = selectedGenre;
                if (selectedYear) params.primary_release_year = selectedYear;
                if (selectedCountry) params.with_origin_country = selectedCountry;

                const res = await fetchFromTMDB('/discover/movie', params);
                const filtered = (res.results || []).filter((m: Movie) => m.backdrop_path);
                setFilteredMovies(filtered);
                setHasMore(res.page < res.total_pages);
            } catch (error) {
                console.error("Failed to fetch filtered movies:", error);
            } finally {
                setIsFilterLoading(false);
            }
        };

        fetchFilteredData();
    }, [selectedGenre, selectedYear, selectedCountry, selectedSort, isFiltering]);

    // Load next page
    const handleLoadMore = async () => {
        if (!hasMore || isFilterLoading) return;
        const nextPage = page + 1;
        try {
            const params: Record<string, string | number> = { sort_by: selectedSort, page: nextPage };
            if (selectedGenre) params.with_genres = selectedGenre;
            if (selectedYear) params.primary_release_year = selectedYear;
            if (selectedCountry) params.with_origin_country = selectedCountry;

            const res = await fetchFromTMDB('/discover/movie', params);
            const nextFiltered = (res.results || []).filter((m: Movie) => m.backdrop_path);
            
            setFilteredMovies(prev => [...prev, ...nextFiltered]);
            setPage(nextPage);
            setHasMore(res.page < res.total_pages);
        } catch (error) {
            console.error("Failed to load more filtered movies:", error);
        }
    };

    const handleGridMouseLeave = useCallback(() => {
        if (window.cineStreamBgTimeoutId) {
            clearTimeout(window.cineStreamBgTimeoutId);
            window.cineStreamBgTimeoutId = null;
        }
    }, []);

    const handleOpenModal = (item: Movie) => setModalItem(item);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const filterWithBackdrop = (results: any[]) => (results || []).filter((item: Movie) => item.backdrop_path);
                
                const [genresRes, trendingRes, topRatedRes, actionRes, comedyRes, horrorRes, sciFiRes, upcomingRes] = await Promise.all([
                    fetchFromTMDB('/genre/movie/list'),
                    fetchFromTMDB('/trending/movie/week'),
                    fetchFromTMDB('/movie/top_rated'),
                    fetchFromTMDB('/discover/movie', { with_genres: 28 }),
                    fetchFromTMDB('/discover/movie', { with_genres: 35 }),
                    fetchFromTMDB('/discover/movie', { with_genres: 27 }),
                    fetchFromTMDB('/discover/movie', { with_genres: 878 }),
                    fetchFromTMDB('/movie/upcoming'),
                ]);

                setGenres(genresRes.genres || []);
                setData({
                    trendingMovies: filterWithBackdrop(trendingRes.results),
                    topRated: filterWithBackdrop(topRatedRes.results),
                    action: filterWithBackdrop(actionRes.results),
                    comedy: filterWithBackdrop(comedyRes.results),
                    horror: filterWithBackdrop(horrorRes.results),
                    sciFi: filterWithBackdrop(sciFiRes.results),
                    upcoming: filterWithBackdrop(upcomingRes.results),
                });

            } catch (error) {
                console.error("Failed to fetch movies page data:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const contentRows = useMemo(() => [
        { title: t('trendingMovies'), data: data.trendingMovies },
        { title: t('topRated'), data: data.topRated },
        { title: t('action'), data: data.action },
        { title: t('comedy'), data: data.comedy },
        { title: t('horror'), data: data.horror },
        { title: t('sciFi'), data: data.sciFi },
        { title: t('upcoming'), data: data.upcoming },
    ], [data, t]);

    const renderContent = () => {
        if (isFiltering) {
            if (isFilterLoading && page === 1) {
                return (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-12">
                        {Array.from({ length: 15 }).map((_, i) => (
                            <div key={i} className="w-full animate-pulse aspect-video bg-[var(--surface)] rounded-lg"></div>
                        ))}
                    </div>
                );
            }
            if (filteredMovies.length === 0) {
                return <p className="text-center text-gray-400 py-10">{t('noItemsFound', { title: '' })}</p>;
            }
            return (
                <div className="flex flex-col items-center">
                    <div onMouseLeave={handleGridMouseLeave} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-8 w-full">
                        {filteredMovies.map((movie, index) => (
                            <FilteredItemCard key={movie.id} item={movie} index={index} />
                        ))}
                    </div>
                    {hasMore && (
                        <button 
                            onClick={handleLoadMore} 
                            className="px-6 py-3 bg-zinc-900 border border-zinc-800 text-zinc-200 hover:text-white hover:bg-zinc-800 hover:border-zinc-700 transition-all font-bold text-sm rounded-full cursor-pointer mt-6 focusable"
                        >
                            {t('loadMore')}
                        </button>
                    )}
                </div>
            );
        }
        return (
            <>
                {contentRows.map((row, index) => (
                    <ContentRow key={row.title} title={row.title} movies={row.data} onCardClick={handleOpenModal} zIndex={10 - index} />
                ))}
            </>
        );
    };

    return (
        <Layout>
            {loading ? (
                <SkeletonLoader />
            ) : (
                <div>
                    <div className="pt-24 px-4 md:px-10">
                        <Hero />
                    </div>
                    <FilterBar
                        genres={genres}
                        selectedGenre={selectedGenre}
                        onGenreChange={setSelectedGenre}
                        selectedYear={selectedYear}
                        onYearChange={setSelectedYear}
                        selectedCountry={selectedCountry}
                        onCountryChange={setSelectedCountry}
                        selectedSort={selectedSort}
                        onSortChange={setSelectedSort}
                    />
                    <div className="px-4 md:px-10">
                        {renderContent()}
                    </div>
                </div>
            )}
        </Layout>
    );
};

export default MoviesPage;
