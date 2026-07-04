import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import VideoPlayer from '../components/Player';
import { Movie, Episode, Season, HistoryItem } from '../types';
import { fetchFromTMDB } from '../services/apiService';
import { useProfile } from '../contexts/ProfileContext';
import { useTranslation } from '../contexts/LanguageContext';
import { usePlayer, PipData } from '../contexts/PlayerContext';
import { IMAGE_BASE_URL, BACKDROP_SIZE_MEDIUM } from '../contexts/constants';
import { setPlayerActive } from '../services/playerActivity';
import { GoogleGenAI, Type } from "@google/genai";

interface ScheduledItem {
    title: string;
    duration: number; // in minutes
    reason: string;
    type: 'movie' | 'tv';
}

interface Schedule {
    items: ScheduledItem[];
}

const scheduleSchema = {
    type: Type.OBJECT,
    properties: {
        items: {
            type: Type.ARRAY,
            description: "A list of scheduled items for the day.",
            items: {
                type: Type.OBJECT,
                properties: {
                    title: {
                        type: Type.STRING,
                        description: "The exact title of the movie or TV show.",
                    },
                    duration: {
                        type: Type.NUMBER,
                        description: "The duration in minutes for this block. For a TV show, this is the total time for multiple episodes. For a movie, it's just the movie's length.",
                    },
                    reason: {
                        type: Type.STRING,
                        description: "A fun, kid-friendly reason why this show is being aired now. e.g., 'Time for some adventure!'",
                    },
                    type: {
                        type: Type.STRING,
                        description: "The type of content. Must be either 'movie' or 'tv'.",
                    },
                },
                required: ["title", "duration", "reason", "type"],
            },
        },
    },
    required: ["items"],
};


const PlayerPage: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { item: initialItem, type, season: initialSeason, episode: initialEpisode, currentTime: initialCurrentTime, streamUrl, liveChannels, currentChannelIndex, logo, needsProxy, hideLogo } = location.state || {};
    const { setToast, updateHistory, getScreenSpecificData, isKidsMode } = useProfile();
    const { t } = useTranslation();
    const { setPipData, setPipAnchor } = usePlayer();

    const [item, setItem] = useState<Movie | null>(initialItem);
    const [currentSeason, setCurrentSeason] = useState<number | undefined>(initialSeason);
    const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(initialEpisode);
    const [currentTime, setCurrentTime] = useState<number>(initialCurrentTime || 0);
    const [episodes, setEpisodes] = useState<Episode[]>([]);
    const [loading, setLoading] = useState(true);

    // While the player page is open, pause non-essential background work
    // (addon sync polling etc.) so the video gets all bandwidth.
    useEffect(() => {
        setPlayerActive(true);
        return () => setPlayerActive(false);
    }, []);

    useEffect(() => {
        setItem(initialItem);
        setCurrentSeason(initialSeason);
        setCurrentEpisode(initialEpisode);
        setCurrentTime(initialCurrentTime || 0);
    }, [initialItem?.id, initialSeason, initialEpisode?.id, initialCurrentTime]);
    
    const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
    const [isFetchingStream, setIsFetchingStream] = useState(true);

    const [videoNode, setVideoNode] = useState<HTMLVideoElement | null>(null);
    
    // CINETV KIDS LOGIC
    const [schedule, setSchedule] = useState<Schedule | null>(null);
    const [currentItemIndex, setCurrentItemIndex] = useState(0);
    const [currentMedia, setCurrentMedia] = useState<Movie | null>(null);
    const [currentEpisodeInSeries, setCurrentEpisodeInSeries] = useState<Episode | null>(null);
    const [seriesEpisodes, setSeriesEpisodes] = useState<Episode[]>([]);
    const [seriesSeason, setSeriesSeason] = useState<number>(1);
    const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);
    const scheduledItemStartTimeRef = useRef<number>(0);
    
    const isCineTvKids = initialItem?.id === 'cinetv-kids';
    
    const ai = useMemo(() => {
        if (!process.env.API_KEY) return null;
        return new GoogleGenAI({ apiKey: process.env.API_KEY });
    }, []);

    const generateSchedule = useCallback(async () => {
        if (!ai) return;
        setIsLoadingSchedule(true);
        setSchedule(null);
        setCurrentItemIndex(0);

        const prompt = isKidsMode 
            ? `You are a TV channel programmer for a kids' channel called "CineTV Kids". Create a fun and varied schedule for today, lasting approximately 4-6 hours.
                - The schedule should be an array of items.
                - Each item must include a 'title', 'duration' (in minutes), a fun 'reason' for airing it, and the 'type' ('movie' or 'tv').
                - For TV shows, the duration should be a block of time (e.g., 60 minutes), and the player will air multiple episodes within that block.
                - Use real, well-known, and kid-friendly movies and TV shows.
                - Ensure a good mix of content types (e.g., animation, live-action, educational).
                - The total duration should be between 240 and 360 minutes.
                - Your response must be ONLY a JSON object that adheres to the provided schema. Do not add any conversational text or markdown formatting.`
            : ``; // No prompt for non-kids mode for now

        try {
            const response = await ai.models.generateContent({
                model: "gemini-3.5-flash",
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: scheduleSchema,
                },
            });
            const jsonResponse = JSON.parse(response.text);
            if (jsonResponse.items && jsonResponse.items.length > 0) {
                setSchedule(jsonResponse);
            } else {
                throw new Error("Generated schedule is empty.");
            }
        } catch (error) {
            console.error("Error generating schedule:", error);
            setToast({ message: "Failed to generate a schedule. Please try again later.", type: 'error' });
            // Optionally, navigate away or show a persistent error
        } finally {
            setIsLoadingSchedule(false);
        }
    }, [ai, isKidsMode, setToast]);
    
    const findAndPlayNext = useCallback(async () => {
        if (!schedule || currentItemIndex >= schedule.items.length) {
            console.log("Schedule finished or not ready, regenerating.");
            if (isCineTvKids) generateSchedule(); // Loop schedule
            return;
        }

        setIsLoadingSchedule(true);
        setCurrentMedia(null);
        setCurrentEpisodeInSeries(null);
        setSeriesEpisodes([]);
        
        const scheduledItem = schedule.items[currentItemIndex];
        const cleanTitle = scheduledItem.title.replace(/\s*\(\d{4}\)\s*$/, '').trim();
        
        try {
            console.log(`Searching for: "${cleanTitle}" (${scheduledItem.type})`);
            const searchResults = await fetchFromTMDB(`/search/${scheduledItem.type}`, { query: cleanTitle, language: 'en-US' });
            
            let foundItem: Movie | null = searchResults.results[0] || null;

            if (foundItem) {
                foundItem = await fetchFromTMDB(`/${scheduledItem.type}/${foundItem.id}`);
                console.log(`Found and localized:`, foundItem);
                
                if (scheduledItem.type === 'tv') {
                    const seasonToFetch = 1; 
                    setSeriesSeason(seasonToFetch);
                    const seasonData = await fetchFromTMDB(`/tv/${foundItem.id}/season/${seasonToFetch}`);
                    
                    if (seasonData.episodes && seasonData.episodes.length > 0) {
                        setSeriesEpisodes(seasonData.episodes);
                        setCurrentEpisodeInSeries(seasonData.episodes[0]);
                        setCurrentMedia(foundItem);
                    } else {
                        setCurrentItemIndex(prev => prev + 1);
                        return;
                    }
                } else {
                    setCurrentMedia(foundItem);
                }
                scheduledItemStartTimeRef.current = Date.now();
            } else {
                setToast({ message: `Can't find "${scheduledItem.title}". Skipping.`, type: 'info' });
                setCurrentItemIndex(prev => prev + 1);
            }
        } catch (error) {
            console.error("Error finding content:", error);
            setToast({ message: `Error finding "${scheduledItem.title}". Skipping.`, type: 'error' });
            setCurrentItemIndex(prev => prev + 1);
        } finally {
            setIsLoadingSchedule(false);
        }

    }, [schedule, currentItemIndex, isCineTvKids, generateSchedule, setToast]);
    
    const handleVideoEnded = useCallback(() => {
        if (!isCineTvKids || !schedule || !currentMedia) return;

        const scheduledItem = schedule.items[currentItemIndex];
        const elapsedMinutes = (Date.now() - scheduledItemStartTimeRef.current) / (1000 * 60);

        // If it's a movie or the time block for the TV show has ended
        if (scheduledItem.type === 'movie' || elapsedMinutes >= scheduledItem.duration) {
            setCurrentItemIndex(prev => prev + 1); // Move to the next item in the main schedule
        } else if (scheduledItem.type === 'tv') {
            // Find the next episode in the current series
            const currentEpIndex = seriesEpisodes.findIndex(ep => ep.id === currentEpisodeInSeries?.id);
            if (currentEpIndex !== -1 && currentEpIndex < seriesEpisodes.length - 1) {
                setCurrentEpisodeInSeries(seriesEpisodes[currentEpIndex + 1]);
            } else {
                // End of season or series, move to next item in main schedule
                setCurrentItemIndex(prev => prev + 1);
            }
        }
    }, [isCineTvKids, schedule, currentItemIndex, currentMedia, currentEpisodeInSeries, seriesEpisodes]);
    
    useEffect(() => {
        if (isCineTvKids) {
            generateSchedule();
        }
    }, [isCineTvKids, generateSchedule]);
    
    useEffect(() => {
        if (isCineTvKids && schedule) {
            findAndPlayNext();
        }
    }, [isCineTvKids, schedule, currentItemIndex, findAndPlayNext]);

    const handleProviderSelected = useCallback((providerName: string) => {
        if (!selectedProvider) {
            setSelectedProvider(providerName);
        }
    }, [selectedProvider]);

    const handleStreamFetchStateChange = useCallback((isFetching: boolean) => {
        setIsFetchingStream(isFetching);
    }, []);

    useEffect(() => {
        setPipData(null); // Clear any existing PiP when the main player opens

        if (!initialItem) {
            navigate('/home', { replace: true });
            return;
        }
        
        if(isCineTvKids) return;

        const fetchAllData = async () => {
            setLoading(true);
            try {
                const data = streamUrl ? initialItem : await fetchFromTMDB(`/${type}/${initialItem.id}`, { append_to_response: 'seasons' });
                setItem(data);
                
                if (type === 'tv') {
                    const seasonToFetch = initialSeason || (data.seasons?.find((s: Season) => s.season_number > 0 && s.episode_count > 0)?.season_number ?? 1);
                    setCurrentSeason(seasonToFetch);
                    if (data.id && seasonToFetch) {
                        const seasonData = await fetchFromTMDB(`/tv/${data.id}/season/${seasonToFetch}`);
                        setEpisodes(seasonData.episodes);
                        if (!initialEpisode) {
                           const firstEpisode = seasonData.episodes.find((ep: Episode) => ep.episode_number > 0) || seasonData.episodes[0];
                           setCurrentEpisode(firstEpisode);
                        } else {
                           setCurrentEpisode(initialEpisode);
                        }
                    }
                } else {
                    setCurrentSeason(undefined);
                    setCurrentEpisode(null);
                    setEpisodes([]);
                }
            } catch (error) {
                console.error("Failed to fetch player page data:", error);
                if (!streamUrl) {
                    setToast({ message: t('failedToLoadDetails'), type: 'error' });
                }
            } finally {
                setLoading(false);
            }
        };

        fetchAllData();

    }, [initialItem?.id, type, initialSeason, initialEpisode, streamUrl, navigate, setPipData, setToast, t, isCineTvKids]);
    
     useEffect(() => {
        const video = videoNode;
        let interval: NodeJS.Timeout | null = null;

        const saveHistory = () => {
            if (video && item && video.duration > 0 && video.currentTime > 60 && !streamUrl && !isCineTvKids) {
                const progress = (video.currentTime / video.duration) * 100;
                if (progress < 95) {
                    const historyItem: HistoryItem = {
                        id: item.id,
                        type: type as 'movie' | 'tv',
                        title: currentEpisode ? `${item.name}: S${currentSeason}E${currentEpisode.episode_number}` : (item.name || item.title) as string,
                        itemImage: item.backdrop_path ? `${IMAGE_BASE_URL}${BACKDROP_SIZE_MEDIUM}${item.backdrop_path}` : '',
                        currentTime: video.currentTime,
                        duration: video.duration,
                        timestamp: Date.now(),
                        episodeId: currentEpisode?.id,
                        seasonNumber: currentSeason,
                        episodeNumber: currentEpisode?.episode_number,
                    };
                    updateHistory(historyItem);
                }
            }
        };

        if (video) {
            interval = setInterval(saveHistory, 10000);
        }

        return () => {
            if (interval) clearInterval(interval);
            saveHistory();
        };
    }, [videoNode, item, type, currentSeason, currentEpisode, updateHistory, streamUrl, isCineTvKids]);

    const handleEpisodeSelect = (episode: Episode) => {
        setCurrentEpisode(episode);
        setCurrentTime(0);
    };
    
    const handleEnterPip = (url: string, time: number, playing: boolean, dimensions: DOMRect) => {
        if (!item) return;
        const pipState: PipData = {
            item,
            type: type as 'movie' | 'tv',
            season: currentSeason,
            episode: currentEpisode ?? undefined,
            currentTime: time,
            isPlaying: playing,
            streamUrl: url,
        };
        setPipAnchor({
            top: dimensions.top,
            left: dimensions.left,
            width: dimensions.width,
            height: dimensions.height,
        });
        setPipData(pipState);
        navigate(-1);
    };
    
    if (isCineTvKids) {
        if (isLoadingSchedule || !currentMedia) {
             return (
                <div className="flex flex-col items-center justify-center h-screen w-screen bg-black text-white">
                    <img src="https://i.ibb.co/3kR0r6G/DALL-E-2024-05-21-13-15-15-A-vibrant-and-playful-logo-for-a-kids-TV-channel-named-Cine-TV-Kids-The-d.webp" alt="CineTV Kids" className="w-48 h-48 mb-4" />
                    <div className="w-20 h-20 border-4 border-t-transparent border-blue-400 rounded-full animate-spin mb-4"></div>
                    <p className="text-xl font-semibold">{schedule ? `Finding '${schedule.items[currentItemIndex]?.title}'...` : "Generating today's schedule..."}</p>
                </div>
            );
        }
        return (
            <div className="w-screen h-dvh bg-black overflow-hidden relative">
                <VideoPlayer
                    key={currentMedia.id + (currentEpisodeInSeries ? `_${currentEpisodeInSeries.id}` : '')}
                    item={currentMedia}
                    itemType={schedule!.items[currentItemIndex].type}
                    initialSeason={seriesSeason}
                    initialEpisode={currentEpisodeInSeries}
                    onEnterPip={() => {}}
                    selectedProvider={null}
                    onProviderSelected={() => {}}
                    onStreamFetchStateChange={handleStreamFetchStateChange}
                    serverPreferences={[]}
                    episodes={seriesEpisodes}
                    onEpisodeSelect={() => {}}
                    isLiveScheduleMode={true}
                    onVideoEnded={handleVideoEnded}
                    liveReason={schedule!.items[currentItemIndex].reason}
                />
            </div>
        )
    }

    if (loading || !item) {
        return <div className="flex items-center justify-center h-screen w-screen bg-black"><div className="w-16 h-16 border-4 border-t-transparent border-[var(--primary)] rounded-full animate-spin"></div></div>;
    }
    
    return (
        <div className="w-screen h-dvh bg-black overflow-hidden relative">
            <VideoPlayer
                key={item.id + (currentEpisode ? `_${currentEpisode.id}` : '') + (liveChannels ? `_live_${currentChannelIndex}` : '')}
                item={item}
                itemType={type as 'movie' | 'tv'}
                initialSeason={currentSeason}
                initialEpisode={currentEpisode}
                initialTime={currentTime}
                initialStreamUrl={streamUrl}
                onEnterPip={handleEnterPip}
                selectedProvider={selectedProvider}
                onProviderSelected={handleProviderSelected}
                onStreamFetchStateChange={handleStreamFetchStateChange}
                setVideoNode={setVideoNode}
                serverPreferences={getScreenSpecificData('serverPreferences', [])}
                episodes={episodes}
                onEpisodeSelect={handleEpisodeSelect}
                liveChannels={liveChannels}
                currentChannelIndex={currentChannelIndex}
                logo={logo}
                hideLogo={hideLogo}
                needsProxy={needsProxy}
            />
        </div>
    );
};

export default PlayerPage;
