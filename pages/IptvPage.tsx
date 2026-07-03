import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { iptvCategories, parseM3u, IptvChannel, IptvCategory, getProxiedStreamUrl } from '../services/iptvService';
import { useTranslation } from '../contexts/LanguageContext';

const HERO_ROTATION_INTERVAL_MS = 10 * 1000;

interface HeroSlide {
  backdropUrl: string;
  logoUrl: string | null;
  titleText: string;
  badge: string;
  metaParts: string[];
  ratingBadge: string;
  channel?: IptvChannel;
}

const iptvHeroSlides: HeroSlide[] = [
  {
    backdropUrl: "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?q=80&w=2805&auto=format&fit=crop", 
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/NFL_Network_logo.svg/1200px-NFL_Network_logo.svg.png", 
    titleText: "NFL Network",
    badge: "LIVE SPORTS",
    metaParts: ["Live", "Football", "HD", "Sports"],
    ratingBadge: "TV-14",
    channel: {
      id: 'nfl-network-fallback',
      name: 'NFL Network',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/NFL_Network_logo.svg/1200px-NFL_Network_logo.svg.png',
      streamUrl: 'https://fcc39b56.live.swagit.com/live/live/chunklist.m3u8',
      group: 'Sports'
    }
  },
  {
    backdropUrl: "https://images.unsplash.com/photo-1489944440615-453fc2b6a9a9?q=80&w=2682&auto=format&fit=crop", 
    logoUrl: "https://upload.wikimedia.org/wikipedia/en/thumb/5/50/Sky_Sports_logo_2020.svg/1200px-Sky_Sports_logo_2020.svg.png",
    titleText: "Sky Sports",
    badge: "LIVE SPORTS",
    metaParts: ["Live", "Premier League", "UK", "4K"],
    ratingBadge: "TV-G",
    channel: {
      id: 'sky-sports-fallback',
      name: 'Sky Sports',
      logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/5/50/Sky_Sports_logo_2020.svg/1200px-Sky_Sports_logo_2020.svg.png',
      streamUrl: 'https://fcc39b56.live.swagit.com/live/live/chunklist.m3u8',
      group: 'Sports'
    }
  },
  {
    backdropUrl: "https://images.unsplash.com/photo-1518605368461-1e1e38ce713a?q=80&w=2787&auto=format&fit=crop", 
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/BeIN_Sports_Logo.svg/1200px-BeIN_Sports_Logo.svg.png",
    titleText: "beIN Sports",
    badge: "LIVE SPORTS",
    metaParts: ["Live", "Global", "HD"],
    ratingBadge: "TV-G",
    channel: {
      id: 'bein-sports-fallback',
      name: 'beIN Sports',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/BeIN_Sports_Logo.svg/1200px-BeIN_Sports_Logo.svg.png',
      streamUrl: 'https://fcc39b56.live.swagit.com/live/live/chunklist.m3u8',
      group: 'Sports'
    }
  }
];

const Hero: React.FC<{ slide: HeroSlide; onPlay: () => void }> = ({ slide, onPlay }) => {
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    setLogoFailed(false);
  }, [slide.logoUrl]);

  return (
    <div className="relative w-full h-[70vh] min-h-[300px] text-white overflow-hidden rounded-xl">
      <style>{`@keyframes heroBackdropFade { from { opacity: 0; } to { opacity: 1; } }`}</style>
      <img
        key={slide.backdropUrl}
        src={slide.backdropUrl}
        alt={slide.titleText}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ animation: "heroBackdropFade 1s ease-in-out" }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[var(--background)]/80 via-transparent to-transparent"></div>
      <div className="absolute inset-0 bg-gradient-to-r from-black to-transparent"></div>
      <div className="absolute inset-0 bg-gradient-to-l from-[var(--background)]/50 to-transparent"></div>

      {/* Large transparent watermark channel logo in the upper right corner */}
      {slide.logoUrl && (
        <div className="absolute top-8 right-2 md:top-8 md:right-4 opacity-15 pointer-events-none select-none z-10">
          <img
            src={slide.logoUrl}
            alt=""
            className="w-48 h-48 md:w-[450px] md:h-[450px] object-contain"
            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
          />
        </div>
      )}

      <div className="relative z-10 flex flex-col justify-end h-full px-4 md:px-10 pb-20">
        <div key={slide.titleText} className="max-w-xl animate-hero-content-in">
          <div className="flex items-center gap-2 mb-3">
            <span
              className={`text-xl font-black text-red-600`}
              style={{ fontFamily: "'Anton', sans-serif" }}
            >
              V
            </span>
            <span className="text-sm font-semibold tracking-[0.2em] text-zinc-200 uppercase">
              {slide.badge}
            </span>
          </div>

          <div className="flex items-center gap-4 mb-4 flex-wrap">
            {slide.logoUrl && !logoFailed ? (
              <img
                src={slide.logoUrl}
                alt={slide.titleText}
                className="h-20 md:h-28 max-w-[280px] md:max-w-[400px] object-contain drop-shadow-lg"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <h1
                className="text-4xl md:text-6xl font-black drop-shadow-lg uppercase"
                style={{ fontFamily: "'Anton', sans-serif" }}
              >
                {slide.titleText}
              </h1>
            )}
          </div>

          <div
            className="flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-zinc-200"
            style={{ textShadow: "1px 1px 2px rgba(0,0,0,0.7)" }}
          >
            {slide.metaParts.map((part, i) => (
              <React.Fragment key={`${part}-${i}`}>
                {i > 0 && <span>•</span>}
                <span>{part}</span>
              </React.Fragment>
            ))}
            <span>•</span>
            <span className="px-2 py-0.5 border border-zinc-400 text-sm rounded">
              {slide.ratingBadge}
            </span>
          </div>
          <div className="flex gap-4 mt-8">
            <button 
              onClick={onPlay}
              className="focusable hero-action-btn flex items-center justify-center gap-2 bg-[#E50914] hover:bg-[#b8070f] text-white px-8 py-2.5 rounded-full font-bold text-lg transition-transform duration-200"
            >
              <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse mr-1" />
              Live Now
            </button>
            <button className="focusable hero-action-btn flex items-center justify-center gap-2 bg-zinc-800/80 hover:bg-zinc-700 text-white px-8 py-2.5 rounded-full font-bold text-lg backdrop-blur-md transition-transform duration-200 border border-zinc-600/50">
              More Info
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const IptvCard: React.FC<{
  channel: IptvChannel;
  onCardFocus: (element: HTMLElement) => void;
  index: number;
  onClick: () => void;
}> = ({ channel, onCardFocus, index, onClick }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [imgError, setImgError] = useState(false);

  const handleFocus = useCallback(() => {
    if (cardRef.current) {
      onCardFocus(cardRef.current);
    }
  }, [onCardFocus]);

  return (
    <div
      ref={cardRef}
      className="flex-shrink-0 w-[24vw] min-w-[220px] max-w-[320px] cursor-pointer focusable group interactive-card-container"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      onFocus={handleFocus}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="relative transition-all duration-300 ease-in-out transform bg-zinc-900 rounded-lg overflow-hidden shadow-lg group-hover:shadow-2xl aspect-video flex flex-col items-center justify-center p-4 interactive-card border border-transparent">
        <div 
          className="absolute inset-0 bg-zinc-900 overflow-hidden"
          style={{
            WebkitMaskImage: 'repeating-linear-gradient(-35deg, black 0%, black 22%, transparent 22%, transparent 25%)',
            maskImage: 'repeating-linear-gradient(-35deg, black 0%, black 22%, transparent 22%, transparent 25%)'
          }}
        >
          {!imgError && channel.logo && (
            <div 
              className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-60 blur-md scale-110 group-hover:opacity-80 transition-opacity duration-300"
              style={{ backgroundImage: `url(${channel.logo})` }}
            />
          )}
          <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors duration-300" />
        </div>

        {!imgError && channel.logo ? (
          <img
            src={channel.logo}
            alt={channel.name}
            onError={() => setImgError(true)}
            className="w-3/5 h-3/5 object-contain relative z-10 opacity-90 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)]"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-center relative z-10">
            <i className="fa-solid fa-satellite-dish text-4xl text-amber-500 mb-2 group-hover:animate-bounce drop-shadow-[0_5px_10px_rgba(0,0,0,0.8)]"></i>
            <span className="font-bold text-white tracking-wider text-sm drop-shadow-[0_2px_5px_rgba(0,0,0,0.8)]">
              {channel.name}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

const CategoryRow: React.FC<{ 
  category: IptvCategory; 
  zIndex?: number; 
  onPlayChannel: (channel: IptvChannel, channels: IptvChannel[], index: number) => void 
}> = ({ category, zIndex, onPlayChannel }) => {
  const [channels, setChannels] = useState<IptvChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const rowContentRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "1000px", threshold: 0.1 } 
    );
    if (rowRef.current) observer.observe(rowRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isInView && !hasFetched) {
      setHasFetched(true);
      setLoading(true);
      
      let urlToFetch = category.url;
      urlToFetch = `/api/m3u-proxy?url=${encodeURIComponent(urlToFetch)}&limit=60`;
      
      fetch(urlToFetch)
        .then(res => res.text())
        .then(text => {
          const parsed = parseM3u(text, 60);
          setChannels(parsed.slice(0, 40));
          setLoading(false);
        })
        .catch(err => {
          console.error('Error fetching category', category.name, err);
          setLoading(false);
        });
    }
  }, [isInView, hasFetched, category]);

  const handleCardFocus = useCallback((cardElement: HTMLElement) => {
    if (!scrollContainerRef.current || !rowContentRef.current) return;
    const containerWidth = scrollContainerRef.current.clientWidth;
    const contentWidth = rowContentRef.current.scrollWidth;
    const padding = 24;
    let targetScroll = cardElement.offsetLeft - padding;
    const maxScroll = contentWidth - containerWidth;
    if (targetScroll > maxScroll) targetScroll = maxScroll;
    if (targetScroll < 0) targetScroll = 0;
    if (rowContentRef.current)
      rowContentRef.current.style.transform = `translateX(${-targetScroll}px)`;
  }, []);

  if (hasFetched && channels.length === 0 && !loading) return null;

  return (
    <div
      ref={rowRef}
      className={`content-row ${isInView ? "is-in-view" : ""}`}
      style={{ zIndex, minHeight: '200px' }}
    >
      <div className="flex items-baseline justify-between mb-3 px-6">
        <h2 className="text-lg md:text-xl font-bold text-white transition-all duration-300 ease-out origin-left scale-100">
          {category.name}
        </h2>
      </div>
      <div
        ref={scrollContainerRef}
        className="overflow-x-hidden no-scrollbar py-4"
      >
        <div
          ref={rowContentRef}
          className="flex flex-nowrap gap-x-6 px-6"
          style={{
            transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
            willChange: "transform",
          }}
        >
          {loading ? (
             <div className="flex gap-x-6">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="flex-shrink-0 w-[24vw] min-w-[220px] max-w-[320px] aspect-video bg-zinc-800/50 rounded-lg skeleton"></div>
                ))}
             </div>
          ) : (
            channels.map((channel, index) => (
              <IptvCard
                key={channel.id}
                channel={channel}
                onCardFocus={handleCardFocus}
                index={index}
                onClick={() => onPlayChannel(channel, channels, index)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const IptvPage: React.FC = () => {
  const navigate = useNavigate();
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>(iptvHeroSlides);
  const [heroIndex, setHeroIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(4);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement;
      if (!activeEl) return;

      if (e.key === 'ArrowDown') {
        if (activeEl.closest('header')) {
          const firstHeroBtn = document.querySelector('.hero-action-btn') as HTMLElement;
          if (firstHeroBtn) {
            e.preventDefault();
            firstHeroBtn.focus();
          }
        }
      } else if (e.key === 'ArrowUp') {
        if (activeEl.closest('.hero-action-btn')) {
          const headerLinks = Array.from(document.querySelectorAll('header .focusable:not([disabled])')) as HTMLElement[];
          if (headerLinks.length > 0) {
            e.preventDefault();
            let bestLink = headerLinks[0];
            let minDx = Infinity;
            const btnRect = activeEl.getBoundingClientRect();
            for (const link of headerLinks) {
              const rect = link.getBoundingClientRect();
              const dx = Math.abs((rect.left + rect.width / 2) - (btnRect.left + btnRect.width / 2));
              if (dx < minDx) {
                minDx = dx;
                bestLink = link;
              }
            }
            bestLink.focus();
          }
        }
      }
    };
    
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  const handlePlayChannel = useCallback((channel: IptvChannel, channels: IptvChannel[], index: number) => {
    const proxiedChannels = channels.map(c => ({
      ...c,
      streamUrl: getProxiedStreamUrl(c.streamUrl)
    }));

    const state = {
      item: { id: channel.id, name: channel.name, title: channel.name, logo: channel.logo },
      streamUrl: getProxiedStreamUrl(channel.streamUrl),
      liveChannels: proxiedChannels,
      currentChannelIndex: index,
      logo: channel.logo,
      hideLogo: channel.group === 'Main (Ugeen)' || channels.some(c => c.group === 'Main (Ugeen)'),
      needsProxy: false,
    };
    
    if (channel.playerType === 'iframe') {
      navigate('/iframe-player', { state });
    } else {
      navigate('/player', { state: { ...state, type: 'movie' } });
    }
  }, [navigate]);

  useEffect(() => {
    const loadHeroSlides = async () => {
      try {
        const proxiedUrl = `/api/m3u-proxy?url=${encodeURIComponent('https://iptv-org.github.io/iptv/categories/sports.m3u')}&limit=100`;
        const response = await fetch(proxiedUrl);
        if (response.ok) {
          const text = await response.text();
          const parsed = parseM3u(text, 100);
          const validChannels = parsed.filter(c => c.logo && c.streamUrl);
          if (validChannels.length >= 3) {
            const shuffled = [...validChannels].sort(() => 0.5 - Math.random());
            const picked = shuffled.slice(0, 3);
            
            const backdrops = [
              "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?q=80&w=2805&auto=format&fit=crop",
              "https://images.unsplash.com/photo-1489944440615-453fc2b6a9a9?q=80&w=2682&auto=format&fit=crop",
              "https://images.unsplash.com/photo-1518605368461-1e1e38ce713a?q=80&w=2787&auto=format&fit=crop"
            ];
            
            const dynamicSlides: HeroSlide[] = picked.map((channel, idx) => ({
              backdropUrl: backdrops[idx % backdrops.length],
              logoUrl: channel.logo,
              titleText: channel.name,
              badge: "LIVE SPORTS",
              metaParts: ["Live", channel.group || "Sports", "HD", "TV-14"],
              ratingBadge: "TV-14",
              channel: channel
            }));
            
            setHeroSlides(dynamicSlides);
          }
        }
      } catch (err) {
        console.error("Failed to load IPTV channels for hero slider, using defaults:", err);
      }
    };
    
    loadHeroSlides();
  }, []);

  useEffect(() => {
    if (heroSlides.length === 0) return;
    const timer = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroSlides.length);
    }, HERO_ROTATION_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [heroSlides.length]);

  return (
    <Layout>
      <div className="pb-20 min-h-screen text-white bg-[var(--background)]">
        <div className="px-4 md:px-10 pt-24">
          {heroSlides[heroIndex] && (
            <Hero 
              slide={heroSlides[heroIndex]} 
              onPlay={() => {
                const currentSlide = heroSlides[heroIndex];
                if (currentSlide && currentSlide.channel) {
                  handlePlayChannel(currentSlide.channel, [currentSlide.channel], 0);
                }
              }}
            />
          )}
          
          <div className="relative z-10 space-y-12 mt-12">
            {iptvCategories.slice(0, visibleCount).map((category, index) => (
              <CategoryRow
                key={category.name}
                category={category}
                zIndex={50 - index}
                onPlayChannel={handlePlayChannel}
              />
            ))}
          </div>
          {visibleCount < iptvCategories.length && (
            <div className="flex justify-center mt-12 mb-8 relative z-10">
              <button 
                onClick={() => setVisibleCount(prev => prev + 4)}
                onKeyDown={(e) => e.key === 'Enter' && setVisibleCount(prev => prev + 4)}
                className="focusable flex items-center justify-center gap-2 bg-zinc-800/80 hover:bg-zinc-700 text-white font-bold py-3 px-8 rounded-full border border-zinc-600 transition-colors"
              >
                <i className="fa-solid fa-chevron-down"></i> Show More
              </button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default IptvPage;
