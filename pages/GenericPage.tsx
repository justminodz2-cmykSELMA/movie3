import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useProfile } from '../contexts/ProfileContext';
import { useTranslation } from '../contexts/LanguageContext';
import Layout from '../components/Layout';
import { fetchFromTMDB } from '../services/apiService';
import { Movie, FavoriteItem } from '../types';
import { IMAGE_BASE_URL, POSTER_SIZE, BACKDROP_SIZE_MEDIUM } from '../contexts/constants';


const ItemCard: React.FC<{ item: Movie | FavoriteItem, index: number }> = ({ item, index }) => {
    const { setModalItem, isKidsMode } = useProfile();

    const title = item.title || item.name;
    const backdropPath = 'backdrop_path' in item ? item.backdrop_path : ('backdropPath' in item ? item.backdropPath : null);
    
    const glowImageUrl = backdropPath ? `${IMAGE_BASE_URL}w500${backdropPath}` : null;
    const type = 'media_type' in item ? item.media_type : ('type' in item ? item.type : (item.title ? 'movie' : 'tv'));

    if (!backdropPath) return null;

    const handleGlow = useCallback(() => {
        if (window.cineStreamBgTimeoutId) {
            clearTimeout(window.cineStreamBgTimeoutId);
        }
        window.cineStreamBgTimeoutId = window.setTimeout(() => {
            if (backdropPath) {
                const imageUrl = `${IMAGE_BASE_URL}w300${backdropPath}`;
                document.body.style.setProperty('--dynamic-bg-image', `url(${imageUrl})`);
                document.body.classList.add('has-dynamic-bg');
            }
        }, 200);
    }, [backdropPath]);

    const handleItemClick = () => {
        const itemForModal: Movie = {
            ...(item as any),
            id: item.id,
            media_type: type,
            backdrop_path: backdropPath,
        };
        setModalItem(itemForModal);
    };

    const [isFocused, setIsFocused] = useState(false);

    return (
        <div 
            className="w-full animate-grid-item cursor-pointer focusable glow-card-container relative" 
            style={{ '--glow-image-url': glowImageUrl ? `url(${glowImageUrl})` : 'none', animationDelay: `${index * 30}ms` } as React.CSSProperties}
            onClick={handleItemClick}
            onKeyDown={(e) => e.key === 'Enter' && handleItemClick()}
            onMouseEnter={handleGlow}
            onFocus={() => { handleGlow(); setIsFocused(true); }}
            onBlur={() => setIsFocused(false)}
            tabIndex={0}
        >
            <div className={`relative overflow-hidden transition-all duration-300 ease-in-out rounded-lg shadow-lg bg-[var(--surface)] interactive-card hover:scale-105 ${isKidsMode ? 'golden-worm-border' : ''}`}>
                 <div className={isKidsMode ? 'golden-worm-border-inner' : 'w-full h-full'}>
                 <img
                    src={`${IMAGE_BASE_URL}${BACKDROP_SIZE_MEDIUM}${backdropPath}`}
                    alt={title}
                    className="object-cover w-full aspect-video"
                    loading="lazy"
            decoding="async"
                />
                </div>
            </div>
            <div className="mt-2 text-left min-h-[1.5rem]">
                <p className={`text-xs font-semibold text-white truncate transition-all duration-200 ${isFocused ? "opacity-100" : "opacity-0"}`}>
                    {title}
                </p>
            </div>
        </div>
    );
};

const SkeletonCard: React.FC = () => (
    <div className="w-full animate-pulse">
        <div className="aspect-video w-full rounded-lg bg-[var(--surface)]"></div>
    </div>
);

const GenericPage: React.FC<{
    pageType: 'favorites' | 'downloads' | 'search' | 'all' | 'subscriptions',
    title: string
}> = ({ pageType, title }) => {
    const { getScreenSpecificData, addLastSearch, activeProfile, setModalItem, isKidsMode } = useProfile();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [content, setContent] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const { category } = useParams<{category: string}>();
    
    // Search page specific state
    const [searchParams, setSearchParams] = useSearchParams();
    const query = searchParams.get('q');
    const [inputValue, setInputValue] = useState(query || '');
    const [allResults, setAllResults] = useState<Movie[]>([]);
    const [initialContent, setInitialContent] = useState<Movie[]>([]);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const inputRef = useRef<HTMLInputElement>(null);
    const resultsContainerRef = useRef<HTMLDivElement>(null);

    const SearchResultCard: React.FC<{ item: Movie, index: number }> = ({ item, index }) => {
        const type = item.media_type || (item.title ? 'movie' : 'tv');
    
        if (!item.backdrop_path) return null;

        const glowImageUrl = `${IMAGE_BASE_URL}w500${item.backdrop_path}`;
    
        const handleCardClick = () => {
            setModalItem(item);
        };

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

        const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleCardClick();
                return;
            }

            if (e.key === 'ArrowUp') {
                const container = resultsContainerRef.current;
                if (!container) return;

                const currentRect = e.currentTarget.getBoundingClientRect();
                const focusables = Array.from(container.querySelectorAll('.focusable')) as HTMLElement[];
                
                let isFirstRow = true;
                // Check if any other focusable card is positioned above the current one.
                for (const other of focusables) {
                    if (other === e.currentTarget) continue;
                    const otherRect = other.getBoundingClientRect();
                    // If another card's bottom edge is above the vertical center of the current card, it's in a row above.
                    if (otherRect.bottom < currentRect.top + (currentRect.height / 2)) {
                        isFirstRow = false;
                        break;
                    }
                }
                
                if (isFirstRow) {
                    e.preventDefault();
                    inputRef.current?.focus();
                }
            }
        };
    
        const [isFocused, setIsFocused] = useState(false);
    
        return (
            <div 
                className="interactive-card-container w-full cursor-pointer animate-grid-item focusable glow-card-container relative"
                style={{ '--glow-image-url': `url(${glowImageUrl})`, animationDelay: `${index * 30}ms` } as React.CSSProperties}
                onClick={handleCardClick}
                onMouseEnter={handleGlow}
                onFocus={() => { handleGlow(); setIsFocused(true); }}
                onBlur={() => setIsFocused(false)}
                onKeyDown={handleKeyDown}
                tabIndex={0}
            >
              <div className={`relative overflow-hidden transition-all duration-300 ease-in-out transform rounded-lg shadow-lg bg-[var(--surface)] interactive-card hover:scale-105 ${isKidsMode ? 'golden-worm-border' : ''}`}>
                 <div className={isKidsMode ? 'golden-worm-border-inner' : 'w-full h-full'}>
                <img
                  src={`${IMAGE_BASE_URL}${BACKDROP_SIZE_MEDIUM}${item.backdrop_path}`}
                  alt={item.title || item.name}
                  className="object-cover w-full aspect-video"
                  loading="lazy"
            decoding="async"
                />
                <div className="quick-view bg-[var(--surface)] px-3">
                   <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button onClick={(e) => { e.stopPropagation(); navigate('/player', { state: { item, type } }); }} className="w-9 h-9 flex items-center justify-center text-black bg-white rounded-full text-lg btn-press"><i className="fas fa-play"></i></button>
                        <button onClick={(e) => e.stopPropagation()} className="w-9 h-9 flex items-center justify-center text-white border-2 border-zinc-500 rounded-full text-lg btn-press hover:border-white"><i className="fas fa-plus"></i></button>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); handleCardClick(); }} className="w-9 h-9 flex items-center justify-center text-white border-2 border-zinc-500 rounded-full text-lg btn-press hover:border-white"><i className="fas fa-chevron-down"></i></button>
                   </div>
                   <div className="flex items-center gap-2 text-xs mt-3 pb-2">
                      <span className="font-bold text-green-500">{(item.vote_average * 10).toFixed(0)}% {t('match')}</span>
                      <span className='px-1.5 py-0.5 border border-white/50 text-[10px] rounded'>HD</span>
                   </div>
                </div>
                </div>
              </div>
              <div className="mt-2 text-left min-h-[1.5rem]">
                <p className={`text-xs font-semibold text-white truncate transition-all duration-200 ${isFocused ? "opacity-100" : "opacity-0"}`}>
                    {item.title || item.name}
                </p>
              </div>
            </div>
        );
    };

    const performSearch = useCallback(async (searchQuery: string) => {
        if (!searchQuery) {
            setAllResults([]);
            return;
        }
        setLoading(true);
        try {
            const searchRes = await fetchFromTMDB('/search/multi', { query: searchQuery });
            
            const validResults = (searchRes.results as any[]).filter(
                (item: any): item is Movie => item.poster_path && (item.media_type === 'movie' || item.media_type === 'tv')
            );
    
            const uniqueResults = Array.from(new Map(validResults.map(item => [item.id, item])).values())
                .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));

            setAllResults(uniqueResults);
            if(uniqueResults[0]) addLastSearch(uniqueResults[0]);
        } catch (error) {
            console.error("Search failed", error);
        } finally {
            setLoading(false);
        }
    }, [addLastSearch]);

    const loadContent = useCallback(async () => {
        setLoading(true);
        try {
            switch (pageType) {
                case 'favorites':
                    setContent(getScreenSpecificData('favorites', []).reverse());
                    break;
                case 'downloads':
                    setContent(getScreenSpecificData('downloads', []));
                    break;
                case 'subscriptions':
                    setContent([]); // Placeholder for subscriptions
                    break;
                case 'all':
                    if (category) {
                        let endpoint = '';
                        switch(category) {
                            case 'series':
                                endpoint = '/tv/popular';
                                break;
                            case 'trending_week':
                                endpoint = '/trending/movie/week';
                                break;
                            default:
                                endpoint = `/movie/${category}`;
                        }
                        const allRes = await fetchFromTMDB(endpoint);
                        setContent(allRes.results);
                    }
                    break;
            }
        } catch (error) {
            console.error(`Failed to load content for ${pageType}`, error);
        } finally {
            setLoading(false);
        }
    }, [pageType, category, getScreenSpecificData]);
    
    // Auto-focus search input
    useEffect(() => {
      if (pageType === 'search') {
        inputRef.current?.focus();
      }
    }, [pageType]);
    
    // Debounce search input and update URL
    useEffect(() => {
        if (pageType !== 'search') return;
        if (inputValue === (query || '')) return;

        const handler = setTimeout(() => {
            setSearchParams(inputValue ? { q: inputValue } : {});
        }, 300);

        return () => clearTimeout(handler);
    }, [inputValue, query, pageType, setSearchParams]);

    // Sync input value with URL query on back/forward navigation
    useEffect(() => {
        if (pageType === 'search') {
            setInputValue(query || '');
        }
    }, [query, pageType]);

    // Effect for search page logic
    useEffect(() => {
        if (pageType === 'search') {
            if (query) {
                performSearch(query);
            } else {
                setAllResults([]);
                setIsInitialLoading(true);
                fetchFromTMDB('/trending/all/week')
                    .then(res => setInitialContent(res.results?.filter((item: Movie) => item.backdrop_path) || []))
                    .catch(err => console.error(`Failed to load trending content for search page`, err))
                    .finally(() => setIsInitialLoading(false));
            }
        }
    }, [query, pageType, performSearch]);

    // Effect for other page types
    useEffect(() => {
        if (pageType !== 'search' && activeProfile) {
            loadContent();
        }
    }, [pageType, loadContent, activeProfile]);

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const firstCard = resultsContainerRef.current?.querySelector('.focusable') as HTMLElement;
            if (firstCard) {
                firstCard.focus();
                // TV browsers are laggy with smooth scrolling. Snappy instant scrolling is standard.
                const isTV = typeof navigator !== 'undefined' && /SmartTV|Tizen|Web0S|AppleTV|AndroidTV|TV|PlayStation/i.test(navigator.userAgent);
                firstCard.scrollIntoView({ behavior: isTV ? 'auto' : 'smooth', block: 'nearest' });
            }
        }
    };

    const handleGridMouseLeave = useCallback(() => {
        if (window.cineStreamBgTimeoutId) {
            clearTimeout(window.cineStreamBgTimeoutId);
            window.cineStreamBgTimeoutId = null;
        }
        document.body.classList.remove('has-dynamic-bg');
    }, []);

    if (pageType === 'search') {
        const renderSearchContent = () => {
            if (loading) {
                return (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {Array.from({ length: 18 }).map((_, i) => (
                             <div key={i} className="w-full animate-pulse aspect-video bg-[var(--surface)] rounded-lg"></div>
                        ))}
                    </div>
                );
            }
            if (query) {
                if (allResults.length === 0) {
                     return (
                        <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in-up">
                            <i className="text-6xl text-gray-500 fa-solid fa-magnifying-glass"></i>
                            <h3 className="mt-6 text-xl font-bold">{t('noResultsFor', {query: query})}</h3>
                            <p className="mt-2 text-gray-400">{t('tryDifferentKeyword')}</p>
                        </div>
                    );
                }
                return (
                     <div onMouseLeave={handleGridMouseLeave} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {allResults.map((item, index) => <SearchResultCard key={item.id} item={item} index={index} />)}
                    </div>
                )
            }
            
            // Initial view when no query
             return (
                <div className="animate-fade-in space-y-8">
                    <div onMouseLeave={handleGridMouseLeave}>
                        <h2 className="mb-4 text-xl font-bold">{t('topMovies')}</h2>
                        {isInitialLoading ? (
                           <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                                {Array.from({ length: 12 }).map((_, i) => (
                                    <div key={i} className="w-full animate-pulse aspect-video bg-[var(--surface)] rounded-lg"></div>
                                ))}
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                                {initialContent.slice(0, 12).map((item, index) => <SearchResultCard key={item.id} item={item} index={index} />)}
                            </div>
                        )}
                    </div>
                </div>
            );
        };
        
        return (
             <Layout>
                <div className="p-4 pt-24 md:px-10">
                    <div className="relative mb-8">
                        <i className="fa-solid fa-magnifying-glass text-zinc-400 absolute left-5 top-1/2 -translate-y-1/2 text-xl pointer-events-none z-10"></i>
                        <input
                            ref={inputRef}
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleInputKeyDown}
                            placeholder={t('searchPlaceholder')}
                            className="w-full bg-zinc-800 text-white text-lg px-6 py-4 rounded-full border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--primary)] pl-14 transition-colors focusable"
                        />
                    </div>
                    <div ref={resultsContainerRef}>
                      {renderSearchContent()}
                    </div>
                </div>
            </Layout>
        )
    }
    
    const renderContent = () => {
        if (loading) {
            return (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
            );
        }
        if (content.length === 0) {
            const message = t('noItemsFound', { title: title });
            return <p className="mt-8 text-center text-gray-400">{message}</p>;
        }

        return (
            <div onMouseLeave={handleGridMouseLeave} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {content.map((item, index) => {
                    if(pageType === 'downloads') {
                         return (
                            <div key={item.title} className="flex flex-col items-center animate-grid-item" style={{ animationDelay: `${index * 30}ms` }}>
                                <img src={item.poster} alt={item.title} className="w-full rounded-lg" />
                                <p className="mt-2 text-sm text-center">{item.title}</p>
                            </div>
                         );
                    }
                    return <ItemCard 
                                key={item.id} 
                                item={item}
                                index={index}
                           />
                })}
            </div>
        )
    };
    
    return (
        <Layout>
            <div className="p-4 pt-24 md:px-10">
                <h1 className="mb-8 text-4xl md:text-5xl font-bold">{pageType === 'all' && category ? t('allCategory', {category: t(category as any) || category}) : title}</h1>
                {renderContent()}
            </div>
        </Layout>
    );
};

export default GenericPage;
