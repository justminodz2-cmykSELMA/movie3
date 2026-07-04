import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchFromTMDB } from '../services/apiService';
import { Actor, Movie } from '../types';
import { useProfile } from '../contexts/ProfileContext';
import { useTranslation } from '../contexts/LanguageContext';
import Layout from '../components/Layout';
import { IMAGE_BASE_URL, BACKDROP_SIZE, BACKDROP_SIZE_MEDIUM, POSTER_SIZE } from '../contexts/constants';

const formatCount = (num: number | undefined) => {
    if (num === undefined) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(0) + 'K';
    return num.toString();
};

const FilmographyListItem: React.FC<{ item: Movie, index: number }> = ({ item, index }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const type = item.media_type || (item.title ? 'movie' : 'tv');
  
  const handleClick = () => {
    navigate(`/details/${type}/${item.id}`);
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

  if (!item.backdrop_path) return null;

  return (
    <div
      onClick={handleClick}
      onMouseEnter={handleGlow}
      onFocus={handleGlow}
      className="flex items-start gap-4 cursor-pointer group animate-fade-in-up p-2 rounded-lg transition-colors duration-200 hover:bg-white/5 glow-card-container focusable"
      style={{ '--glow-image-url': item.backdrop_path ? `url(${IMAGE_BASE_URL}w500${item.backdrop_path})` : 'none', animationDelay: `${index * 40}ms` } as React.CSSProperties}
      tabIndex={0}
    >
      <div className="relative flex-shrink-0 w-40 md:w-48 overflow-hidden rounded-lg shadow-md">
        <img
          src={`${IMAGE_BASE_URL}${BACKDROP_SIZE_MEDIUM}${item.backdrop_path}`}
          alt={item.title || item.name}
          className="object-cover w-full aspect-video transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
            decoding="async"
        />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            <i className="fa-solid fa-play text-white text-3xl"></i>
        </div>
      </div>
      <div className="pt-1 flex-1">
        <h3 className="text-sm font-bold text-white line-clamp-2 leading-tight">{item.title || item.name}</h3>
        <div className="flex items-center gap-3 text-xs text-gray-400 mt-1.5">
            <span className="flex items-center gap-1"><i className="fa-solid fa-star text-yellow-400 text-[10px]"></i> {item.vote_average.toFixed(1)}</span>
            <span>{item.release_date?.substring(0, 4) || item.first_air_date?.substring(0, 4)}</span>
            <span className="uppercase font-semibold border border-white/20 px-1.5 py-0.5 rounded text-[9px]">{t(type === 'tv' ? 'series' : 'movie')}</span>
        </div>
      </div>
       <button onClick={(e) => {e.stopPropagation(); /* TODO: Implement more options menu */}} className="text-gray-500 hover:text-white mt-1 p-2 -m-2">
            <i className="fa-solid fa-ellipsis-vertical"></i>
       </button>
    </div>
  );
};


const ActorDetailsPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { isFollowingActor, toggleFollowActor, setToast } = useProfile();
    const [actor, setActor] = useState<Actor | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'home' | 'filmography' | 'about'>('home');

    useEffect(() => {
        const fetchActorDetails = async () => {
            if (!id) return;
            setLoading(true);
            try {
                const data = await fetchFromTMDB(`/person/${id}`, {
                    append_to_response: 'combined_credits,images',
                });
                const likes = Math.floor(data.popularity * 1000) + Math.floor(Math.random() * 5000);
                setActor({...data, likes: likes});
            } catch (error) {
                console.error("Failed to fetch actor details", error);
                setToast({ message: t('failedToLoadDetails'), type: 'error' });
                navigate('/home');
            } finally {
                setLoading(false);
            }
        };
        window.scrollTo(0, 0);
        fetchActorDetails();
    }, [id, navigate, setToast, t]);

    const handleJoin = () => {
        setToast({ message: t('thankYouForFeedback'), type: 'success' });
    };

    const handleMouseLeaveList = useCallback(() => {
        if (window.cineStreamBgTimeoutId) {
            clearTimeout(window.cineStreamBgTimeoutId);
            window.cineStreamBgTimeoutId = null;
        }
        document.body.classList.remove('has-dynamic-bg');
    }, []);

    if (loading || !actor) {
        return (
            <div className="bg-transparent">
                <Layout>
                    <div className="w-full h-40 md:h-52 bg-[var(--surface)] animate-pulse"></div>
                    <div className="relative pt-28 md:pt-36">
                        <div className="px-4">
                            <div className="flex flex-col sm:flex-row items-start gap-5">
                                <div className="w-24 h-24 md:w-28 md:h-28 rounded-full bg-[var(--surface)] animate-pulse flex-shrink-0 border-4 border-[var(--background)]"></div>
                                <div className="flex-1 space-y-3 pt-4 w-full">
                                    <div className="w-3/4 h-8 rounded-lg bg-[var(--surface)] animate-pulse"></div>
                                    <div className="w-1/2 h-5 rounded-lg bg-[var(--surface)] animate-pulse"></div>
                                </div>
                            </div>
                            <div className="space-y-2 mt-4">
                                <div className="w-full h-4 rounded-lg bg-[var(--surface)] animate-pulse"></div>
                                <div className="w-5/6 h-4 rounded-lg bg-[var(--surface)] animate-pulse"></div>
                            </div>
                            <div className="flex gap-3 mt-5">
                                <div className="flex-1 h-12 rounded-full bg-[var(--surface)] animate-pulse"></div>
                                <div className="flex-1 h-12 rounded-full bg-[var(--surface)] animate-pulse"></div>
                            </div>
                        </div>
                        <div className="border-b border-white/10 mt-6">
                            <div className="px-4 flex items-center justify-start gap-x-8">
                                <div className="w-16 h-10 bg-transparent"></div>
                                <div className="w-24 h-10 bg-transparent"></div>
                                <div className="w-20 h-10 bg-transparent"></div>
                            </div>
                        </div>
                        <div className="p-4 space-y-4">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="flex items-start gap-4 animate-pulse">
                                    <div className="w-40 md:w-48 h-24 md:h-28 rounded-lg bg-[var(--surface)]"></div>
                                    <div className="flex-1 space-y-2 pt-1">
                                        <div className="w-full h-4 rounded-lg bg-[var(--surface)]"></div>
                                        <div className="w-3/4 h-4 rounded-lg bg-[var(--surface)]"></div>
                                        <div className="w-1/2 h-3 rounded-lg bg-[var(--surface)]"></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </Layout>
            </div>
        );
    }

    const filmography = actor.combined_credits?.cast
        ?.filter(item => (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path && item.backdrop_path)
        .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0)) ?? [];
    
    const bannerImage = filmography[0]?.backdrop_path ?? actor.combined_credits?.cast.find(c => c.backdrop_path)?.backdrop_path;
    const isFollowing = isFollowingActor(actor.id);
    const featuredContent = filmography[0];

    const renderTabs = () => {
        const tabs = [
            { id: 'home', label: t('home') },
            { id: 'filmography', label: t('filmography') },
            { id: 'about', label: t('aboutActor') },
        ];
        return (
            <div className="border-b border-white/10 mt-6 animate-fade-in-up" style={{ animationDelay: '500ms' }}>
                <div className="px-4 flex items-center justify-start gap-x-6 md:gap-x-8">
                    {tabs.map(tab => (
                        <button 
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`relative py-3 text-base font-semibold transition-colors duration-200 ${activeTab === tab.id ? 'text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            {tab.label}
                            {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-1 bg-white rounded-full"></div>}
                        </button>
                    ))}
                </div>
            </div>
        )
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'home':
                return (
                    <div className="p-4 space-y-8 animate-fade-in" style={{ animationDelay: '600ms' }}>
                        {featuredContent && (
                            <section>
                                <h2 className="text-lg font-bold text-white mb-3">{t('forYou')}</h2>
                                <div onClick={() => navigate(`/details/${featuredContent.media_type}/${featuredContent.id}`)} className="cursor-pointer group">
                                    <div className="relative aspect-video rounded-xl overflow-hidden shadow-lg interactive-card">
                                        <img src={`${IMAGE_BASE_URL}${BACKDROP_SIZE}${featuredContent.backdrop_path}`} alt={featuredContent.title || featuredContent.name} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
                                        <div className="absolute bottom-0 left-0 p-4">
                                            <h3 className="text-xl font-bold text-white">{featuredContent.title || featuredContent.name}</h3>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        )}
                        <section className="space-y-4" onMouseLeave={handleMouseLeaveList}>
                            <h3 className="text-lg font-bold text-white">{t('filmography')}</h3>
                            {filmography.slice(1, 11).map((item, index) => (
                                <FilmographyListItem key={item.id} item={item} index={index + 1} />
                            ))}
                        </section>
                    </div>
                );
            case 'filmography':
                return (
                    <div className="p-4 animate-fade-in" style={{ animationDelay: '600ms' }}>
                        <h2 className="text-xl font-bold text-white mb-4">{t('actorFilmography', {name: actor.name})}</h2>
                        <div className="space-y-4" onMouseLeave={handleMouseLeaveList}>
                            {filmography.map((item, index) => (
                                <FilmographyListItem key={item.id} item={item} index={index} />
                            ))}
                        </div>
                    </div>
                );
            case 'about':
                return (
                     <div className="p-4 space-y-6 animate-fade-in" style={{ animationDelay: '600ms' }}>
                        <div className="p-5 bg-[var(--surface)] rounded-2xl animate-fade-in-up" style={{ animationDelay: '650ms' }}>
                            <h3 className="text-lg font-bold mb-3 text-white">{t('biography')}</h3>
                            <p className="text-sm text-gray-300 whitespace-pre-line leading-relaxed">
                                {actor.biography || t('noBiography')}
                            </p>
                        </div>
                        <div className="p-5 bg-[var(--surface)] rounded-2xl animate-fade-in-up" style={{ animationDelay: '750ms' }}>
                            <h3 className="text-lg font-bold mb-3 text-white">{t('details')}</h3>
                             <dl className="text-sm space-y-4">
                                <div className="flex flex-col">
                                    <dt className="font-semibold text-gray-400">{t('born')}</dt>
                                    <dd className="text-white">{actor.birthday || 'N/A'}</dd>
                                </div>
                                <div className="flex flex-col">
                                    <dt className="font-semibold text-gray-400">{t('place_of_birth')}</dt>
                                    <dd className="text-white">{actor.place_of_birth || 'N/A'}</dd>
                                </div>
                                <div className="flex flex-col">
                                    <dt className="font-semibold text-gray-400">{t('known_for_department')}</dt>
                                    <dd className="text-white">{actor.known_for_department}</dd>
                                </div>
                            </dl>
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="bg-transparent">
            <Layout>
                <div className="absolute top-0 left-0 right-0 h-40 md:h-52">
                     {bannerImage && (
                        <img src={`${IMAGE_BASE_URL}${BACKDROP_SIZE}${bannerImage}`} className="w-full h-full object-cover" alt="banner" />
                     )}
                     <div className="absolute inset-0 bg-gradient-to-t from-[var(--background)] via-[var(--background)]/80 to-transparent"></div>
                </div>

                <div className="relative pt-28 md:pt-36">
                    <div className="px-4">
                        <div className="flex flex-col sm:flex-row items-start gap-5">
                            {actor.profile_path && (
                                <div className="animate-fade-in-up" style={{ animationDelay: '100ms' }}>
                                    <img
                                        src={`${IMAGE_BASE_URL}${POSTER_SIZE}${actor.profile_path}`}
                                        alt={actor.name}
                                        className="w-24 h-24 md:w-28 md:h-28 object-cover rounded-full flex-shrink-0 border-4 border-[var(--background)] shadow-lg"
                                    />
                                </div>
                            )}
                            <div className="flex-1 pt-2">
                                <div className="animate-fade-in-up" style={{ animationDelay: '200ms' }}>
                                    <h1 className="text-3xl md:text-4xl font-extrabold" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.5)' }}>{actor.name}</h1>
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-gray-400">
                                        <span>@{actor.name.replace(/\s+/g, '').toLowerCase()}</span>
                                        <span className="flex items-center gap-1.5"><i className="fa-solid fa-thumbs-up text-xs"></i> {formatCount(actor.likes)} {t('likes')}</span>
                                        <span className="flex items-center gap-1.5"><i className="fa-solid fa-film text-xs"></i> {filmography.length} {t('movies')}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <p className="text-sm text-gray-300 mt-4 line-clamp-2 animate-fade-in-up" style={{ animationDelay: '300ms' }}>
                            {actor.biography ? actor.biography : t('known_for_department') + ': ' + actor.known_for_department}
                        </p>

                        <div className="flex items-center gap-3 mt-5 animate-fade-in-up" style={{ animationDelay: '400ms' }}>
                            <button
                                onClick={() => toggleFollowActor(actor.id)}
                                className={`flex-1 py-3 rounded-full text-sm font-bold transition-all duration-300 flex items-center justify-center gap-2 btn-press ${isFollowing ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-white text-black hover:bg-gray-200'}`}
                            >
                                {isFollowing && <i className="fa-solid fa-check"></i>}
                                {isFollowing ? t('following') : t('follow')}
                            </button>
                            <button onClick={handleJoin} className="flex-1 py-3 rounded-full bg-white/10 text-white text-sm font-bold transition-colors hover:bg-white/20 btn-press">{t('join')}</button>
                        </div>
                    </div>
                    
                    {renderTabs()}
                    {renderContent()}
                </div>
            </Layout>
        </div>
    );
};

export default ActorDetailsPage;
