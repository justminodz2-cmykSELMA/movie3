import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Profile, AccountData, HistoryItem, FavoriteItem, DownloadItem, Movie } from '../types';
import { useTranslation } from './LanguageContext';

interface ProfileContextType {
  accountData: AccountData | null;
  activeProfile: Profile | null;
  isKidsMode: boolean;
  isDarkMode: boolean;
  toast: { message: string, type: 'success' | 'error' | 'info' } | null;
  setToast: (toast: { message: string, type: 'success' | 'error' | 'info' } | null) => void;
  selectProfile: (profileId: string) => void;
  addProfile: (profile: Omit<Profile, 'id' | 'favorites' | 'history' | 'lastSearches' | 'downloads'>) => Profile | undefined;
  updateProfile: (profileId: string, updates: Partial<Pick<Profile, 'name' | 'avatar' | 'type' | 'geminiApiKey'>>) => void;
  deleteProfile: (profileId: string) => void;
  getScreenSpecificData: <K extends keyof Profile>(key: K, defaultValue: Profile[K]) => Profile[K];
  setScreenSpecificData: <K extends keyof Profile>(key: K, value: Profile[K] | ((prev: Profile[K]) => Profile[K])) => void;
  toggleFavorite: (item: Movie | FavoriteItem) => void;
  isFavorite: (itemId: number) => boolean;
  updateHistory: (item: HistoryItem) => void;
  addDownload: (item: DownloadItem) => void;
  removeDownload: (title: string) => void;
  addLastSearch: (item: Movie) => void;
  clearLastSearches: () => void;
  setDarkMode: (isDark: boolean) => void;
  clearAllData: () => void;
  switchProfile: () => void;
  toggleFollowActor: (actorId: number) => void;
  isFollowingActor: (actorId: number) => boolean;
  modalItem: Movie | null;
  setModalItem: (item: Movie | null) => void;
  isYtApiReady: boolean;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

const getLocalStorageItem = <T,>(key: string, defaultValue: T): T => {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
        console.error(`LS Error get ${key}:`, e);
        return defaultValue;
    }
};

const setLocalStorageItem = <T,>(key: string, value: T) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.error(`LS Error set ${key}:`, e);
    }
};

export const ProfileProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const [accountData, setAccountData] = useState<AccountData | null>(null);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [isKidsMode, setIsKidsMode] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => getLocalStorageItem('darkMode', true));
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
  const [modalItem, setModalItem] = useState<Movie | null>(null);
  const [isYtApiReady, setIsYtApiReady] = useState(false);

  useEffect(() => {
    // This effect runs once on app start to load the YouTube IFrame API
    if (window.YT?.Player) {
        setIsYtApiReady(true);
        return;
    }

    const scriptId = 'youtube-iframe-api';
    
    // This function will be called by the YT script once it's loaded and ready.
    window.onYouTubeIframeAPIReady = () => {
        setIsYtApiReady(true);
    };
    
    if (!document.getElementById(scriptId)) {
        const tag = document.createElement('script');
        tag.id = scriptId;
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.append(tag);
    } else if (window.YT?.Player) {
        // The script is there AND the API is ready. This might happen in some HMR scenarios.
        setIsYtApiReady(true);
    }
    // If script is present but API not ready, onYouTubeIframeAPIReady will be called eventually by the script itself.
  }, []);

  useEffect(() => {
    let data = getLocalStorageItem<AccountData>('cineStreamAccount', { screens: [], activeScreenId: null });

    // If no profiles exist (first launch), create default ones.
    if (data.screens.length === 0) {
      const defaultUserAvatar = 'https://upload.wikimedia.org/wikipedia/commons/0/0b/Netflix-avatar.png';
      const defaultKidsAvatar = 'https://loodibee.com/wp-content/uploads/Netflix-avatar-10.png';

      const defaultProfiles: Profile[] = [
        {
          id: `scr_${Date.now()}_user`,
          name: 'User',
          avatar: defaultUserAvatar,
          type: 'ADULT',
          favorites: [],
          history: [],
          lastSearches: [],
          downloads: [],
          followedActors: [],
          serverPreferences: [],
        },
        {
          id: `scr_${Date.now()}_kids`,
          name: 'Kids',
          avatar: defaultKidsAvatar,
          type: 'KIDS',
          favorites: [],
          history: [],
          lastSearches: [],
          downloads: [],
          followedActors: [],
          serverPreferences: [],
        }
      ];
      
      data = { screens: defaultProfiles, activeScreenId: null };
      setLocalStorageItem('cineStreamAccount', data);
    }

    setAccountData(data);
    if (data.activeScreenId) {
      const profile = data.screens.find(s => s.id === data.activeScreenId);
      if (profile) {
        setActiveProfile(profile);
        setIsKidsMode(profile.type === 'KIDS');
      }
    }
  }, []);

  const updateAccountData = useCallback((newData: AccountData) => {
    setAccountData(newData);
    setLocalStorageItem('cineStreamAccount', newData);
  }, []);
  
  const setDarkMode = (isDark: boolean) => {
    setIsDarkMode(isDark);
    setLocalStorageItem('darkMode', isDark);
  };

  const selectProfile = useCallback((profileId: string) => {
    if (accountData) {
      const newActiveProfile = accountData.screens.find(p => p.id === profileId);
      if (newActiveProfile) {
        setActiveProfile(newActiveProfile);
        setIsKidsMode(newActiveProfile.type === 'KIDS');
        updateAccountData({ ...accountData, activeScreenId: profileId });
      }
    }
  }, [accountData, updateAccountData]);

  const switchProfile = () => {
    if(accountData){
        setActiveProfile(null);
        setIsKidsMode(false);
        updateAccountData({ ...accountData, activeScreenId: null });
    }
  };

  const addProfile = useCallback((profileData: Omit<Profile, 'id' | 'favorites' | 'history' | 'lastSearches' | 'downloads'>): Profile | undefined => {
    if (accountData && accountData.screens.length < 5) {
      const newProfile: Profile = {
        id: `scr_${Date.now()}`,
        name: profileData.name,
        avatar: profileData.avatar,
        type: profileData.type,
        tastePreferences: profileData.tastePreferences || [],
        favorites: [],
        history: [],
        lastSearches: [],
        downloads: [],
        followedActors: [],
        serverPreferences: [],
        geminiApiKey: profileData.geminiApiKey || '',
      };
      const newData = { ...accountData, screens: [...accountData.screens, newProfile] };
      updateAccountData(newData);
      setToast({ message: t('profileCreated'), type: 'success' });
      return newProfile;
    }
    return undefined;
  }, [accountData, updateAccountData, t]);
  
  const updateProfile = useCallback((profileId: string, updates: Partial<Pick<Profile, 'name' | 'avatar' | 'type' | 'geminiApiKey'>>) => {
    if (accountData) {
      const newScreens = accountData.screens.map(p => p.id === profileId ? { ...p, ...updates } : p);
      const newData = { ...accountData, screens: newScreens };
      updateAccountData(newData);
      if (activeProfile?.id === profileId) {
        const updatedProfile = newScreens.find(p => p.id === profileId);
        if (updatedProfile) {
          setActiveProfile(updatedProfile);
          setIsKidsMode(updatedProfile.type === 'KIDS');
        }
      }
      setToast({ message: t('profileUpdated'), type: 'success' });
    }
  }, [accountData, updateAccountData, activeProfile, t]);
  
  const deleteProfile = useCallback((profileId: string) => {
    if (accountData && accountData.screens.length > 1) {
      const newScreens = accountData.screens.filter(p => p.id !== profileId);
      let newActiveId = accountData.activeScreenId;
      if (newActiveId === profileId) {
        newActiveId = null;
        setActiveProfile(null);
        setIsKidsMode(false);
      }
      const newData = { ...accountData, screens: newScreens, activeScreenId: newActiveId };
      updateAccountData(newData);
      setToast({ message: t('profileDeleted'), type: 'success' });
    }
  }, [accountData, updateAccountData, t]);

  const setScreenSpecificData = useCallback(<K extends keyof Profile>(key: K, value: Profile[K] | ((prev: Profile[K]) => Profile[K])) => {
      setActiveProfile(prevProfile => {
          if (!prevProfile) return null;

          const defaultValues: Partial<Record<keyof Profile, any>> = {
              favorites: [], history: [], lastSearches: [], downloads: [], followedActors: [], serverPreferences: [],
          };
          
          const prevValue = (prevProfile[key] ?? defaultValues[key] ?? null) as Profile[K];
          const newValue = typeof value === 'function' ? (value as Function)(prevValue) : value;
          const updatedProfile = { ...prevProfile, [key]: newValue };

          setAccountData(prevAccountData => {
              if (!prevAccountData) return null;
              const newScreens = prevAccountData.screens.map(p => p.id === prevProfile.id ? updatedProfile : p);
              const finalAccountData = { ...prevAccountData, screens: newScreens };
              setLocalStorageItem('cineStreamAccount', finalAccountData);
              return finalAccountData;
          });

          return updatedProfile;
      });
  }, []);

  const getScreenSpecificData = useCallback(<K extends keyof Profile>(key: K, defaultValue: Profile[K]): Profile[K] => {
    return activeProfile?.[key] as Profile[K] ?? defaultValue;
  }, [activeProfile]);

  const toggleFavorite = useCallback((item: Movie | FavoriteItem) => {
    if (!item?.id) return;
    setScreenSpecificData('favorites', (prevFavorites: FavoriteItem[]) => {
        const favorites = prevFavorites || [];
        const isFav = favorites.some(f => f.id === item.id);
        if (isFav) {
            setToast({ message: t('removedFromFavorites'), type: 'info' });
            return favorites.filter(f => f.id !== item.id);
        } else {
            if (!('poster_path' in item)) {
                console.error("Cannot add item to favorites: not a full Movie object.", item);
                setToast({ message: t('errorInsufficientInfo'), type: 'error' });
                return favorites;
            }
            const movieItem = item as Movie;
            const favEntry: FavoriteItem = {
                id: movieItem.id,
                title: movieItem.title,
                name: movieItem.name,
                poster: movieItem.poster_path ? `${"https://image.tmdb.org/t/p/w500"}${movieItem.poster_path}` : '',
                backdropPath: movieItem.backdrop_path || null,
                type: movieItem.media_type || (movieItem.title ? 'movie' : 'tv'),
                vote_average: movieItem.vote_average
            };
            setToast({ message: t('addedToFavorites'), type: 'success' });
            return [...favorites, favEntry];
        }
    });
  }, [setScreenSpecificData, setToast, t]);

  const toggleFollowActor = useCallback((actorId: number) => {
    setScreenSpecificData('followedActors', (prevFollowed: number[]) => {
        const followed = prevFollowed || [];
        const isFollowing = followed.includes(actorId);
        if (isFollowing) {
            setToast({ message: t('unfollowedActor'), type: 'info' });
            return followed.filter(id => id !== actorId);
        } else {
            setToast({ message: t('followedActor'), type: 'success' });
            return [...followed, actorId];
        }
    });
  }, [setScreenSpecificData, setToast, t]);

  const isFollowingActor = useCallback((actorId: number) => {
    if (!activeProfile) return false;
    const followed = getScreenSpecificData('followedActors', []);
    return followed.includes(actorId);
  }, [getScreenSpecificData, activeProfile]);


  const isFavorite = useCallback((itemId: number) => {
    if(!activeProfile) return false;
    const favorites = getScreenSpecificData('favorites', []);
    return favorites.some(f => f.id === itemId);
  }, [getScreenSpecificData, activeProfile]);

  const updateHistory = useCallback((itemToUpdate: HistoryItem) => {
      if (isKidsMode) return;
      setScreenSpecificData('history', (prevHistory: HistoryItem[]) => {
          const history = prevHistory || [];
          const newHistory = history.filter(h => {
            if (itemToUpdate.episodeId && h.episodeId) {
                return h.episodeId !== itemToUpdate.episodeId;
            }
            if (!itemToUpdate.episodeId && !h.episodeId) {
                return h.id !== itemToUpdate.id;
            }
            return true; 
        });
        newHistory.unshift(itemToUpdate);
        return newHistory.slice(0, 20);
      });
  }, [setScreenSpecificData, isKidsMode]);

  const addDownload = useCallback((item: DownloadItem) => {
    setScreenSpecificData('downloads', (prevDownloads: DownloadItem[]) => {
        const downloads = prevDownloads || [];
        if(!downloads.some(d => d.title === item.title)){
            setToast({ message: t('downloadAdded', { title: item.title }), type: 'success'});
            return [...downloads, item];
        } else {
            setToast({ message: t('itemAlreadyInDownloads', { title: item.title }), type: 'info'});
            return downloads;
        }
    });
  }, [setScreenSpecificData, setToast, t]);

  const removeDownload = useCallback((title: string) => {
    setScreenSpecificData('downloads', (prevDownloads: DownloadItem[]) => {
        setToast({ message: t('itemRemovedFromDownloads', { title: title }), type: 'info'});
        return (prevDownloads || []).filter(d => d.title !== title)
    });
  }, [setScreenSpecificData, setToast, t]);

  const addLastSearch = useCallback((item: Movie) => {
    setScreenSpecificData('lastSearches', (prevSearches: Movie[]) => {
        const searches = prevSearches || [];
        const newSearches = [item, ...searches.filter(s => s.id !== item.id)];
        return newSearches.slice(0, 10);
    });
  }, [setScreenSpecificData]);

  const clearLastSearches = useCallback(() => {
    setScreenSpecificData('lastSearches', []);
  }, [setScreenSpecificData]);

  const clearAllData = useCallback(() => {
    setLocalStorageItem('cineStreamAccount', { screens: [], activeScreenId: null });
    setAccountData({ screens: [], activeScreenId: null });
    setActiveProfile(null);
    setIsKidsMode(false);
    setToast({ message: t('allDataCleared'), type: 'success' });
  }, [setToast, t]);

  return (
    <ProfileContext.Provider value={{
      accountData,
      activeProfile,
      isKidsMode,
      isDarkMode,
      toast,
      setToast,
      selectProfile,
      addProfile,
      updateProfile,
      deleteProfile,
      getScreenSpecificData,
      setScreenSpecificData,
      toggleFavorite,
      isFavorite,
      updateHistory,
      addDownload,
      removeDownload,
      addLastSearch,
      clearLastSearches,
      setDarkMode,
      clearAllData,
      switchProfile,
      toggleFollowActor,
      isFollowingActor,
      modalItem,
      setModalItem,
      isYtApiReady,
    }}>
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfile = (): ProfileContextType => {
  const context = useContext(ProfileContext);
  if (context === undefined) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
};
