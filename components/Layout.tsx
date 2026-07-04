import React, { useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useProfile } from '../contexts/ProfileContext';
import { useTranslation } from '../contexts/LanguageContext';
import { useAddons } from '../addons/AddonContext';

const TopNavbar: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeProfile, switchProfile } = useProfile();
  const { tabs: addonTabs } = useAddons();

  const navLinks = [
    { to: '/home', text: t('home') },
    { to: '/tv', text: t('tvShows') },
    { to: '/movies', text: t('movies') },
    { to: '/iptv', text: t('liveTv') },
    { to: '/favorites', text: t('myList') },
  ];

  const navItemClasses = "transition-all duration-200 py-2 px-4 rounded-full focusable text-zinc-300 hover:text-white";
  const activeNavItemClasses = "text-black bg-white font-semibold";


  return (
    <header className={`absolute top-0 w-full z-40 flex items-center h-20 px-4 md:px-10 bg-transparent`}>
      {/* Left Side: Avatar */}
      <div className="flex-shrink-0">
        <div 
            className="flex items-center gap-2 cursor-pointer focusable rounded-full p-1" 
            onClick={switchProfile}
            onKeyDown={(e) => e.key === 'Enter' && switchProfile()}
            tabIndex={0}
        >
          {activeProfile && (
            <img src={activeProfile.avatar} alt={activeProfile.name} className="w-9 h-9 rounded-md object-cover" />
          )}
          <i className="fas fa-caret-down text-white text-sm"></i>
        </div>
      </div>

      {/* Center: Search + Nav */}
      <div className="flex-1 flex justify-center items-center">
        <nav className="hidden md:flex items-center gap-6 text-base">
          <button onClick={() => navigate('/search')} aria-label={t('search')} className="text-2xl text-zinc-100 hover:text-white transition-colors focusable rounded-full w-12 h-12 flex items-center justify-center">
            <i className="fas fa-search"></i>
          </button>
          
          <NavLink to="/home" className={({isActive}) => `${navItemClasses} ${isActive ? activeNavItemClasses : ''}`}>{t('home')}</NavLink>
          <NavLink to="/tv" className={({isActive}) => `${navItemClasses} ${isActive ? activeNavItemClasses : ''}`}>{t('tvShows')}</NavLink>
          <NavLink to="/movies" className={({isActive}) => `${navItemClasses} ${isActive ? activeNavItemClasses : ''}`}>{t('movies')}</NavLink>
          <NavLink to="/iptv" className={({isActive}) => `${navItemClasses} ${isActive ? activeNavItemClasses : ''}`}>{t('liveTv')}</NavLink>
          <NavLink to="/ai-search" className={({isActive}) => `${navItemClasses} ${isActive ? activeNavItemClasses : ''}`}>{t('aiSearch')}</NavLink>
          
          <NavLink to="/favorites" className={({isActive}) => `${navItemClasses} ${isActive ? activeNavItemClasses : ''}`}>{t('myList')}</NavLink>

          {/* Addon-registered tabs */}
          {addonTabs.map(tab => (
            <NavLink key={tab.route} to={tab.route} className={({isActive}) => `${navItemClasses} ${isActive ? activeNavItemClasses : ''}`}>
              <i className={`${tab.icon} mr-1.5 text-sm`}></i>{tab.title}
            </NavLink>
          ))}

          {/* Addon manager intentionally not shown in the header — users are
              guided to their personal PC Studio via a neutral tip modal. */}
        </nav>
      </div>

      {/* Right Side: Search on mobile + N icon */}
      <div className="flex-shrink-0 flex items-center gap-3">
        <button 
          onClick={() => navigate('/search')} 
          aria-label={t('search')} 
          className="md:hidden text-xl text-zinc-100 hover:text-white transition-colors focusable rounded-full w-10 h-10 flex items-center justify-center"
        >
          <i className="fas fa-search"></i>
        </button>
        <img 
          src="https://i.ibb.co/Vc2jxqRR/Chat-GPT-Image-Jul-1-2026-01-37-52-PM.png" 
          alt="Logo" 
          className="w-14 h-15 object-contain" 
        />
      </div>
    </header>
  );
};

const BottomNavbar: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const { tabs: addonTabs } = useAddons();
  const firstAddonTab = addonTabs[0];

  const navLinks = [
    { to: '/home', text: t('home'), icon: 'fa-solid fa-house' },
    { to: '/tv', text: t('tvShows'), icon: 'fa-solid fa-tv' },
    { to: '/movies', text: t('movies'), icon: 'fa-solid fa-film' },
    { to: '/iptv', text: t('liveTv'), icon: 'fa-solid fa-broadcast-tower' },
    { to: '/ai-search', text: t('aiSearch'), icon: 'fa-solid fa-wand-magic-sparkles' },
    { to: '/favorites', text: t('myList'), icon: 'fa-solid fa-bookmark' },
    firstAddonTab
      ? { to: firstAddonTab.route, text: firstAddonTab.title, icon: firstAddonTab.icon }
      : { to: '/addons', text: t('addons'), icon: 'fa-solid fa-puzzle-piece' },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-md border-t border-zinc-800 px-2 py-1 flex justify-around items-center h-16 safe-bottom">
      {navLinks.map((link) => {
        const isActive = location.pathname === link.to;
        return (
          <NavLink
            key={link.to}
            to={link.to}
            className={`flex flex-col items-center justify-center flex-1 py-1 text-[10px] transition-all duration-200 focusable ${
              isActive ? 'text-white font-bold scale-105' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <i className={`${link.icon} text-lg mb-1 ${isActive ? 'text-red-600' : ''}`}></i>
            <span className="truncate max-w-[70px]">{link.text}</span>
          </NavLink>
        );
      })}
    </nav>
  );
};


const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activeProfile, isKidsMode } = useProfile();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!activeProfile) {
      navigate('/', { replace: true });
    }
  }, [activeProfile, navigate]);

  useEffect(() => {
    // Keep kids mode visually same as normal mode
    document.body.classList.remove('kids-mode-bg');
  }, [isKidsMode]);

  if (!activeProfile) {
    return null; 
  }

  const noLayout = location.pathname.startsWith('/player');

  if (noLayout) {
      return <>{children}</>
  }

  return (
    <div className="min-h-screen text-[var(--text-light)] bg-transparent transition-colors duration-300 relative">
      <div 
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[100vw] max-w-[1200px] h-[600px] opacity-0 animate-top-light pointer-events-none z-[-1]"
        style={{
          background: 'radial-gradient(ellipse at top, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0) 70%)'
        }}
      ></div>
      <TopNavbar />
      <main key={location.pathname} className={`pb-20 md:pb-12`}>
        {children}
      </main>
      <BottomNavbar />
    </div>
  );
};

export default Layout;
