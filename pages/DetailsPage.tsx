import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchFromTMDB, fetchStreamUrl } from '../services/apiService';
import { Movie, Episode, Season } from '../types';
import { useProfile } from '../contexts/ProfileContext';
import { useTranslation } from '../contexts/LanguageContext';
import Layout from '../components/Layout';
import { IMAGE_BASE_URL, BACKDROP_SIZE, BACKDROP_SIZE_MEDIUM, POSTER_SIZE } from '../contexts/constants';
import { CustomSelect } from '../components/common';

const SimilarItemCard: React.FC<{ item: Movie, index: number }> = ({ item, index }) => {
  const navigate = useNavigate();
  const type = item.media_type || (item.title ? 'movie' : 'tv');
  
  const handleClick = () => {
    navigate(`/details/${type}/${item.id}`);
  };

  const handleGlow = useCallback(() => {
    if (item.poster_path) {
        const imageUrl = `${IMAGE_BASE_URL}w342${item.poster_path}`;
        document.body.style.setProperty('--dynamic-bg-image', `url(${imageUrl})`);
        document.body.classList.add('has-dynamic-bg');
    }
  }, [item.poster_path]);

  if (!item.poster_path) return null;

  return (
    <div
      onClick={handleClick}
      onMouseEnter={handleGlow}
      onFocus={handleGlow}
      className="flex-shrink-0 w-32 cursor-pointer animate-fade-in-up interactive-card-sm glow-card-container focusable"
      style={{ '--glow-image-url': `url(${IMAGE_BASE_URL}w342${item.poster_path})`, animationDelay: `${index * 50}ms` } as React.CSSProperties}
      tabIndex={0}
    >
      <div className="relative overflow-hidden transition-all duration-300 ease-in-out transform rounded-lg shadow-lg bg-[var(--surface)] border-2 border-transparent">
        <img
          src={`${IMAGE_BASE_URL}w342${item.poster_path}`}
          srcSet={`${IMAGE_BASE_URL}w185${item.poster_path} 185w, ${IMAGE_BASE_URL}w342${item.poster_path} 342w`}
          sizes="128px"
          alt={item.title || item.name}
          className="object-cover w-full aspect-[3/4]"
          loading="lazy"
            decoding="async"
        />
      </div>
      <div className="pt-2 text-center">
        <h3 className="text-xs font-semibold text-white truncate">{item.title || item.name}</h3>
      </div>
    </div>
  );
};


const DetailsPage: React.FC = () => {
  const { type, id } = useParams<{ type: 'movie' | 'tv', id: string }>();
  const navigate = useNavigate();
  const { isFavorite, toggleFavorite, setToast } = useProfile();
  const { t, language } = useTranslation();
  const [item, setItem] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'episodes' | 'similar' | 'about'>('episodes');
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [isOverviewExpanded, setOverviewExpanded] = useState(false);
  const [prefetchedStreamUrl, setPrefetchedStreamUrl] = useState<string | null>(null);
  const playButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!loading && item) {
      const timer = setTimeout(() => {
        playButtonRef.current?.focus({ preventScroll: true });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [loading, item]);
  
  useEffect(() => {
    const fetchDetails = async () => {
      if (!type || !id) return;
      setLoading(true);
      setPrefetchedStreamUrl(null); // Reset on item change
      try {
        const data = await fetchFromTMDB(`/${type}/${id}`, {
          append_to_response: 'videos,credits,recommendations,content_ratings',
        });
        setItem(data);
        if (type === 'tv' && data.seasons && data.seasons.length > 0) {
          const firstValidSeason = data.seasons.find((s: Season) => s.season_number > 0 && s.episode_count > 0);
          if (firstValidSeason) {
            setActiveTab('episodes');
            setSelectedSeason(firstValidSeason.season_number);
            fetchEpisodes(id, firstValidSeason.season_number);
          } else {
             setActiveTab(data.recommendations?.results?.length > 0 ? 'similar' : 'about');
          }
        } else {
            setActiveTab(data.recommendations?.results?.length > 0 ? 'similar' : 'about');
        }
      } catch (error) {
        console.error("Failed to fetch details", error);
        setToast({ message: t('failedToLoadDetails'), type: 'error' });
        navigate('/home');
      } finally {
        setLoading(false);
      }
    };
    window.scrollTo(0, 0);
    fetchDetails();
  }, [type, id, navigate, setToast, t]);

  useEffect(() => {
    const prefetchStream = async () => {
        if (item && type) {
            try {
                // Determine the first episode to prefetch for TV shows
                const seasonToFetch = type === 'tv' ? (item.seasons?.find(s => s.season_number > 0 && s.episode_count > 0)?.season_number ?? 1) : undefined;
                const episodeToFetch = type === 'tv' ? 1 : undefined;

                // Only prefetch from the default/fastest provider to avoid unnecessary network requests
                const data = await fetchStreamUrl(item, type, seasonToFetch, episodeToFetch, 'veloratv');
                if (data.links && data.links.length > 0) {
                    setPrefetchedStreamUrl(data.links[0].url);
                    console.log("Stream prefetched successfully.");
                }
            } catch (error) {
                console.log("Stream prefetching failed (this is a non-critical background task):", error);
            }
        }
    };
    if (item) {
       prefetchStream();
    }
}, [item, type]);

  const fetchEpisodes = async (tvId: string, seasonNumber: number) => {
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
    navigate('/player', { state: { item, type, season: selectedSeason, episode: null, streamUrl: prefetchedStreamUrl } });
  };
  
  const handleEpisodePlay = (episode: Episode) => {
     navigate('/player', { state: { item, type, season: selectedSeason, episode, streamUrl: prefetchedStreamUrl } });
  }

  const handleMouseLeaveList = useCallback(() => {
    document.body.classList.remove('has-dynamic-bg');
  }, []);

  const seasonOptions = useMemo(() => {
    if (!item?.seasons) return [];
    return item.seasons
        .filter(s => s.season_number > 0 && s.episode_count > 0)
        .map(season => ({
            value: String(season.season_number),
            label: `${t('season')} ${season.season_number} (${t('episodeCount', {count: season.episode_count})})`
        }));
  }, [item?.seasons, t]);

  if (loading || !item) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-16 h-16 border-4 border-t-transparent border-[var(--primary)] rounded-full animate-spin"></div>
        </div>
      </Layout>
    );
  }
  
  const isFav = isFavorite(item.id);

  const renderTabs = () => {
      const tabs = [];
      if (type === 'tv' && item.seasons && item.seasons.filter(s => s.season_number > 0 && s.episode_count > 0).length > 0) {
          tabs.push({ id: 'episodes', label: t('episodes') });
      }
      if (item.recommendations?.results?.length ?? 0 > 0) {
          tabs.push({ id: 'similar', label: t('similar') });
      }
      tabs.push({ id: 'about', label: t('about') });

      if (tabs.length <= 1) return null;

      return (
        <div className="sticky top-16 z-20 bg-[var(--background)]/80 backdrop-blur-lg border-b border-[var(--border)] animate-fade-in-up" style={{ animationDelay: '600ms' }}>
          <div className="px-4 flex items-center justify-center gap-x-8">
              {tabs.map(tab => (
                  <button 
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      onKeyDown={(e) => e.key === 'Enter' && setActiveTab(tab.id as any)}
                      className={`relative py-3 text-sm font-bold transition-colors duration-300 focusable ${activeTab === tab.id ? 'text-[var(--primary)]' : 'text-gray-400'}`}
                      tabIndex={0}
                  >
                      {tab.label}
                      {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-1 bg-[var(--primary)] rounded-full"></div>}
                  </button>
              ))}
          </div>
      </div>
      )
  }

  const getRating = () => {
      const ratingObj = item.content_ratings?.results.find(r => r.iso_3166_1 === 'US');
      return ratingObj?.rating || null;
  }

  return (
    <Layout>
      <div className="relative w-full h-[50vh] min-h-[300px] md:h-[60vh]">
        <div className="absolute top-20 start-4 z-20 animate-fade-in" style={{animationDelay: '0.5s'}}>
            <button onClick={() => navigate(-1)} className="w-10 h-10 text-white bg-black/50 rounded-full backdrop-blur-sm transition-transform btn-press focusable" tabIndex={0}><i className="fa-solid fa-arrow-left"></i></button>
        </div>
        <img
          src={`${IMAGE_BASE_URL}${BACKDROP_SIZE}${item.backdrop_path}`}
          srcSet={`${IMAGE_BASE_URL}${BACKDROP_SIZE_MEDIUM}${item.backdrop_path} 780w, ${IMAGE_BASE_URL}${BACKDROP_SIZE}${item.backdrop_path} 1280w`}
          sizes="100vw"
          alt={item.title || item.name}
          className="absolute inset-0 object-cover object-top w-full h-full"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--background)] via-[var(--background)]/80 to-transparent"></div>
        <div className={`absolute inset-0 ${language === 'ar' ? 'bg-gradient-to-r' : 'bg-gradient-to-l'} from-[var(--background)] to-transparent opacity-60`}></div>
        
      </div>
      
      <div className="relative z-10 p-4 -mt-32 md:-mt-40">
        <div className="flex flex-col sm:flex-row items-start gap-4 md:gap-8">
            <div className="flex-shrink-0 w-28 sm:w-36 md:w-48 lg:w-52 animate-fade-in-up" style={{animationDelay: '100ms'}}>
                <img src={`${IMAGE_BASE_URL}${POSTER_SIZE}${item.poster_path}`} 
                     srcSet={`${IMAGE_BASE_URL}w185${item.poster_path} 185w, ${IMAGE_BASE_URL}w342${item.poster_path} 342w, ${IMAGE_BASE_URL}${POSTER_SIZE}${item.poster_path} 500w`}
                     sizes="(max-width: 639px) 112px, (max-width: 767px) 144px, (max-width: 1023px) 192px, 208px"
                     className="w-full rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] border-2 border-[var(--border)]" alt="poster"/>
            </div>
            <div className="flex-1 min-w-0 pt-16 sm:pt-24 md:pt-32">
                <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold drop-shadow-lg text-white animate-fade-in-up" style={{animationDelay: '200ms'}}>{item.title || item.name}</h1>
                <div className="flex flex-wrap items-center justify-start gap-x-3 gap-y-1 mt-2 text-xs sm:text-sm text-gray-300 animate-fade-in-up" style={{animationDelay: '300ms'}}>
                    <span className="flex items-center gap-1.5"><i className="text-yellow-400 fa-solid fa-star"></i>{item.vote_average.toFixed(1)}</span>
                    <span>{item.release_date?.substring(0, 4) || item.first_air_date?.substring(0, 4)}</span>
                    {item.runtime && <span>{Math.floor(item.runtime/60)}{t('hoursShort')} {item.runtime%60}{t('minutesShort')}</span>}
                    {type === 'tv' && item.number_of_seasons && <span>{item.number_of_seasons} {t('seasons')}</span>}
                    {getRating() && <span className='px-2 py-0.5 border border-white/50 text-xs rounded'>{getRating()}</span>}
                </div>
            </div>
        </div>

        <div className="animate-fade-in-up" style={{animationDelay: '400ms'}}>
            <div className="flex gap-3 my-4">
                <button ref={playButtonRef} onClick={handlePlay} className="flex-1 py-3 font-bold text-black bg-[var(--text-light)] rounded-lg transition-transform shadow-lg flex items-center justify-center gap-2 btn-press focusable" tabIndex={0}>
                  <i className="fa-solid fa-play"></i>
                  <span>{type === 'movie' ? t('play') : t('playSeason')}</span>
                </button>
                <button onClick={() => toggleFavorite(item)} className={`w-28 h-12 rounded-lg transition-all duration-300 shadow-lg text-xs font-bold flex flex-col items-center justify-center btn-press focusable ${isFav ? 'bg-[var(--secondary)] text-white' : 'bg-[var(--surface)] text-[var(--text-light)]'}`} tabIndex={0}>
                  <i className={`fa-solid ${isFav ? 'fa-check' : 'fa-plus'} text-base`}></i>
                  <span className='mt-1'>{isFav ? t('addedToList') : t('addToList')}</span>
                </button>
            </div>
        </div>
        
        <div className="p-4 rounded-xl bg-[var(--surface)] animate-fade-in-up" style={{animationDelay: '500ms'}}>
            <p 
                onClick={() => setOverviewExpanded(!isOverviewExpanded)} 
                onKeyDown={(e) => e.key === 'Enter' && setOverviewExpanded(!isOverviewExpanded)}
                className={`text-sm text-[var(--text-dark)] cursor-pointer transition-all duration-300 focusable ${!isOverviewExpanded ? 'line-clamp-3' : ''}`}
                tabIndex={0}
            >
                {item.overview}
            </p>
            <div className="pt-3 mt-3 border-t border-[var(--border)] text-sm">
                <p><strong className="text-white">{t('genres')}:</strong> <span className="text-gray-400">{item.genres?.map(g => g.name).join(', ')}</span></p>
                {item.credits?.cast && item.credits.cast.length > 0 && (
                    <p className="mt-2"><strong className="text-white">{t('cast')}:</strong> <span className="text-gray-400">{item.credits.cast.slice(0, 10).map(c => c.name).join(', ')}...</span></p>
                )}
            </div>
        </div>
      </div>
      
      {renderTabs()}

      <div className="p-4 min-h-[300px] animate-fade-in" style={{animationDelay: '700ms'}}>
        {activeTab === 'episodes' && type === 'tv' && (
          <div>
            <div className="relative mb-4">
                 <CustomSelect
                    value={String(selectedSeason)}
                    onChange={(value) => {
                        if (value && id) {
                            fetchEpisodes(id, parseInt(value, 10));
                        }
                    }}
                    options={seasonOptions}
                    placeholder={t('season')}
                    className="w-full"
                />
            </div>
            <div className="flex flex-col gap-3">
              {episodes.map((episode, index) => (
                <div 
                  key={episode.id} 
                  className="flex items-center gap-4 p-2 rounded-lg cursor-pointer bg-[var(--surface)] transition-colors hover:bg-[var(--surface)]/50 animate-fade-in-up focusable" 
                  style={{ animationDelay: `${index * 40}ms` }} 
                  onClick={() => handleEpisodePlay(episode)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleEpisodePlay(episode); }}
                  tabIndex={0}
                >
                  <div className="relative flex-shrink-0 w-32 h-20 overflow-hidden rounded-md">
                     <img src={episode.still_path ? `${IMAGE_BASE_URL}w300${episode.still_path}` : `${IMAGE_BASE_URL}${BACKDROP_SIZE_MEDIUM}${item.backdrop_path}`} 
                          srcSet={episode.still_path ? `${IMAGE_BASE_URL}w185${episode.still_path} 185w, ${IMAGE_BASE_URL}w300${episode.still_path} 300w` : undefined}
                          sizes="128px"
                          alt={episode.name} className="object-cover w-full h-full" />
                     <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-300 bg-black/50 opacity-0 group-hover:opacity-100">
                         <i className="text-2xl text-white fa-solid fa-play"></i>
                     </div>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm">{episode.episode_number}. {episode.name}</h4>
                    <p className="text-xs text-gray-400 line-clamp-2 mt-1">{episode.overview}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {activeTab === 'similar' && item.recommendations?.results && item.recommendations.results.length > 0 && (
          <div>
            <h3 className="text-xl font-bold text-white mb-4">{t('similar')}</h3>
            <div onMouseLeave={handleMouseLeaveList} className="flex pb-4 -mx-4 overflow-x-auto no-scrollbar sm:mx-0">
                <div className="flex flex-nowrap gap-x-4 px-4">
                    {item.recommendations.results.map((movie, index) => <SimilarItemCard key={movie.id} item={movie} index={index} />)}
                </div>
            </div>
          </div>
        )}
        {activeTab === 'about' && (
           <div className="space-y-4">
                <div className="p-4 bg-[var(--surface)] rounded-xl">
                    <h3 className="font-bold text-white mb-3 text-lg">{t('details')}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm text-gray-300">
                        <div><strong>{t('originalTitle')}:</strong> <span className='text-gray-400'>{item.original_title || item.original_name}</span></div>
                        <div><strong>{t('status')}:</strong> <span className='text-gray-400'>{item.status}</span></div>
                        <div><strong>{t('releaseDate')}:</strong> <span className='text-gray-400'>{item.release_date || item.first_air_date}</span></div>
                        {type === 'tv' && <div><strong>{t('episodeCountLabel')}:</strong> <span className='text-gray-400'>{item.number_of_episodes}</span></div>}
                    </div>
                </div>
                {item.production_companies && item.production_companies.length > 0 &&
                  <div className='p-4 bg-[var(--surface)] rounded-xl'>
                    <h3 className="font-bold text-white mb-3 text-lg">{t('productionCompanies')}</h3>
                    <p className='text-gray-400 text-sm'>{item.production_companies?.map(c => c.name).join(', ')}</p>
                  </div>
                }
           </div>
        )}
      </div>
    </Layout>
  );
};

export default DetailsPage;
