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
    const heroImage = "https://blog.xcvgsystems.com/wp-content/uploads/2024/04/fallout_promo.jpg"; // Fallout
    return (
        <div className="relative w-full h-[70vh] min-h-[300px] text-white overflow-hidden rounded-xl">
            <img src={heroImage} alt="Fallout" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--background)]/80 via-transparent to-transparent"></div>
            <div className="absolute inset-0 bg-gradient-to-r from-black to-transparent"></div>
            <div className="absolute inset-0 bg-gradient-to-l from-[var(--background)]/50 to-transparent"></div>
            <div className="relative z-10 flex flex-col justify-end h-full px-4 md:px-10 pb-20">
                <div className="max-w-xl animate-hero-content-in">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-xl font-black text-red-600" style={{ fontFamily: "'Anton', sans-serif" }}>N</span>
                        <span className="text-sm font-semibold tracking-[0.2em] text-zinc-200 uppercase">SERIES</span>
                    </div>
                    <img src="https://i.ibb.co/N2z8HGjh/pngimg-com-fallout-PNG34.png" alt="Fallout Title" className="w-full max-w-sm md:max-w-md drop-shadow-lg mb-4" />
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-zinc-200" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.7)' }}>
                        <span>Series</span><span>•</span><span>Sci-Fi</span><span>•</span><span>2024</span><span>•</span><span>1 Season</span><span>•</span><span className="px-2 py-0.5 border border-zinc-400 text-sm rounded">TV-MA</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const PosterCard: React.FC<{ movie: Movie; onCardClick: (movie: Movie) => void; isNetflixOriginal?: boolean; index: number }> = ({ movie, onCardClick, isNetflixOriginal, index }) => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { isYtApiReady } = useProfile();
    const type = 'tv';

    const [showVideo, setShowVideo] = useState(false);
    const [isMuted, setIsMuted] = useState(true);
    const [isFocused, setIsFocused] = useState(false);
    const playerRef = useRef<YTPlayer | null>(null);
    const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const playerContainerId = useMemo(() => `poster-player-${movie.id}-${Math.random().toString(36).substring(2)}`, [movie.id]);

    const handleGlow = useCallback(() => {
        if (window.cineStreamBgTimeoutId) {
            clearTimeout(window.cineStreamBgTimeoutId);
        }
        window.cineStreamBgTimeoutId = window.setTimeout(() => {
            if (movie.backdrop_path) {
                const imageUrl = `${IMAGE_BASE_URL}w300${movie.backdrop_path}`;
                document.body.style.setProperty('--dynamic-bg-image', `url(${imageUrl})`);
                document.body.classList.add('has-dynamic-bg');
            }
        }, 200);
    }, [movie.backdrop_path]);

    const handleMouseEnter = useCallback(() => {
        handleGlow();
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = setTimeout(() => {
            if (document.querySelector(`.interactive-card-container[data-movie-id='${movie.id}']:hover`)) {
               setShowVideo(true);
            }
        }, 7000);
    }, [movie.id, handleGlow]);

    const handleMouseLeave = useCallback(() => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        setShowVideo(false);
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
            <div className="relative transition-all duration-300 ease-in-out transform rounded-lg shadow-lg interactive-card">
                {isNetflixOriginal && ( <span style={{ fontFamily: "'Anton', sans-serif", textShadow: '1px 1px 3px rgba(0,0,0,0.5)' }} className="absolute top-2 left-2 z-10 text-3xl font-black text-[var(--primary)] pointer-events-none">V</span> )}
                <div className="relative w-full aspect-video bg-black rounded-t-lg overflow-hidden" onClick={() => onCardClick(movie)}>
                    <img src={`${IMAGE_BASE_URL}${BACKDROP_SIZE_MEDIUM}${movie.backdrop_path}`} alt={movie.title || movie.name} className={`object-cover w-full h-full absolute inset-0 transition-opacity duration-700 ${showVideo ? 'opacity-0' : 'opacity-100'}`} loading="lazy"
            decoding="async" />
                    <div className={`absolute inset-0 w-full h-full transition-opacity duration-700 ${showVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                          <div id={playerContainerId} className="w-full h-full pointer-events-none" />
                          <div className="absolute inset-0" />
                          {showVideo && ( <div className="absolute bottom-2 right-2 z-10"><button onClick={toggleMute} className="w-8 h-8 border-2 border-white/50 rounded-full text-white/80 hover:border-white hover:text-white transition-colors text-sm flex items-center justify-center bg-black/50"><i className={`fa-solid ${isMuted ? 'fa-volume-xmark' : 'fa-volume-high'}`}></i></button></div> )}
                    </div>
                </div>
                <div className="quick-view bg-[var(--surface)] px-3 rounded-b-lg">
                   <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button onClick={() => navigate('/player', { state: { item: movie, type } })} className="w-9 h-9 flex items-center justify-center text-black bg-white rounded-full text-lg btn-press"><i className="fas fa-play"></i></button>
                        <button className="w-9 h-9 flex items-center justify-center text-white border-2 border-zinc-500 rounded-full text-lg btn-press hover:border-white"><i className="fas fa-plus"></i></button>
                      </div>
                      <button onClick={() => onCardClick(movie)} className="w-9 h-9 flex items-center justify-center text-white border-2 border-zinc-500 rounded-full text-lg btn-press hover:border-white"><i className="fas fa-chevron-down"></i></button>
                   </div>
                   <div className="flex items-center flex-wrap gap-2 text-xs mt-3 text-zinc-300 pb-2">
                      <span className="font-bold text-green-500">{(movie.vote_average * 10).toFixed(0)}% {t('match')}</span>
                      <span className='px-1.5 py-0.5 border border-white/40 text-[10px] rounded'>HD</span>
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
    const handleMouseLeaveList = useCallback(() => {
        if (window.cineStreamBgTimeoutId) {
            clearTimeout(window.cineStreamBgTimeoutId);
            window.cineStreamBgTimeoutId = null;
        }
        document.body.classList.remove('has-dynamic-bg');
    }, []);
    return (
        <div className="my-6 md:my-8" style={{ zIndex }} onMouseLeave={handleMouseLeaveList}>
            <h2 className="text-lg md:text-xl font-bold text-white mb-3 px-4 md:px-10">{title}</h2>
            <div className="overflow-x-auto no-scrollbar py-32 -my-32"><div className="flex flex-nowrap gap-x-6 px-6 md:px-10">{movies.map((movie, index) => <PosterCard key={movie.id} movie={movie} onCardClick={onCardClick} index={index} />)}</div></div>
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
        { value: 'first_air_date.desc', label: language === 'ar' ? 'تاريخ أول عرض' : 'First Air Date' },
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
    const { setModalItem } = useProfile();
    const [isFocused, setIsFocused] = useState(false);
    if (!item.backdrop_path) return null;
    
    const glowImageUrl = `${IMAGE_BASE_URL}w500${item.backdrop_path}`;
    
    const handleGlow = useCallback(() => {
        if (window.cineStreamBgTimeoutId) {
            clearTimeout(window.cineStreamBgTimeoutId);
        }
        window.cineStreamBgTimeoutId = window.setTimeout(() => {
            if (item.backdrop_path) {
                const imageUrl = `${IMAGE_BASE_URL}w300${item.backdrop_path}`;
                document.body.style.setProperty('--dynamic-bg-image', `url(${imageUrl})`);
                document.body.classList.add('has-dynamic-bg');
            }
        }, 200);
    }, [item.backdrop_path]);

    return (
        <div 
            className="w-full animate-grid-item cursor-pointer glow-card-container focusable relative rounded-lg" 
            style={{ '--glow-image-url': `url(${glowImageUrl})`, animationDelay: `${index * 30}ms` } as React.CSSProperties}
            onClick={() => setModalItem({ ...item, media_type: 'tv' })}
            onKeyDown={(e) => e.key === 'Enter' && setModalItem({ ...item, media_type: 'tv' })}
            onMouseEnter={handleGlow}
            onFocus={() => { handleGlow(); setIsFocused(true); }}
            onBlur={() => setIsFocused(false)}
            tabIndex={0}
        >
            <div className="relative transition-all duration-300 ease-in-out rounded-lg shadow-lg interactive-card hover:scale-105">
                 <img
                    src={`${IMAGE_BASE_URL}${BACKDROP_SIZE_MEDIUM}${item.backdrop_path}`}
                    alt={item.title || item.name}
                    className="object-cover w-full aspect-video rounded-lg"
                    loading="lazy"
            decoding="async"
                />
            </div>
            <div className="mt-2 text-left min-h-[1.5rem]">
                <p className={`text-xs font-semibold text-white truncate transition-all duration-200 ${isFocused ? "opacity-100" : "opacity-0"}`}>
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

const TvShowsPage: React.FC = () => {
    const [data, setData] = useState<Record<string, Movie[]>>({});
    const [genres, setGenres] = useState<{ id: number; name: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const { setModalItem } = useProfile();
    const { t } = useTranslation();

    const [selectedGenre, setSelectedGenre] = useState('');
    const [selectedYear, setSelectedYear] = useState('');
    const [selectedCountry, setSelectedCountry] = useState('');
    const [selectedSort, setSelectedSort] = useState('popularity.desc');
    const [filteredTv, setFilteredTv] = useState<Movie[]>([]);
    const [isFilterLoading, setIsFilterLoading] = useState(false);
    
    // Load More Page State
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    const isFiltering = !!(selectedGenre || selectedYear || selectedCountry || selectedSort !== 'popularity.desc');

    // Fetch initial filtered results (Reset page to 1)
    useEffect(() => {
        const fetchFilteredData = async () => {
            if (!isFiltering) {
                setFilteredTv([]);
                return;
            }

            setIsFilterLoading(true);
            setPage(1);
            try {
                const params: Record<string, string | number> = { sort_by: selectedSort, page: 1 };
                if (selectedGenre) params.with_genres = selectedGenre;
                if (selectedYear) params.first_air_date_year = selectedYear;
                if (selectedCountry) params.with_origin_country = selectedCountry;

                const res = await fetchFromTMDB('/discover/tv', params);
                const filtered = (res.results || []).filter((m: Movie) => m.backdrop_path);
                setFilteredTv(filtered);
                setHasMore(res.page < res.total_pages);
            } catch (error) {
                console.error("Failed to fetch filtered TV shows:", error);
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
            if (selectedYear) params.first_air_date_year = selectedYear;
            if (selectedCountry) params.with_origin_country = selectedCountry;

            const res = await fetchFromTMDB('/discover/tv', params);
            const nextFiltered = (res.results || []).filter((m: Movie) => m.backdrop_path);
            
            setFilteredTv(prev => [...prev, ...nextFiltered]);
            setPage(nextPage);
            setHasMore(res.page < res.total_pages);
        } catch (error) {
            console.error("Failed to load more filtered TV shows:", error);
        }
    };

    const handleGridMouseLeave = useCallback(() => {
        if (window.cineStreamBgTimeoutId) {
            clearTimeout(window.cineStreamBgTimeoutId);
            window.cineStreamBgTimeoutId = null;
        }
        document.body.classList.remove('has-dynamic-bg');
    }, []);

    const handleOpenModal = (item: Movie) => setModalItem(item);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const filterWithBackdrop = (results: any[]) => (results || []).filter((item: Movie) => item.backdrop_path);
                
                const [genresRes, trendingRes, topRatedRes, actionRes, comedyRes, horrorRes, sciFiRes, upcomingRes] = await Promise.all([
                    fetchFromTMDB('/genre/tv/list'),
                    fetchFromTMDB('/trending/tv/week'),
                    fetchFromTMDB('/tv/top_rated'),
                    fetchFromTMDB('/discover/tv', { with_genres: 10759 }),
                    fetchFromTMDB('/discover/tv', { with_genres: 35 }),
                    fetchFromTMDB('/discover/tv', { with_genres: 9648 }),
                    fetchFromTMDB('/discover/tv', { with_genres: 10765 }),
                    fetchFromTMDB('/tv/airing_today'),
                ]);

                setGenres(genresRes.genres || []);
                setData({
                    trendingTvShows: filterWithBackdrop(trendingRes.results),
                    topRated: filterWithBackdrop(topRatedRes.results),
                    action: filterWithBackdrop(actionRes.results),
                    comedy: filterWithBackdrop(comedyRes.results),
                    horror: filterWithBackdrop(horrorRes.results),
                    sciFi: filterWithBackdrop(sciFiRes.results),
                    upcoming: filterWithBackdrop(upcomingRes.results),
                });

            } catch (error) {
                console.error("Failed to fetch TV page data:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const contentRows = useMemo(() => [
        { title: t('trendingTvShows'), data: data.trendingTvShows },
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
            if (filteredTv.length === 0) {
                return <p className="text-center text-gray-400 py-10">{t('noItemsFound', { title: '' })}</p>;
            }
            return (
                <div className="flex flex-col items-center">
                    <div onMouseLeave={handleGridMouseLeave} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-8 w-full">
                        {filteredTv.map((tvShow, index) => (
                            <FilteredItemCard key={tvShow.id} item={tvShow} index={index} />
                        ))}
                    </div>
                    {hasMore && (
                        <button 
                            onClick={handleLoadMore} 
                            className="text-white hover:text-white/80 transition-all font-semibold py-8 px-12 bg-transparent border-none outline-none focusable focus:text-red-500 rounded-md cursor-pointer mt-4 animate-fade-in"
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

export default TvShowsPage;
