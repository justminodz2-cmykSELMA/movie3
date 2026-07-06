

export interface Movie {
  id: number;
  title: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  vote_count: number;
  popularity?: number;
  genres?: { id: number; name: string }[];
  runtime?: number;
  media_type?: 'movie' | 'tv';
  itemType?: 'movie' | 'tv';
  content_ratings?: { results: { iso_3166_1: string; rating: string }[] };
  credits?: { cast: { name:string }[] };
  production_companies?: { name: string }[];
  status?: string;
  original_title?: string;
  original_name?: string;
  original_language?: string;
  recommendations?: { results: Movie[] };
  seasons?: Season[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  currentTime?: number;
  duration?: number;
  // FIX: Add optional videos property based on API response for `append_to_response`.
  videos?: {
    results: {
      key: string;
      site: string;
      type: string;
    }[];
  };
  images?: {
    logos: {
      file_path: string;
      iso_639_1: string;
    }[];
  };
}

export interface Actor {
  id: number;
  name: string;
  profile_path: string | null;
  biography: string;
  birthday: string | null;
  place_of_birth: string | null;
  known_for_department: string;
  popularity: number;
  likes?: number;
  combined_credits?: {
    cast: Movie[];
  };
  images?: {
    profiles: { file_path: string }[];
  };
}

export interface TVShow extends Movie {
  name: string;
  first_air_date: string;
  number_of_seasons: number;
}

export interface Season {
  id: number;
  season_number: number;
  name: string;
  poster_path: string | null;
  episode_count: number;
}

export interface Episode {
  id: number;
  episode_number: number;
  name:string;
  overview: string;
  still_path: string | null;
}

export interface HistoryItem {
  id: number;
  type: 'movie' | 'tv';
  title: string;
  itemImage: string;
  currentTime: number;
  duration: number;
  timestamp: number;
  episodeId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
}

export interface FavoriteItem {
  id: number;
  title?: string;
  name?: string;
  poster?: string;
  backdropPath?: string | null;
  type: 'movie' | 'tv';
  vote_average: number;
}

export interface DownloadItem {
  title: string;
  poster: string;
}

export interface SubtitleTrack {
  language: string;
  url: string;
  display: string;
}

// FIX: Add ChatMessage interface for LiveRoomPage chat functionality.
export interface ChatMessage {
  id: number;
  user: {
    name: string;
    avatar: string;
  };
  text: string;
  isJoin?: boolean;
}

// FIX: Define and export StreamLink interface to be used across the application.
export interface StreamLink {
  quality: string;
  url: string;
}

export interface StreamData {
  links: StreamLink[];
  subtitles?: SubtitleTrack[];
}

export interface SubtitleSettings {
  fontSize: number;
  backgroundOpacity: number;
  edgeStyle: 'none' | 'drop-shadow' | 'outline';
  verticalPosition: number;
  timingOffset?: number;
}

export interface VideoFilters {
    brightness: number;
    contrast: number;
    saturation: number;
    sharpness: number;
    hue: number;
    gamma: number;
    enabled: boolean;
}

export interface Profile {
  id: string;
  name: string;
  avatar: string;
  type: 'ADULT' | 'KIDS';
  favorites: FavoriteItem[];
  history: HistoryItem[];
  lastSearches: Movie[];
  downloads: DownloadItem[];
  tastePreferences?: number[];
  followedActors?: number[];
  subtitleSettings?: SubtitleSettings;
  videoFilters?: VideoFilters;
  serverPreferences?: string[];
  geminiApiKey?: string;
}

export interface AccountData {
  screens: Profile[];
  activeScreenId: string | null;
}

export interface Short {
  id: number;
  title: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  videoKey: string;
  media_type: 'movie' | 'tv';
}
  
export interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  destroy: () => void;
  getPlayerState: () => number;
}


declare global {
  interface Window {
    // Fix: Added cineStreamBgTimeoutId to the Window interface to avoid TypeScript errors.
    cineStreamBgTimeoutId?: number;
    YT?: {
      Player: new (id:string, options: {
        videoId: string;
        playerVars?: Record<string, any>;
        events?: {
          onReady?: (event: { target: YTPlayer }) => void;
          onStateChange?: (event: { data: number }) => void;
        };
      }) => YTPlayer;
      PlayerState: {
        ENDED: 0;
        PLAYING: 1;
        PAUSED: 2;
        BUFFERING: 3;
        CUED: 5;
      }
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}
