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
import { ProfileProvider, useProfile } from './contexts/ProfileContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { PlayerProvider } from './contexts/PlayerContext';
import { ToastContainer, DetailsModal, TVCursor } from './components/common';
import PipPlayer from './components/PipPlayer';
import { useTranslation } from './contexts/LanguageContext';

const GenericPageWrapper: React.FC<{ pageType: 'favorites' | 'search' | 'all' }> = ({ pageType }) => {
  const { t } = useTranslation();
  const pageTitles = {
    favorites: t('myList'),
    search: t('search'),
    all: t('allCategory'),
  }
  return <GenericPage pageType={pageType} title={pageTitles[pageType]} />;
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

    if (!currentElement || !currentElement.matches('.focusable')) {
      const firstFocusable = navigationScope.querySelector('.focusable') as HTMLElement;
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

            // Fast visibility check: offsetParent is null if the element or its parent has display: none.
            // Fixed/sticky elements also have offsetParent = null, so we query computed style only if offsetParent is null.
            if (el.offsetParent === null) {
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden') {
                    return null;
                }
            }

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
                    distance = Math.abs(dy) * 2 + dx;
                    if (distance < minDistance) {
                        minDistance = distance;
                        bestCandidate = candidate;
                    }
                }
                break;
            case 'ArrowLeft':
                if (dx < 0) {
                    distance = Math.abs(dy) * 2 + Math.abs(dx);
                    if (distance < minDistance) {
                        minDistance = distance;
                        bestCandidate = candidate;
                    }
                }
                break;
            case 'ArrowDown':
                if (dy > 0) {
                    distance = Math.abs(dx) * 2 + dy;
                    if (distance < minDistance) {
                        minDistance = distance;
                        bestCandidate = candidate;
                    }
                }
                break;
            case 'ArrowUp':
                if (dy < 0) {
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
        // TV browsers struggle immensely with smooth scrolling. Snappy instant scrolling is standard and extremely fast.
        const isTV = showTvCursor || (typeof navigator !== 'undefined' && /SmartTV|Tizen|Web0S|AppleTV|AndroidTV|TV|PlayStation/i.test(navigator.userAgent));
        bestCandidate.scrollIntoView({ behavior: isTV ? 'auto' : 'smooth', block: 'center', inline: 'nearest' });
    }
}, [enterPressCount, showTvCursor, cursorPosition.x, cursorPosition.y]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
  
  return ( 
    <LanguageProvider>
      <ProfileProvider>
          {showTvCursor && <TVCursor position={cursorPosition} visible={true} clickEffect={clickEffect} />}
          <HashRouter>
            <PlayerProvider>
              <Routes>
                <Route path="/" element={<ProfilePage />} />
                <Route path="/home" element={<HomePage />} />
                <Route path="/movies" element={<MoviesPage />} />
                <Route path="/tv" element={<TvShowsPage />} />
                <Route path="/actor/:id" element={<ActorDetailsPage />} />
                <Route path="/player" element={<PlayerPage />} />
                <Route path="/iframe-player" element={<IframePlayerPage />} />
                <Route path="/favorites" element={<GenericPageWrapper pageType="favorites" />} />
                <Route path="/search" element={<GenericPageWrapper pageType="search" />} />
                <Route path="/all/:category" element={<GenericPageWrapper pageType="all" />} />
                <Route path="/iptv" element={<IptvPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/details/:type/:id" element={<DetailsPage />} />
                <Route path="/cinema" element={<CinemaPage />} />
                <Route path="/live/:type/:id" element={<LiveRoomPage />} />
                <Route path="/shorts" element={<ShortsPage />} />
                <Route path="/you" element={<YouPage />} />
                <Route path="/ai-search" element={<AISearchPage />} />
              </Routes>
              <PipPlayer />
              <GlobalModal />
            </PlayerProvider> 
          </HashRouter>
          <ToastContainer />
      </ProfileProvider>
    </LanguageProvider>
  );
};

export default App;
