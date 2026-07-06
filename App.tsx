import React, { useState, useEffect, useRef, useCallback, createContext, useContext, ReactNode } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import PlayerPage from './pages/PlayerPage';
import ProfilePage from './pages/ProfilePage';
import GenericPage from './pages/GenericPage';
import ActorDetailsPage from './pages/ActorDetailsPage';
import SettingsPage from './pages/SettingsPage';
import MoviesPage from './pages/MoviesPage';
import TvShowsPage from './pages/TvShowsPage';
import DetailsPage from './pages/DetailsPage';
import CinemaPage from './pages/CinemaPage';
import LiveRoomPage from './pages/LiveRoomPage';
import ShortsPage from './pages/ShortsPage';
import YouPage from './pages/YouPage';
import AISearchPage from './pages/AISearchPage';
import IframePlayerPage from './pages/IframePlayerPage';
import IptvPage from './pages/IptvPage';
import LoginPage from './pages/LoginPage';
import QrApprovePage from './pages/QrApprovePage';
import AdminPage from './pages/AdminPage';
import { RequireAuth, GuestWatchGate } from './components/AuthGuard';
import AddonsPage from './pages/AddonsPage';
import AddonPage from './pages/AddonPage';
import StudioPage from './pages/StudioPage';
import { AddonProvider } from './addons/AddonContext';
import { ProfileProvider, useProfile } from './contexts/ProfileContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { PlayerProvider } from './contexts/PlayerContext';
import { ToastContainer, DetailsModal, TVCursor } from './components/common';
import PipPlayer from './components/PipPlayer';
import { useTranslation } from './contexts/LanguageContext';
import { consumeSystemUpdatedNotice } from './services/cacheReset';

const GenericPageWrapper: React.FC<{ pageType: 'favorites' | 'search' | 'all' }> = ({ pageType }) => {
  const { t } = useTranslation();
  const pageTitles = {
    favorites: t('myList'),
    search: t('search'),
    all: t('allCategory'),
  }
  return <GenericPage pageType={pageType} title={pageTitles[pageType]} />;
};

// Shows a simple one-time "System updated" toast right after the one-time
// local cache reset ran (see services/cacheReset.ts).
const SystemUpdateNotice: React.FC = () => {
  const { setToast } = useProfile();
  useEffect(() => {
    if (consumeSystemUpdatedNotice()) {
      const timer = window.setTimeout(() => {
        setToast({ message: 'System updated', type: 'success' });
      }, 1200);
      return () => window.clearTimeout(timer);
    }
  }, [setToast]);
  return null;
};

// One-time toast announcing this release (TV zoom fix). Shown once per
// device the first time the app is opened after this update ships.
const APP_UPDATE_NOTICE_KEY = 'cineAppUpdateNoticeV3';
const AppUpdateNotice: React.FC = () => {
  const { setToast } = useProfile();
  useEffect(() => {
    try {
      if (localStorage.getItem(APP_UPDATE_NOTICE_KEY) === '1') return;
      const timer = window.setTimeout(() => {
        setToast({
          message: 'app updated: tv zoom fixed, download from vimovies.online',
          type: 'success',
        });
      }, 1200);
      localStorage.setItem(APP_UPDATE_NOTICE_KEY, '1');
      return () => window.clearTimeout(timer);
    } catch {
      /* localStorage unavailable — skip notice */
    }
  }, [setToast]);
  return null;
};

const GlobalModal: React.FC = () => {
    const { modalItem, setModalItem } = useProfile();
    if (!modalItem) return null;
    return <DetailsModal item={modalItem} onClose={() => setModalItem(null)} />;
}

const App: React.FC = () => {
  const [enterPressCount, setEnterPressCount] = useState(0);
  const [showTvCursor, setShowTvCursor] = useState(false);
  const enterPressTimeout = useRef<number | null>(null);
  const [cursorPosition, setCursorPosition] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const [clickEffect, setClickEffect] = useState(false);
  
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (window.location.hash.includes('#/player') || window.location.hash.includes('#/iframe-player') || window.location.hash.includes('#/live/')) {
        return;
    }
    
    if (e.key === 'Enter') {
      if (enterPressTimeout.current) {
        clearTimeout(enterPressTimeout.current);
      }
      const newCount = enterPressCount + 1;
      setEnterPressCount(newCount);

      if (newCount === 3) {
        setShowTvCursor(true);
        setEnterPressCount(0);
      } else {
        enterPressTimeout.current = window.setTimeout(() => {
          setEnterPressCount(0);
        }, 500);
      }
    }

    if (showTvCursor) {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        setShowTvCursor(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const element = document.elementFromPoint(cursorPosition.x, cursorPosition.y);
        setClickEffect(true);
        setTimeout(() => setClickEffect(false), 400);
        if (element instanceof HTMLElement) {
          element.click();
        }
        return;
      } else {
        return;
      }
    }

    if (e.defaultPrevented) {
        return;
    }

    if (document.querySelector('.player-container-scope')) {
        return;
    }

    const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (!arrowKeys.includes(e.key)) {
      return;
    }
    e.preventDefault();

    const currentElement = document.activeElement as HTMLElement;
    
    const modalElement = document.querySelector('.details-modal-content');
    const navigationScope = modalElement || document;

    // If a details modal is open but focus is stuck outside it (e.g. still on
    // the card behind), pull focus into the modal so arrow keys always work.
    if (!currentElement || !currentElement.matches('.focusable') || (modalElement && !modalElement.contains(currentElement))) {
      const firstFocusable = ((modalElement?.querySelector('[data-focus-group="main-actions"][data-focus-index="0"]')) || navigationScope.querySelector('.focusable')) as HTMLElement;
      if (firstFocusable) {
        firstFocusable.focus();
        firstFocusable.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
      return;
    }

    const allFocusables = Array.from(navigationScope.querySelectorAll('.focusable:not([disabled])')) as HTMLElement[];
    const focusablesWithRects = allFocusables
        .map(el => {
            if (el.closest('[inert]')) return null;

            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) {
                return null;
            }

            return { el, rect };
        })
        .filter((item): item is { el: HTMLElement; rect: DOMRect } => item !== null);

    const currentIndex = focusablesWithRects.findIndex(({ el }) => el === currentElement);
    if (currentIndex === -1) return;

    const { rect: currentRect } = focusablesWithRects[currentIndex];

    let bestCandidate: HTMLElement | null = null;
    let minDistance = Infinity;

    for (const { el: candidate, rect: candidateRect } of focusablesWithRects) {
        if (candidate === currentElement) continue;

        const dx = (candidateRect.left + candidateRect.width / 2) - (currentRect.left + currentRect.width / 2);
        const dy = (candidateRect.top + candidateRect.height / 2) - (currentRect.top + currentRect.height / 2);

        let distance: number;

        switch (e.key) {
            case 'ArrowRight':
                if (dx > 0) {
                    distance = Math.abs(dy) * 10 + dx;
                    if (distance < minDistance) {
                        minDistance = distance;
                        bestCandidate = candidate;
                    }
                }
                break;
            case 'ArrowLeft':
                if (dx < 0) {
                    distance = Math.abs(dy) * 10 + Math.abs(dx);
                    if (distance < minDistance) {
                        minDistance = distance;
                        bestCandidate = candidate;
                    }
                }
                break;
            case 'ArrowDown':
                // Only consider elements genuinely below (not on the same row).
                if (dy > 0 && candidateRect.top >= currentRect.bottom - 5) {
                    distance = Math.abs(dx) * 2 + dy;
                    if (distance < minDistance) {
                        minDistance = distance;
                        bestCandidate = candidate;
                    }
                }
                break;
            case 'ArrowUp':
                // Only consider elements genuinely above (not on the same row).
                if (dy < 0 && candidateRect.bottom <= currentRect.top + 5) {
                    distance = Math.abs(dx) * 2 + Math.abs(dy);
                    if (distance < minDistance) {
                        minDistance = distance;
                        bestCandidate = candidate;
                    }
                }
                break;
        }
    }

    if (bestCandidate) {
        bestCandidate.focus();
        // Snappy instant scrolling is standard and extremely fast, avoiding lag during rapid navigation or data loading.
        bestCandidate.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
    }
}, [enterPressCount, showTvCursor, cursorPosition.x, cursorPosition.y]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
  
  return ( 
    <LanguageProvider>
      <ProfileProvider>
        <AddonProvider>
          {showTvCursor && <TVCursor position={cursorPosition} visible={true} clickEffect={clickEffect} />}
          <HashRouter>
            <PlayerProvider>
              <Routes>
                <Route path="/" element={<RequireAuth><ProfilePage /></RequireAuth>} />
                <Route path="/home" element={<RequireAuth><HomePage /></RequireAuth>} />
                <Route path="/movies" element={<RequireAuth><MoviesPage /></RequireAuth>} />
                <Route path="/tv" element={<RequireAuth><TvShowsPage /></RequireAuth>} />
                <Route path="/actor/:id" element={<RequireAuth><ActorDetailsPage /></RequireAuth>} />
                <Route path="/player" element={<RequireAuth><GuestWatchGate><PlayerPage /></GuestWatchGate></RequireAuth>} />
                <Route path="/iframe-player" element={<RequireAuth><GuestWatchGate><IframePlayerPage /></GuestWatchGate></RequireAuth>} />
                <Route path="/favorites" element={<RequireAuth><GenericPageWrapper pageType="favorites" /></RequireAuth>} />
                <Route path="/search" element={<RequireAuth><GenericPageWrapper pageType="search" /></RequireAuth>} />
                <Route path="/all/:category" element={<RequireAuth><GenericPageWrapper pageType="all" /></RequireAuth>} />
                <Route path="/iptv" element={<RequireAuth><IptvPage /></RequireAuth>} />
                <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
                <Route path="/details/:type/:id" element={<RequireAuth><DetailsPage /></RequireAuth>} />
                <Route path="/cinema" element={<RequireAuth><CinemaPage /></RequireAuth>} />
                <Route path="/live/:type/:id" element={<RequireAuth><LiveRoomPage /></RequireAuth>} />
                <Route path="/shorts" element={<RequireAuth><ShortsPage /></RequireAuth>} />
                <Route path="/you" element={<RequireAuth><YouPage /></RequireAuth>} />
                <Route path="/ai-search" element={<RequireAuth><AISearchPage /></RequireAuth>} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/qr-approve" element={<QrApprovePage />} />
                <Route path="/admin" element={<RequireAuth><AdminPage /></RequireAuth>} />
                <Route path="/addons" element={<RequireAuth><AddonsPage /></RequireAuth>} />
                <Route path="/addon/:addonId" element={<RequireAuth><AddonPage /></RequireAuth>} />
                <Route path="/addon/:addonId/:pageId" element={<RequireAuth><AddonPage /></RequireAuth>} />
                {/* Personal PC Addon Studio — the private link token is the credential; addons-only scope */}
                <Route path="/studio/:stoken" element={<StudioPage />} />
              </Routes>
              <PipPlayer />
              <GlobalModal />
            </PlayerProvider> 
          </HashRouter>
          <ToastContainer />
          <SystemUpdateNotice />
          <AppUpdateNotice />
        </AddonProvider>
      </ProfileProvider>
    </LanguageProvider>
  );
};

export default App;
