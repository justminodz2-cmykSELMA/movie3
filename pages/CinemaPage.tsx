import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchFromTMDB } from '../services/apiService';
import { Movie } from '../types';
import { useTranslation } from '../contexts/LanguageContext';
import Layout from '../components/Layout';
import { IMAGE_BASE_URL, POSTER_SIZE, BACKDROP_SIZE_MEDIUM } from '../contexts/constants';

const formatViewers = (num: number) => {
    if (num > 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
}

const SpotlightCinemaCard: React.FC<{ item: Movie; index: number }> = ({ item, index }) => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const type = item.media_type || (item.title ? 'movie' : 'tv');
    const viewers = useMemo(() => Math.floor(Math.random() * 5000) + 100, [item.id]);

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
            onClick={() => navigate(`/live/${type}/${item.id}`)}
            className="w-[80vw] sm:w-96 flex-shrink-0 cursor-pointer snap-center glow-card-container focusable"
            onMouseEnter={handleGlow}
            onFocus={handleGlow}
            tabIndex={0}
            style={{ '--glow-image-url': `url(${IMAGE_BASE_URL}w500${item.backdrop_path})` } as React.CSSProperties}
        >
            <div className="relative overflow-hidden rounded-lg shadow-xl bg-[var(--surface)] aspect-video interactive-card">
                <img
                    src={`${IMAGE_BASE_URL}${BACKDROP_SIZE_MEDIUM}${item.backdrop_path}`}
                    alt={item.title || item.name}
                    className="object-cover w-full h-full"
                    loading="lazy"
            decoding="async"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>
                <div className="absolute top-3 left-3 px-2.5 py-1 text-xs font-bold text-white bg-red-600 rounded-md shadow-lg flex items-center gap-1.5 animate-pulse-live">
                    {t('live')}
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h3 className="text-xl font-extrabold text-white truncate drop-shadow-md">{item.title || item.name}</h3>
                    <div className="flex items-center justify-between mt-1 text-sm text-gray-200">
                        <p className="font-medium truncate">{type === 'tv' ? t('series') : t('movie')}</p>
                        <div className="flex items-center gap-1.5 text-xs font-bold text-white bg-black/40 px-2 py-1 rounded-md backdrop-blur-sm">
                            <i className="fa-solid fa-eye text-xs"></i>
                            <span>{formatViewers(viewers)}</span>
                        </div>
                    </div>
                </div>
                <div className="absolute inset-0 flex items-center justify-center transition-all duration-300 opacity-0 group-hover:opacity-100 bg-black/50">
                   <i className="text-5xl text-white fa-solid fa-play-circle"></i>
                </div>
            </div>
        </div>
    );
};

const SpotlightCinemaRow: React.FC<{ title: string; items: Movie[] }> = ({ title, items }) => {
    if (!items || items.length === 0) return null;
    const handleMouseLeaveList = useCallback(() => {
        if (window.cineStreamBgTimeoutId) {
            clearTimeout(window.cineStreamBgTimeoutId);
            window.cineStreamBgTimeoutId = null;
        }
        document.body.classList.remove('has-dynamic-bg');
    }, []);
    return (
        <div className="my-8" onMouseLeave={handleMouseLeaveList}>
            <h2 className="text-2xl font-bold text-white px-4 mb-4">{title}</h2>
            <div className="overflow-x-auto no-scrollbar snap-x snap-mandatory">
                <div className="flex flex-nowrap gap-x-4 pb-4 px-4 scroll-px-4">
                    {items.map((item, index) => (
                        <SpotlightCinemaCard item={item} index={index} key={item.id} />
                    ))}
                </div>
            </div>
        </div>
    );
};

const CinemaCard: React.FC<{ item: Movie; index: number }> = ({ item, index }) => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const type = item.media_type || (item.title ? 'movie' : 'tv');

    const viewers = useMemo(() => Math.floor(Math.random() * 5000) + 100, [item.id]);

    const handleClick = () => {
        navigate(`/live/${type}/${item.id}`);
    };

    if (!item.poster_path) return null;
    
    const handleGlow = useCallback(() => {
        if (window.cineStreamBgTimeoutId) {
            clearTimeout(window.cineStreamBgTimeoutId);
        }
        window.cineStreamBgTimeoutId = window.setTimeout(() => {
            if (item.poster_path) {
                const imageUrl = `${IMAGE_BASE_URL}w342${item.poster_path}`;
                document.body.style.setProperty('--dynamic-bg-image', `url(${imageUrl})`);
                document.body.classList.add('has-dynamic-bg');
            }
        }, 200);
    }, [item.poster_path]);

    return (
        <div
            onClick={handleClick}
            className="w-full cursor-pointer group glow-card-container focusable"
            onMouseEnter={handleGlow}
            onFocus={handleGlow}
            tabIndex={0}
            style={{ '--glow-image-url': `url(${IMAGE_BASE_URL}w342${item.poster_path})` } as React.CSSProperties}
        >
            <div className="relative overflow-hidden rounded-lg shadow-lg bg-[var(--surface)] aspect-[2/3] interactive-card">
                <img
                    src={`${IMAGE_BASE_URL}${POSTER_SIZE}${item.poster_path}`}
                    alt={item.title || item.name}
                    className="object-cover w-full h-full"
                    loading="lazy"
            decoding="async"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
                <div className="absolute top-3 left-3 px-2.5 py-1 text-xs font-bold text-white bg-red-600 rounded-md shadow-lg flex items-center gap-1.5 animate-pulse-live">
                    {t('live')}
                </div>
                <div className="absolute bottom-3 left-3 right-3">
                    <h3 className="text-base font-bold text-white truncate drop-shadow-md">{item.title || item.name}</h3>
                    <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-gray-300 font-medium truncate">{type === 'tv' ? t('series') : t('movie')}</p>
                        <div className="flex items-center gap-1 text-xs font-bold text-white bg-black/40 px-2 py-1 rounded-md backdrop-blur-sm">
                            <i className="fa-solid fa-eye text-xs"></i>
                            <span>{formatViewers(viewers)}</span>
                        </div>
                    </div>
                </div>
                 <div className="absolute inset-0 flex items-center justify-center transition-all duration-300 opacity-0 group-hover:opacity-100 bg-black/50">
                   <i className="text-5xl text-white fa-solid fa-play-circle"></i>
                </div>
            </div>
        </div>
    );
};

const CinemaCategoryRow: React.FC<{ title: string; items: Movie[] }> = ({ title, items }) => {
    if (!items || items.length === 0) return null;
    const handleMouseLeaveList = useCallback(() => {
        if (window.cineStreamBgTimeoutId) {
            clearTimeout(window.cineStreamBgTimeoutId);
            window.cineStreamBgTimeoutId = null;
        }
        document.body.classList.remove('has-dynamic-bg');
    }, []);
    return (
        <div className="my-8" onMouseLeave={handleMouseLeaveList}>
            <h2 className="text-2xl font-bold text-white px-4 mb-4">{title}</h2>
            <div className="overflow-x-auto no-scrollbar">
                <div className="flex flex-nowrap gap-x-4 pb-4 px-4">
                    {items.map((item, index) => (
                        <div className="w-40 md:w-44 flex-shrink-0" key={item.id}>
                            <CinemaCard item={item} index={index} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const SkeletonLoader: React.FC = () => {
    return (
        <div className="px-4">
             {/* Spotlight Skeleton */}
            <div className="my-8">
                <div className="h-8 w-1/3 bg-[var(--surface)] rounded-md mb-4 skeleton"></div>
                <div className="flex flex-nowrap gap-x-4 pb-4 -mx-4 px-4">
                    {Array.from({ length: 3 }).map((_, j) => (
                        <div className="w-[80vw] sm:w-96 flex-shrink-0" key={j}>
                            <div className="w-full aspect-video bg-[var(--surface)] rounded-2xl skeleton"></div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Standard Row Skeleton */}
            {Array.from({ length: 3 }).map((_, i) => (
                <div className="my-8" key={i}>
                    <div className="h-8 w-1/3 bg-[var(--surface)] rounded-md mb-4 skeleton"></div>
                    <div className="flex flex-nowrap gap-x-4 pb-4 -mx-4 px-4">
                         {Array.from({ length: 6 }).map((_, j) => (
                            <div className="w-40 md:w-44 flex-shrink-0" key={j}>
                                <div className="w-full aspect-[2/3] bg-[var(--surface)] rounded-2xl skeleton"></div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

const GENRES_TO_SHOW = [
    { id: 28, name: 'Action' },
    { id: 35, name: 'Comedy' },
    { id: 878, name: 'Science Fiction' },
    { id: 27, name: 'Horror' }
];

const CinemaPage: React.FC = () => {
    const { t } = useTranslation();
    const [categories, setCategories] = useState<{ [key: string]: Movie[] }>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAllCategories = async () => {
            setLoading(true);
            try {
                const genrePromises = GENRES_TO_SHOW.map(async (genre) => {
                    const res = await fetchFromTMDB('/discover/movie', { with_genres: genre.id, sort_by: 'popularity.desc' });
                    return { name: genre.name, movies: res.results || [] };
                });

                const [moviesRes, seriesRes, ...genreResults] = await Promise.all([
                    fetchFromTMDB('/trending/movie/day'),
                    fetchFromTMDB('/trending/tv/day'),
                    ...genrePromises
                ]);

                const newCategories: { [key: string]: Movie[] } = {};
                (genreResults as { name: string; movies: Movie[] }[]).forEach(cat => {
                    newCategories[cat.name] = cat.movies;
                });

                setCategories({
                    [t('topMovies')]: moviesRes.results || [],
                    [t('topSeries')]: seriesRes.results || [],
                    ...newCategories,
                });

            } catch (error) {
                console.error('Failed to fetch cinema data', error);
            } finally {
                setLoading(false);
            }
        };
        fetchAllCategories();
    }, [t]);
    
    return (
        <Layout>
            <div className="py-4">
                <header className="mb-4 px-4">
                    <h1 className="text-3xl font-extrabold text-white">{t('cinema')}</h1>
                    <p className="text-gray-400 mt-1">{t('live')} movies, series, and more.</p>
                </header>

                {loading ? (
                    <SkeletonLoader />
                ) : (
                    <div>
                        {Object.entries(categories).map(([title, items]) => {
                            if (title === t('topMovies')) {
                                return <SpotlightCinemaRow key={title} title={title} items={items} />;
                            }
                            return <CinemaCategoryRow key={title} title={title} items={items} />;
                        })}
                    </div>
                )}
            </div>
        </Layout>
    );
};

export default CinemaPage;
