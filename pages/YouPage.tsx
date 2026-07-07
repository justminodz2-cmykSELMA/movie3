import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '../contexts/ProfileContext';
import { useTranslation } from '../contexts/LanguageContext';
import { HistoryItem, FavoriteItem, DownloadItem, Movie } from '../types';
import Layout from '../components/Layout';
import { fetchFromTMDB } from '../services/apiService';

// FIX: Added formatTime utility function to format duration in seconds.
const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const date = new Date(seconds * 1000);
    const hh = date.getUTCHours();
    const mm = date.getUTCMinutes().toString().padStart(2, '0');
    const ss = date.getUTCSeconds().toString().padStart(2, '0');
    if (hh > 0) return `${hh.toString().padStart(2, '0')}:${mm}:${ss}`;
    return `${mm}:${ss}`;
};

const ProfileHeader: React.FC<{ profile: any; onSearch: () => void; onSettings: () => void }> = ({ profile, onSearch, onSettings }) => {
    const { t } = useTranslation();
    return (
        <header className="flex items-start justify-between">
            <div className="flex items-center gap-4">
                <img src={profile.avatar} alt="Profile Avatar" className="w-16 h-16 rounded-full border-2 border-zinc-700" />
                <div>
                    <h1 className="text-2xl font-bold text-white">{profile.name}</h1>
                    <p className="text-sm text-gray-400">@{profile.name.toLowerCase().replace(/\s/g, '')} • <span className="text-blue-400 cursor-pointer hover:underline">{t('viewChannel')}</span></p>
                </div>
            </div>
            <div className="flex items-center gap-2">
                 <button onClick={onSearch} aria-label={t('search')} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-zinc-700 transition-colors btn-press">
                    <i className="fa-solid fa-magnifying-glass text-lg text-white"></i>
                </button>
                <button onClick={onSettings} aria-label={t('settings')} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-zinc-700 transition-colors btn-press">
                    <i className="fa-solid fa-cog text-lg text-white"></i>
                </button>
            </div>
        </header>
    );
};

const ActionButton: React.FC<{ icon: string; text: string; onClick: () => void; }> = ({ icon, text, onClick }) => {
    return (
        <button onClick={onClick} className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-zinc-800 rounded-full hover:bg-zinc-700 transition-colors btn-press">
            <i className={`${icon} text-white`}></i>
            <span className="text-sm font-semibold text-white">{text}</span>
        </button>
    );
};

const SectionHeader: React.FC<{ title: string; onClick?: () => void }> = ({ title, onClick }) => {
    const { t } = useTranslation();
    return (
        <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">{title}</h2>
            {onClick && (
                <button onClick={onClick} className="px-3 py-1.5 text-sm font-semibold text-blue-400 hover:bg-blue-400/10 rounded-full transition-colors">
                    {t('viewAll')}
                </button>
            )}
        </div>
    );
};

const ResumeCard: React.FC<{ item: HistoryItem }> = ({ item }) => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const progress = (item.currentTime / item.duration) * 100;
    
    const handleResume = (e: React.MouseEvent) => {
        e.stopPropagation();
        const movieItem: Movie = {
          id: item.id,
          title: item.title,
          name: item.title,
          poster_path: null,
          backdrop_path: item.itemImage.replace('https://image.tmdb.org/t/p/w780', ''),
          overview: '',
          vote_average: 0,
          vote_count: 0
        };
        navigate('/player', { 
            state: { 
                item: movieItem,
                type: item.type,
                currentTime: item.currentTime,
                season: item.seasonNumber,
                episode: item.episodeId ? { id: item.episodeId, episode_number: item.episodeNumber } : null
            } 
        });
    };

    const handleDetails = () => {
        navigate(`/details/${item.type}/${item.id}`);
    }

    return (
        <div onClick={handleDetails} className="relative w-full overflow-hidden cursor-pointer group rounded-xl bg-zinc-800 shadow-xl interactive-card">
            <img src={item.itemImage} alt={item.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent"></div>
            <div className="absolute inset-0 p-4 flex flex-col justify-end">
                <p className="text-sm font-bold text-red-400 drop-shadow">{t('continueWatching')}</p>
                <h3 className="text-xl font-bold text-white drop-shadow-lg mt-1">{item.title}</h3>
                <div className="w-full h-1 mt-3 bg-white/20 rounded-full overflow-hidden">
                    <div className="h-full bg-red-600" style={{ width: `${progress}%` }}></div>
                </div>
                <div className="mt-4 flex items-center gap-3">
                    <button onClick={handleResume} className="px-5 py-2 text-sm font-bold text-black bg-white rounded-full flex items-center gap-2 btn-press">
                        <i className="fa-solid fa-play"></i>
                        <span>{t('resume')}</span>
                    </button>
                    <button onClick={handleDetails} className="w-10 h-10 text-white bg-white/20 rounded-full flex items-center justify-center transition-colors hover:bg-white/30 btn-press">
                        <i className="fa-solid fa-circle-info"></i>
                    </button>
                </div>
            </div>
        </div>
    );
};


const HistoryCard: React.FC<{ item: HistoryItem, index: number }> = ({ item, index }) => {
    const navigate = useNavigate();
    const handleClick = () => navigate(`/details/${item.type}/${item.id}`);
    const progress = (item.currentTime / item.duration) * 100;

    const views = (Math.random() * 100).toFixed(0) + 'K';
    const timeAgo = `${index + 2} hour${index > 0 ? 's' : ''} ago`;

    const handleGlow = useCallback(() => {
        // Perf: dead work removed — this used to write an unused
        // --dynamic-bg-image variable onto <body> (no CSS ever read it),
        // forcing a full-page style recalculation on every card focus/hover.
    }, []);

    return (
        <div 
            onClick={handleClick} 
            className="flex items-start gap-4 p-2 rounded-lg cursor-pointer group animate-fade-in-up transition-colors hover:bg-white/5 focusable glow-card-container"
            style={{ '--glow-image-url': item.itemImage ? `url(${item.itemImage.replace('w780', 'w500')})` : 'none', animationDelay: `${index * 40}ms` } as React.CSSProperties}
            onMouseEnter={handleGlow}
            onFocus={handleGlow}
            tabIndex={0}
            // FIX: The type of `item.type` can only be 'movie' or 'tv', so this comparison was always false.
            data-is-live="false"
        >
            <div className="relative w-40 flex-shrink-0 overflow-hidden rounded-lg shadow-lg aspect-video interactive-card">
                <img src={item.itemImage} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                <div className="absolute bottom-1 right-1 px-1.5 py-0.5 text-xs font-bold text-white bg-black/60 rounded-sm">{formatTime(item.duration)}</div>
                <div className="absolute bottom-0 left-0 w-full h-1 bg-white/30">
                    <div className="h-full bg-red-600" style={{ width: `${progress}%` }}></div>
                </div>
            </div>
            <div className="pt-1 flex-1">
                <h3 className="text-sm font-semibold text-white line-clamp-2 leading-tight">{item.title}</h3>
                <div className="flex items-center gap-2 text-xs text-gray-400 mt-1.5">
                    <span>{views} views</span>
                    <span>•</span>
                    <span>{timeAgo}</span>
                </div>
            </div>
        </div>
    );
};

export const YouPage: React.FC = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { activeProfile, getScreenSpecificData } = useProfile();
    const [history, setHistory] = useState<HistoryItem[]>([]);
    
    useEffect(() => {
        if (activeProfile) {
            setHistory(getScreenSpecificData('history', []));
        }
    }, [activeProfile, getScreenSpecificData]);

    const handleMouseLeaveList = useCallback(() => {
        if (window.cineStreamBgTimeoutId) {
            clearTimeout(window.cineStreamBgTimeoutId);
            window.cineStreamBgTimeoutId = null;
        }
    }, []);

    if (!activeProfile) {
        return (
            <Layout>
                <div className="flex items-center justify-center h-screen">
                    <div className="w-16 h-16 border-4 border-t-transparent border-[var(--primary)] rounded-full animate-spin"></div>
                </div>
            </Layout>
        );
    }
    
    const latestHistoryItem = history[0];
    const otherHistoryItems = history.slice(1, 5);

    return (
        <Layout>
            <div className="pt-24 px-4 space-y-8">
                <ProfileHeader 
                    profile={activeProfile} 
                    onSearch={() => navigate('/search')} 
                    onSettings={() => navigate('/settings')} 
                />
                <div className="grid grid-cols-3 gap-2">
                    <ActionButton icon="fa-solid fa-clock-rotate-left" text={t('history')} onClick={() => {}} />
                    <ActionButton icon="fa-solid fa-list" text={t('playlists')} onClick={() => {}} />
                    <ActionButton icon="fa-solid fa-thumbs-up" text={t('likedVideos')} onClick={() => {}} />
                </div>
                
                {latestHistoryItem && (
                    <section className="space-y-4">
                        <SectionHeader title={t('continueWatching')} />
                        <ResumeCard item={latestHistoryItem} />
                    </section>
                )}
                
                {otherHistoryItems.length > 0 && (
                     <section className="space-y-4" onMouseLeave={handleMouseLeaveList}>
                        <SectionHeader title={t('history')} onClick={() => {}} />
                        {otherHistoryItems.map((item, index) => (
                            <HistoryCard key={item.timestamp} item={item} index={index}/>
                        ))}
                    </section>
                )}
            </div>
        </Layout>
    );
};

// FIX: Add default export to be consumable by other modules.
export default YouPage;