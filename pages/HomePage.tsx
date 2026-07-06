import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useNavigate } from "react-router-dom";
import { fetchFromTMDB } from "../services/apiService";
import { Movie, YTPlayer, HistoryItem } from "../types";
import { useProfile } from "../contexts/ProfileContext";
import { useTranslation } from "../contexts/LanguageContext";
import Layout from "../components/Layout";
import {
  IMAGE_BASE_URL,
  BACKDROP_SIZE,
  BACKDROP_SIZE_MEDIUM,
  POSTER_SIZE,
} from "../contexts/constants";
import { fetchRandomCategoryChannels, IptvChannel, getProxiedStreamUrl } from "../services/iptvService";
import { LatestAddonsRow } from "../addons/AddonComponents";
import { useAddons } from "../addons/AddonContext";

const AmbientBackground: React.FC<{ imageUrl: string | null }> = ({
  imageUrl,
}) => {
  const [displayImage, setDisplayImage] = useState<string | null>(imageUrl);
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    if (imageUrl === displayImage) {
      if (imageUrl && opacity === 0) {
        setOpacity(0.30);
      }
      return;
    }

    if (imageUrl) {
      if (displayImage) {
        setOpacity(0);
        const timer = setTimeout(() => {
          setDisplayImage(imageUrl);
          setOpacity(0.30);
        }, 150);
        return () => clearTimeout(timer);
      } else {
        setDisplayImage(imageUrl);
        const timer = setTimeout(() => {
          setOpacity(0.30);
        }, 50);
        return () => clearTimeout(timer);
      }
    } else {
      setOpacity(0);
      const timer = setTimeout(() => {
        setDisplayImage(null);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [imageUrl, displayImage, opacity]);

  if (!displayImage) return null;

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-[var(--background)]">
      <div
        className="absolute -top-[10%] -right-[10%] w-[65vw] h-[65vw] max-w-[700px] max-h-[700px] rounded-full overflow-hidden pointer-events-none transition-opacity duration-500 ease-in-out"
        style={{
          opacity: opacity,
          filter: "blur(45px) saturate(1.4)", // Reduced blur radius from 80px to 45px for optimal rendering speed
          transform: "translate3d(0, 0, 0)", // GPU hardware acceleration
          willChange: "opacity",
        }}
      >
        <img
          src={displayImage}
          alt=""
          className="w-full h-full object-cover pointer-events-none"
        />
      </div>

      {/* Background gradients for excellent reading contrast & blending */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--background)]/75 to-[var(--background)] pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-r from-[var(--background)] via-[var(--background)]/40 to-transparent pointer-events-none" />
    </div>
  );
};

const HERO_ROTATION_INTERVAL_MS = 30 * 1000; // Rotate hero slide every 30 seconds

// The rotation cycle is anchored to a persistent epoch so leaving and
// re-entering the page NEVER restarts the loop — it just keeps ticking
// every 30 seconds and wraps back to the first slide when it reaches the end.
const getHeroRotationEpoch = (): number => {
  try {
    const stored = sessionStorage.getItem("heroRotationEpoch");
    if (stored) return Number(stored);
    const now = Date.now();
    sessionStorage.setItem("heroRotationEpoch", String(now));
    return now;
  } catch {
    return 0;
  }
};

const computeHeroIndex = (slideCount: number): number => {
  if (slideCount <= 0) return 0;
  const elapsed = Math.max(0, Date.now() - getHeroRotationEpoch());
  return Math.floor(elapsed / HERO_ROTATION_INTERVAL_MS) % slideCount;
};

interface HeroSlide {
  backdropUrl: string;
  logoUrl: string | null;
  titleText: string;
  badge: string;
  metaParts: string[];
  ratingBadge: string;
  comingSoonText?: string;
}

const REGULAR_DEFAULT_SLIDE: HeroSlide = {
  backdropUrl:
    "https://images.squarespace-cdn.com/content/v1/56a1633ac21b86f80ddeacb4/106a6346-2ebd-4353-8bb4-b8a5e32320b2/squid+game+2+banner.jpg",
  logoUrl: "https://i.ibb.co/B5PW9wnh/pngimg-com-squid-game-PNG35-1.png",
  titleText: "Squid Game",
  badge: "SERIES",
  metaParts: ["Show", "Thriller", "2025", "3 seasons"],
  ratingBadge: "TV-MA",
  comingSoonText: "Coming June 27",
};

const KIDS_DEFAULT_SLIDE: HeroSlide = {
  backdropUrl:
    "https://theithacan.org/wp-content/uploads/2024/03/Kung-Fu-Pnda-4.jpg",
  logoUrl: "https://i.ibb.co/q36NtJNT/sad.png",
  titleText: "Kung Fu Panda 4",
  badge: "MOVIE",
  metaParts: ["Movie", "Animation", "2024", "1h 34m"],
  ratingBadge: "PG",
};

const Hero: React.FC<{ slide: HeroSlide; isKids: boolean }> = ({
  slide,
  isKids,
}) => {
  const accentClass = isKids ? "text-blue-500" : "text-red-600";

  return (
    <div className="relative w-full h-[78vh] min-h-[400px] text-white overflow-hidden rounded-xl">
      <style>{`@keyframes heroBackdropFade { from { opacity: 0; } to { opacity: 1; } }`}</style>
      <img
        key={slide.backdropUrl}
        src={slide.backdropUrl}
        alt={slide.titleText}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ animation: "heroBackdropFade 1s ease-in-out" }}
      />
      {/* Gradients for readability and cinematic effect */}
      <div className="absolute inset-0 bg-gradient-to-t from-[var(--background)]/80 via-transparent to-transparent"></div>
      <div className="absolute inset-0 bg-gradient-to-r from-black to-transparent"></div>
      <div className="absolute inset-0 bg-gradient-to-l from-[var(--background)]/50 to-transparent"></div>

      <div className="relative z-10 flex flex-col justify-end h-full px-4 md:px-10 pb-20">
        <div key={slide.titleText} className="max-w-xl animate-hero-content-in">
          <div className="flex items-center gap-2 mb-3">
            <span
              className={`text-xl font-black ${accentClass}`}
              style={{ fontFamily: "'Anton', sans-serif" }}
            >
              N
            </span>
            <span className="text-sm font-semibold tracking-[0.2em] text-zinc-200 uppercase">
              {slide.badge}
            </span>
          </div>
          {slide.logoUrl ? (
            <img
              src={slide.logoUrl}
              alt={`${slide.titleText} Title`}
              className="w-full max-w-md md:max-w-lg max-h-52 object-contain object-left drop-shadow-lg mb-4"
            />
          ) : (
            <h1
              className="text-4xl md:text-6xl font-black drop-shadow-lg mb-4 uppercase"
              style={{ fontFamily: "'Anton', sans-serif" }}
            >
              {slide.titleText}
            </h1>
          )}
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
        </div>
      </div>

      {slide.comingSoonText && (
        <div className="absolute bottom-10 right-10 z-10">
          <div className="flex items-center gap-2 bg-black/50 px-3 py-2 rounded-md text-sm font-semibold backdrop-blur-sm">
            <i className="far fa-calendar-alt"></i>
            <span>{slide.comingSoonText}</span>
          </div>
        </div>
      )}
    </div>
  );
};
const PosterCard: React.FC<{
  movie: Movie;
  onCardClick: (movie: Movie) => void;
  isNetflixOriginal?: boolean;
  isRecentlyAdded?: boolean;
  onCardFocus: (element: HTMLElement) => void;
  index: number;
  isContinueWatching?: boolean;
  onItemFocus?: () => void;
}> = ({
  movie,
  onCardClick,
  isNetflixOriginal,
  isRecentlyAdded,
  onCardFocus,
  index,
  isContinueWatching = false,
  onItemFocus,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isYtApiReady, isKidsMode } = useProfile();
  const type = movie.media_type || (movie.title ? "movie" : "tv");

  const [showVideo, setShowVideo] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const playerRef = useRef<YTPlayer | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playerContainerId = useMemo(
    () =>
      `poster-player-${movie.id}-${Math.random().toString(36).substring(2)}`,
    [movie.id],
  );

  const [isFocused, setIsFocused] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    onItemFocus?.();
    if (cardRef.current) {
      onCardFocus(cardRef.current);
    }
  }, [onCardFocus, onItemFocus]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  if (isContinueWatching) {
    const progressPercent =
      movie.duration && movie.currentTime && movie.duration > 0
        ? (movie.currentTime / movie.duration) * 100
        : 0;

    const { mainTitle, secondaryText } = useMemo(() => {
      const title = movie.title || movie.name || "";
      const titleParts = title.split(": S");
      if (titleParts.length > 1) {
        // It's a series
        const main = titleParts[0];
        const seasonEpisodePart = "S" + titleParts[1];
        const seasonMatch = seasonEpisodePart.match(/S(\d+)/);
        const episodeMatch = seasonEpisodePart.match(/E(\d+)/);
        if (seasonMatch && episodeMatch) {
          const secondary = `S${seasonMatch[1]} Ep ${episodeMatch[1]} • Resume`;
          return { mainTitle: main, secondaryText: secondary };
        }
      }
      // It's a movie, or parsing failed
      return {
        mainTitle: title.split(": S")[0],
        secondaryText: "Resume on Netflix",
      };
    }, [movie.title, movie.name]);

    if (!movie.backdrop_path) return null;

    return (
      <div
        ref={cardRef}
        className="flex-shrink-0 w-[24vw] min-w-[220px] max-w-[320px] cursor-pointer focusable continue-watching-card-wrapper"
        tabIndex={0}
        onClick={() => onCardClick(movie)}
        onKeyDown={(e) => e.key === "Enter" && onCardClick(movie)}
        onFocus={handleFocus}
        onMouseEnter={() => onItemFocus?.()}
        onBlur={handleBlur}
        style={{ animationDelay: `${index * 50}ms` }}
      >
        <div className={`relative overflow-hidden transition-all duration-300 ease-in-out transform rounded-lg shadow-lg bg-[var(--surface)] group hover:scale-105 hover:shadow-2xl ${isKidsMode ? 'golden-worm-border' : ''}`}>
          <div className={`relative w-full aspect-video bg-black ${isKidsMode ? 'golden-worm-border-inner' : ''}`}>
            <img
              src={`${IMAGE_BASE_URL}${BACKDROP_SIZE_MEDIUM}${movie.backdrop_path}`}
              alt={mainTitle}
              className={`object-cover w-full h-full`}
              loading="lazy"
            decoding="async"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none"></div>

            <div className="absolute bottom-0 left-0 right-0 px-3 pb-1.5 pointer-events-none">
              <div className="h-1.5 bg-zinc-600/80 rounded-full">
                <div
                  className="h-full bg-white rounded-full"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
            </div>

            <div className="absolute bottom-4 left-3 text-white text-xs font-medium uppercase tracking-wider drop-shadow-md pointer-events-none">
              {t("resume")}
            </div>
          </div>
        </div>
        <div className="mt-3 text-left min-h-[2.5rem]">
          <p
            className={`text-sm font-semibold text-white truncate drop-shadow-lg transition-all duration-200 ease-in-out overflow-hidden ${isFocused ? "max-h-6 opacity-100" : "max-h-0 opacity-0"}`}
          >
            {mainTitle}
          </p>
          <p className={`text-xs text-zinc-400 truncate`}>{secondaryText}</p>
        </div>
      </div>
    );
  }

  const handleMouseEnter = useCallback(() => {
    onItemFocus?.();
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      // A simple querySelector check to ensure the element is still hovered by the user
      // when the timeout fires, preventing the video from playing if the user quickly hovers away.
      if (
        document.querySelector(
          `.interactive-card-container[data-movie-id='${movie.id}']:hover`,
        )
      ) {
        setShowVideo(true);
      }
    }, 7000); // 7-second delay as requested
  }, [movie.id]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setShowVideo(false);
  }, []);

  useEffect(() => {
    // If we shouldn't show the video, or the YouTube API isn't ready,
    // ensure any existing player is destroyed and exit early.
    if (!showVideo || !isYtApiReady) {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      return;
    }

    const initPlayer = (videoId: string) => {
      if (document.getElementById(playerContainerId) && !playerRef.current) {
        playerRef.current = new window.YT.Player(playerContainerId, {
          videoId: videoId,
          playerVars: {
            autoplay: 1,
            controls: 0,
            rel: 0,
            loop: 1,
            playlist: videoId,
            playsinline: 1,
            modestbranding: 1,
            iv_load_policy: 3,
            fs: 0,
            start: 5,
          },
          events: {
            onReady: (event) => {
              playerRef.current = event.target;
              event.target.mute();
              setIsMuted(true);
              event.target.playVideo();
            },
          },
        });
      }
    };

    const fetchTrailerAndInit = async () => {
      try {
        const videos = await fetchFromTMDB(`/${type}/${movie.id}/videos`);
        const trailer = videos.results.find(
          (v: any) => v.type === "Trailer" && v.site === "YouTube",
        );
        initPlayer(trailer ? trailer.key : "mF428AFx9gY"); // Fallback video
      } catch {
        initPlayer("mF428AFx9gY"); // Fallback video
      }
    };

    fetchTrailerAndInit();

    // Cleanup function: this is crucial to remove the player when the component
    // is unhovered or unmounts, preventing memory leaks.
    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [showVideo, movie.id, type, playerContainerId, isYtApiReady]);

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const player = playerRef.current;
    if (!player?.isMuted) return;

    if (player.isMuted()) {
      player.unMute();
      setIsMuted(false);
    } else {
      player.mute();
      setIsMuted(true);
    }
  }, []);

  if (!movie.backdrop_path) return null;

  return (
    <div
      ref={cardRef}
      className="interactive-card-container relative flex-shrink-0 w-[24vw] min-w-[220px] max-w-[320px] cursor-pointer focusable"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      data-movie-id={movie.id}
      tabIndex={0}
      onClick={() => onCardClick(movie)}
      onKeyDown={(e) => e.key === "Enter" && onCardClick(movie)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className={`relative overflow-hidden transition-all duration-300 ease-in-out transform rounded-lg shadow-lg bg-[var(--surface)] interactive-card ${isKidsMode ? 'golden-worm-border' : ''}`}>
        <div className={isKidsMode ? 'golden-worm-border-inner' : 'w-full h-full'}>
        {isNetflixOriginal && (
          <span
            style={{
              fontFamily: "'Anton', sans-serif",
              textShadow: "1px 1px 3px rgba(0,0,0,0.5)",
            }}
            className="absolute top-2 left-2 z-10 text-3xl font-black text-[var(--primary)] pointer-events-none"
          >
            N
          </span>
        )}
        <div className="relative w-full aspect-video bg-black">
          <img
            src={`${IMAGE_BASE_URL}${BACKDROP_SIZE_MEDIUM}${movie.backdrop_path}`}
            alt={movie.title || movie.name}
            className={`object-cover w-full h-full absolute inset-0 transition-opacity duration-700 ${showVideo ? "opacity-0" : "opacity-100"}`}
            loading="lazy"
            decoding="async"
          />
          <div
            className={`absolute inset-0 w-full h-full transition-opacity duration-700 ${showVideo ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          >
            <div
              id={playerContainerId}
              className="w-full h-full pointer-events-none"
            />
            {/* Transparent overlay to intercept clicks and prevent interaction with the YouTube player UI */}
            <div className="absolute inset-0" />
            {showVideo && (
              <div className="absolute bottom-2 right-2 z-10">
                <button
                  onClick={toggleMute}
                  className="w-8 h-8 border-2 border-white/50 rounded-full text-white/80 hover:border-white hover:text-white transition-colors text-sm flex items-center justify-center bg-black/50"
                >
                  <i
                    className={`fa-solid ${isMuted ? "fa-volume-xmark" : "fa-volume-high"}`}
                  ></i>
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="quick-view bg-[var(--surface)] px-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  navigate("/player", { state: { item: movie, type } })
                }
                className="w-9 h-9 flex items-center justify-center text-black bg-white rounded-full text-lg btn-press"
              >
                <i className="fas fa-play"></i>
              </button>
              <button className="w-9 h-9 flex items-center justify-center text-white border-2 border-zinc-500 rounded-full text-lg btn-press hover:border-white">
                <i className="fas fa-plus"></i>
              </button>
              <button className="w-9 h-9 flex items-center justify-center text-white border-2 border-zinc-500 rounded-full text-lg btn-press hover:border-white">
                <i className="far fa-thumbs-up"></i>
              </button>
            </div>
            <button
              onClick={() => onCardClick(movie)}
              className="w-9 h-9 flex items-center justify-center text-white border-2 border-zinc-500 rounded-full text-lg btn-press hover:border-white"
            >
              <i className="fas fa-chevron-down"></i>
            </button>
          </div>
          <div className="flex items-center flex-wrap gap-2 text-xs mt-3 text-zinc-300">
            <span className="font-bold text-green-500">
              {(movie.vote_average * 10).toFixed(0)}% {t("match")}
            </span>
            <span className="px-1.5 py-0.5 border border-white/40 text-[10px] rounded">
              U/A 16+
            </span>
            <span className="whitespace-nowrap">
              {type === "tv" ? "4 Seasons" : "2h 15m"}
            </span>
            <span className="px-1.5 py-0.5 border border-white/40 text-[10px] rounded">
              HD
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs mt-2 text-zinc-200">
            <span>Sci-Fi TV</span>
            <span className="text-zinc-600 text-[6px]">&#9679;</span>
            <span>Teen TV Shows</span>
            <span className="text-zinc-600 text-[6px]">&#9679;</span>
            <span>Horror</span>
          </div>
        </div>
        {isRecentlyAdded && (
          <div className="absolute top-2 right-2">
            <span className="px-2 py-1 text-xs font-bold text-white bg-red-600 rounded-sm shadow-md whitespace-nowrap">
              {t("recentlyAdded")}
            </span>
          </div>
        )}
        </div>
      </div>
      <div
        className={`absolute -bottom-10 left-2 right-2 text-left transition-all duration-300 ease-in-out ${isFocused ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        <p className="text-sm font-semibold text-white truncate drop-shadow-lg">
          {movie.title || movie.name}
        </p>
      </div>
    </div>
  );
};

const ContentRow: React.FC<{
  title: string;
  movies: Movie[];
  onCardClick: (movie: Movie) => void;
  category?: string;
  isNetflixRow?: boolean;
  isRecentlyAddedRow?: boolean;
  zIndex?: number;
  isContinueWatchingRow?: boolean;
  onItemFocus?: (item: Movie) => void;
}> = ({
  title,
  movies,
  onCardClick,
  category,
  isNetflixRow = false,
  isRecentlyAddedRow = false,
  zIndex,
  isContinueWatchingRow = false,
  onItemFocus,
}) => {
  if (!movies || movies.length === 0) return null;

  const [isRowActive, setIsRowActive] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const rowContentRef = useRef<HTMLDivElement>(null);

  const rowRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.unobserve(entry.target);
        }
      },
      {
        root: null,
        rootMargin: "0px",
        threshold: 0.1,
      },
    );

    const currentRef = rowRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, []);

  const handleCardFocus = useCallback((cardElement: HTMLElement) => {
    if (!scrollContainerRef.current || !rowContentRef.current) return;

    const containerWidth = scrollContainerRef.current.clientWidth;
    const contentWidth = rowContentRef.current.scrollWidth;
    const padding = 24; // from px-6

    let targetScroll = cardElement.offsetLeft - padding;

    const maxScroll = contentWidth - containerWidth;
    if (targetScroll > maxScroll) {
      targetScroll = maxScroll;
    }

    if (targetScroll < 0) {
      targetScroll = 0;
    }

    if (rowContentRef.current) {
      rowContentRef.current.style.transform = `translateX(${-targetScroll}px)`;
    }
  }, []);

  return (
    <div
      ref={rowRef}
      className={`content-row ${isInView ? "is-in-view" : ""}`}
      style={{ zIndex }}
      onFocus={() => setIsRowActive(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsRowActive(false);
        }
      }}
    >
      <div className="flex items-baseline justify-between mb-3 px-6">
        <h2
          className={`text-lg md:text-xl font-bold text-white transition-all duration-300 ease-out origin-left ${isRowActive ? "scale-100" : "scale-90 text-zinc-400"}`}
        >
          {title}
        </h2>
      </div>
      <div
        ref={scrollContainerRef}
        className="overflow-x-hidden no-scrollbar py-32 -my-32"
      >
        <div
          ref={rowContentRef}
          className="flex flex-nowrap gap-x-6 px-6"
          style={{
            transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
            willChange: "transform",
          }}
        >
          {movies.map((movie, index) => (
            <PosterCard
              key={`${category || "carousel"}-${movie.id}`}
              movie={movie}
              onCardClick={onCardClick}
              isNetflixOriginal={isNetflixRow}
              isRecentlyAdded={isRecentlyAddedRow}
              onCardFocus={handleCardFocus}
              index={index}
              isContinueWatching={isContinueWatchingRow}
              onItemFocus={() => onItemFocus?.(movie)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const SimpleBackdropCard: React.FC<{
  movie: Movie;
  onCardClick: (movie: Movie) => void;
  onItemFocus?: () => void;
}> = ({ movie, onCardClick, onItemFocus }) => {
  const { isKidsMode } = useProfile();
  
  if (!movie.backdrop_path) return null;
  return (
    <div
      className="flex-shrink-0 w-[24vw] sm:w-[18vw] min-w-[200px] max-w-[280px] cursor-pointer group focusable"
      onClick={() => onCardClick(movie)}
      onKeyDown={(e) => e.key === "Enter" && onCardClick(movie)}
      onMouseEnter={() => onItemFocus?.()}
      onFocus={() => onItemFocus?.()}
      tabIndex={0}
    >
      <div className={`relative overflow-hidden transition-all duration-300 ease-in-out transform rounded-md shadow-lg bg-[var(--surface)] group-hover:scale-105 group-hover:shadow-2xl ${isKidsMode ? 'golden-worm-border' : ''}`}>
        <div className={isKidsMode ? 'golden-worm-border-inner' : 'w-full h-full'}>
          <img
            src={`${IMAGE_BASE_URL}${BACKDROP_SIZE_MEDIUM}${movie.backdrop_path}`}
            alt={movie.title || movie.name}
            className="object-cover w-full aspect-video"
            loading="lazy"
            decoding="async"
          />
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <i className="fas fa-play text-white text-3xl drop-shadow-lg"></i>
          </div>
        </div>
      </div>
    </div>
  );
};

const SimpleContentRow: React.FC<{
  movies: Movie[];
  onCardClick: (movie: Movie) => void;
  onItemFocus?: (movie: Movie) => void;
}> = ({ movies, onCardClick, onItemFocus }) => {
  if (!movies || movies.length === 0) return null;
  return (
    <div className="overflow-x-auto no-scrollbar">
      <div className="flex flex-nowrap gap-x-6">
        {movies.map((movie) => (
          <SimpleBackdropCard
            key={`simple-${movie.id}`}
            movie={movie}
            onCardClick={onCardClick}
            onItemFocus={() => onItemFocus?.(movie)}
          />
        ))}
      </div>
    </div>
  );
};

const TopTenCard: React.FC<{
  movie: Movie;
  rank: number;
  onCardClick: (movie: Movie) => void;
  index: number;
  onItemFocus?: () => void;
}> = ({ movie, rank, onCardClick, index, onItemFocus }) => {
  if (!movie.poster_path) return null;

  return (
    <div
      className="flex-shrink-0 w-52 flex items-center group cursor-pointer"
      onClick={() => onCardClick(movie)}
      onMouseEnter={() => onItemFocus?.()}
      onFocus={() => onItemFocus?.()}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <span
        className="text-[12rem] font-black text-[#262626] -mr-8 transition-colors duration-300 group-hover:text-zinc-700"
        style={{
          fontFamily: "'Anton', sans-serif",
          lineHeight: 1,
          textShadow: "0 0 1px #000, 0 0 1px #000, 0 0 1px #000, 0 0 1px #000",
        }}
      >
        {rank}
      </span>
      <div
        className="w-36 flex-shrink-0 relative transition-transform duration-300 transform focusable top-ten-card-focusable"
        onClick={(e) => {
          e.stopPropagation();
          onCardClick(movie);
        }}
        onKeyDown={(e) => e.key === "Enter" && onCardClick(movie)}
        tabIndex={0}
      >
        <img
          src={`${IMAGE_BASE_URL}${POSTER_SIZE}${movie.poster_path}`}
          alt={movie.title || movie.name}
          className="w-full aspect-[2/3] object-cover rounded-lg shadow-lg"
          loading="lazy"
            decoding="async"
        />
      </div>
    </div>
  );
};

const TopTenRow: React.FC<{
  title: string;
  movies: Movie[];
  onCardClick: (movie: Movie) => void;
  zIndex?: number;
  onItemFocus?: (movie: Movie) => void;
}> = ({ title, movies, onCardClick, zIndex, onItemFocus }) => {
  if (!movies || movies.length === 0) return null;

  const rowRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.unobserve(entry.target);
        }
      },
      {
        root: null,
        rootMargin: "0px",
        threshold: 0.1,
      },
    );

    const currentRef = rowRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, []);

  return (
    <div
      ref={rowRef}
      className={`top-ten-row ${isInView ? "is-in-view" : ""}`}
      style={{ zIndex }}
    >
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg md:text-xl font-bold text-white">{title}</h2>
      </div>
      <div className="overflow-x-auto no-scrollbar py-2">
        <div className="flex flex-nowrap items-center gap-x-6">
          {movies.map((movie, index) => (
            <TopTenCard
              key={`top10-${movie.id}`}
              movie={movie}
              rank={index + 1}
              onCardClick={onCardClick}
              index={index}
              onItemFocus={() => onItemFocus?.(movie)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

interface LiveTvChannel {
  id: string;
  name: string;
  logo: string;
  streamUrl?: string;
  playerType?: "iframe" | "hls";
  needsProxy?: boolean;
}

const liveTvChannels: LiveTvChannel[] = [];

const LiveTvCard: React.FC<{
  channel: LiveTvChannel;
  allChannels: LiveTvChannel[];
  onCardFocus: (element: HTMLElement) => void;
  index: number;
  onItemFocus?: () => void;
}> = ({ channel, allChannels, onCardFocus, index, onItemFocus }) => {
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);
  const [imgError, setImgError] = useState(false);

  const handleFocus = useCallback(() => {
    onItemFocus?.();
    if (cardRef.current) {
      onCardFocus(cardRef.current);
    }
  }, [onCardFocus, onItemFocus]);

  const handleClick = () => {
    if (channel.id === "cinetv-kids") {
      navigate("/player", {
        state: {
          item: { id: "cinetv-kids", name: "CineTV Kids" },
          type: "tv",
        },
      });
      return;
    }

    if (channel.streamUrl) {
      const proxiedChannels = allChannels ? allChannels.map(c => ({
        ...c,
        streamUrl: getProxiedStreamUrl(c.streamUrl)
      })) : undefined;

      const proxiedUrl = getProxiedStreamUrl(channel.streamUrl);

      if (channel.playerType === "iframe") {
        navigate("/iframe-player", {
          state: {
            item: { id: channel.id, name: channel.name, title: channel.name },
            streamUrl: proxiedUrl,
            liveChannels: proxiedChannels,
            currentChannelIndex: index,
            logo: channel.logo,
          },
        });
      } else {
        navigate("/player", {
          state: {
            item: { id: channel.id, name: channel.name, title: channel.name },
            type: "movie",
            streamUrl: proxiedUrl,
            liveChannels: proxiedChannels,
            currentChannelIndex: index,
            logo: channel.logo,
            needsProxy: channel.needsProxy,
          },
        });
      }
    }
  };

  return (
    <div
      ref={cardRef}
      className="flex-shrink-0 w-[24vw] min-w-[220px] max-w-[320px] cursor-pointer focusable group"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
      onFocus={handleFocus}
      onMouseEnter={() => onItemFocus?.()}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="relative transition-all duration-300 ease-in-out transform bg-zinc-900 rounded-lg overflow-hidden shadow-lg group-hover:shadow-2xl aspect-video flex flex-col items-center justify-center p-4 interactive-card">
        {/* Striped Background Layer */}
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

        {/* Foreground Logo */}
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

const InteractiveAdBanner: React.FC = () => {
  return (
    <div className="mx-6 my-10 relative overflow-hidden rounded-xl shadow-2xl border border-zinc-800/40 h-36 sm:h-44 md:h-48 lg:h-52 bg-zinc-950">
      <img
        src="https://i.ibb.co/MkzkRg7B/0608-merchandising-film.jpg"
        alt="Promo Banner"
        className="w-full h-full object-cover pointer-events-none"
      />
    </div>
  );
};

const CineSatellitePromoBox: React.FC = () => {
  return (
    <div className="mx-6 my-10 relative overflow-hidden rounded-xl bg-gradient-to-r from-zinc-950 via-zinc-900 to-slate-900 p-8 shadow-2xl border border-zinc-800 flex flex-col lg:flex-row items-center justify-between gap-6">
      <div className="absolute top-0 right-1/4 w-72 h-72 bg-amber-500/5 rounded-full blur-[60px] pointer-events-none" />
      <div className="relative z-10 flex items-center gap-6">
        <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0 text-amber-500 text-3xl shadow-inner">
          <i className="fa-solid fa-satellite" />
        </div>
        <div className="flex flex-col gap-1 text-center lg:text-left">
          <div className="flex items-center justify-center lg:justify-start gap-2">
            <span className="bg-zinc-800 text-zinc-300 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded">
              HARDWARE
            </span>
            <span className="text-amber-500 text-[10px] font-bold uppercase tracking-widest">
              • NEW RELEASES
            </span>
          </div>
          <h3 className="text-xl md:text-2xl font-bold text-white tracking-tight">
            CineStream 4K Satellite Receiver Box
          </h3>
          <p className="text-xs md:text-sm text-zinc-400 max-w-xl">
            Get the custom receiver box to stream real satellite dishes directly
            with premium low-latency, built-in recording, and parent controls.
          </p>
        </div>
      </div>

      <div className="flex-shrink-0 z-10 w-full lg:w-auto">
        <button
          onClick={() =>
            alert("Satellite Box order system is integration-ready.")
          }
          className="w-full lg:w-auto px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-sm rounded-lg border border-zinc-700 hover:border-zinc-500 transition-all duration-300"
        >
          Order Hardware Receiver
        </button>
      </div>
    </div>
  );
};

let cachedLiveTvChannels: LiveTvChannel[] | null = null;
let lastLiveTvFetchTime: number = 0;

const LiveTvRow: React.FC<{
  title: string;
  zIndex?: number;
  onItemFocus?: (channel: LiveTvChannel) => void;
}> = ({ title, zIndex, onItemFocus }) => {
  const [isRowActive, setIsRowActive] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const rowContentRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [channels, setChannels] = useState<LiveTvChannel[]>(cachedLiveTvChannels || liveTvChannels); // default static fallback

  useEffect(() => {
    const now = Date.now();
    if (cachedLiveTvChannels && (now - lastLiveTvFetchTime) < 30 * 60 * 1000) {
      return;
    }
    // Fetch random channels
    fetchRandomCategoryChannels().then(randomChannels => {
      if (randomChannels.length > 0) {
        // take random 15 channels
        const shuffled = [...randomChannels].sort(() => 0.5 - Math.random());
        const newRandoms = shuffled.slice(0, 15).map(c => ({
          ...c, 
          needsProxy: false,
          playerType: c.playerType as "iframe" | "hls" | undefined
        })) as LiveTvChannel[];
        cachedLiveTvChannels = newRandoms;
        lastLiveTvFetchTime = Date.now();
        setChannels(newRandoms);
      }
    });
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1 },
    );
    const currentRef = rowRef.current;
    if (currentRef) observer.observe(currentRef);
    return () => {
      if (currentRef) observer.unobserve(currentRef);
    };
  }, []);

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

  return (
    <div
      ref={rowRef}
      className={`content-row ${isInView ? "is-in-view" : ""}`}
      style={{ zIndex }}
      onFocus={() => setIsRowActive(true)}
      onBlur={(e) =>
        !e.currentTarget.contains(e.relatedTarget as Node) &&
        setIsRowActive(false)
      }
    >
      <div className="flex items-baseline justify-between mb-3 px-6">
        <h2
          className={`text-lg md:text-xl font-bold text-white transition-all duration-300 ease-out origin-left ${isRowActive ? "scale-100" : "scale-90 text-zinc-400"}`}
        >
          {title}
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
          {channels.map((channel, index) => (
            <LiveTvCard
              key={channel.id}
              channel={channel}
              onCardFocus={handleCardFocus}
              index={index}
              onItemFocus={() => onItemFocus?.(channel)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const SkeletonLoader: React.FC = () => (
  <div className="px-4 md:px-10">
    <div className="relative w-full h-[70vh] min-h-[500px] bg-[var(--surface)] skeleton rounded-xl" />
    <div className="relative z-10 space-y-8 mt-8">
      {[...Array(9)].map((_, rowIndex) => (
        <div key={rowIndex}>
          <div className="w-1/3 h-8 mb-4 bg-zinc-800/50 rounded-lg skeleton"></div>
          <div className="flex gap-x-2">
            {[...Array(7)].map((_, i) => (
              <div
                key={i}
                className="flex-shrink-0 w-[24vw] min-w-[220px] max-w-[320px]"
              >
                <div className="w-full aspect-video bg-zinc-800/50 rounded-lg skeleton"></div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const HomePage: React.FC = () => {
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [focusedImage, setFocusedImage] = useState<string | null>(null);
  const { isKidsMode, activeProfile, setModalItem, getScreenSpecificData } =
    useProfile();
  const { t, language } = useTranslation();
  const { openStudio } = useAddons();
  const navigate = useNavigate();

  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // One-time neutral tip per profile: manage/add addons from the personal
  // PC Studio link (shown as a top modal, never as a header entry).
  useEffect(() => {
    try {
      const tipKey = `cineStudioTipSeen_v1_${activeProfile?.id || "default"}`;
      if (localStorage.getItem(tipKey)) return;
      const timer = setTimeout(() => {
        try { localStorage.setItem(tipKey, "1"); } catch { /* ignore */ }
        openStudio();
      }, 3000);
      return () => clearTimeout(timer);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfile?.id]);

  useEffect(() => {
    return () => {
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }
    };
  }, []);

  // Build rotating hero slides (same style/layout as the default banner)
  useEffect(() => {
    const source = isKidsMode ? data.watchTogetherKids : data.trending;
    if (!source || source.length === 0) return;
    let cancelled = false;

    const buildSlides = async () => {
      const candidates = (source as Movie[])
        .filter((m) => m.backdrop_path)
        .slice(0, 6);

      const built = await Promise.all(
        candidates.map(async (item) => {
          try {
            const type = item.media_type || (item.title ? "movie" : "tv");
            const [details, images] = await Promise.all([
              fetchFromTMDB(`/${type}/${item.id}`),
              fetchFromTMDB(`/${type}/${item.id}/images`, {
                include_image_language: "en,null",
              }),
            ]);
            const logos = (images?.logos || []) as any[];
            const logoPath =
              logos.find((l) => l.iso_639_1 === "en")?.file_path ||
              logos[0]?.file_path ||
              null;
            const year = (
              details.release_date ||
              details.first_air_date ||
              ""
            ).slice(0, 4);
            const genre = details.genres?.[0]?.name as string | undefined;
            const runtime = details.runtime
              ? `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}m`
              : null;
            const seasons = details.number_of_seasons
              ? `${details.number_of_seasons} season${details.number_of_seasons > 1 ? "s" : ""}`
              : null;
            const metaParts = (
              type === "movie"
                ? ["Movie", genre, year, runtime]
                : ["Show", genre, year, seasons]
            ).filter(Boolean) as string[];

            return {
              backdropUrl: `${IMAGE_BASE_URL}${BACKDROP_SIZE}${item.backdrop_path}`,
              logoUrl: logoPath ? `${IMAGE_BASE_URL}w500${logoPath}` : null,
              titleText: item.title || item.name || "",
              badge: type === "movie" ? "MOVIE" : "SERIES",
              metaParts,
              ratingBadge: isKidsMode
                ? "PG"
                : type === "movie"
                  ? "PG-13"
                  : "TV-MA",
            } as HeroSlide;
          } catch {
            return null;
          }
        }),
      );

      if (cancelled) return;
      const valid = built.filter(Boolean) as HeroSlide[];
      const defaultSlide = isKidsMode
        ? KIDS_DEFAULT_SLIDE
        : REGULAR_DEFAULT_SLIDE;
      // Avoid duplicating the default hero if it also appears in the fetched list
      const unique = valid.filter(
        (s) =>
          s.titleText.toLowerCase() !== defaultSlide.titleText.toLowerCase(),
      );
      const slides = [defaultSlide, ...unique];
      setHeroSlides(slides);
      setHeroIndex(computeHeroIndex(slides.length));
    };

    buildSlides();
    return () => {
      cancelled = true;
    };
  }, [data.trending, data.watchTogetherKids, isKidsMode]);

  // Rotate the hero slide every 30 seconds, continuously — the cycle keeps
  // running even if the user leaves and re-enters the page (no restart),
  // and loops back to the first slide after the last one.
  useEffect(() => {
    if (heroSlides.length <= 1) return;
    const tick = () => setHeroIndex(computeHeroIndex(heroSlides.length));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [heroSlides.length]);

  // Preload the next slide's images for a seamless transition
  useEffect(() => {
    if (heroSlides.length <= 1) return;
    const next = heroSlides[(heroIndex + 1) % heroSlides.length];
    if (next) {
      const img = new Image();
      img.src = next.backdropUrl;
      if (next.logoUrl) {
        const logoImg = new Image();
        logoImg.src = next.logoUrl;
      }
    }
  }, [heroIndex, heroSlides]);

  const handleOpenModal = (item: Movie) => {
    setModalItem(item);
  };

  const handleContinueWatchingClick = (item: any) => {
    navigate("/player", {
      state: {
        item,
        type: item.media_type,
        currentTime: item.currentTime,
        season: item.seasonNumber,
        episode: item.episodeId
          ? { id: item.episodeId, episode_number: item.episodeNumber }
          : null,
      },
    });
  };

  const handleItemFocus = useCallback((item: any) => {
    if (!item) {
      // Do not reset focus image on blur for smoother experience
      return;
    }

    if (focusTimeoutRef.current) {
      clearTimeout(focusTimeoutRef.current);
    }

    focusTimeoutRef.current = setTimeout(() => {
      if (item.backdrop_path) {
        setFocusedImage(
          `${IMAGE_BASE_URL}${BACKDROP_SIZE_MEDIUM}${item.backdrop_path}`,
        );
      } else if (item.logo) {
        setFocusedImage(item.logo);
      } else if (item.poster_path) {
        setFocusedImage(`${IMAGE_BASE_URL}${POSTER_SIZE}${item.poster_path}`);
      }
    }, 250); // 250ms debounce to prevent layout re-paint thrashing during rapid scroll/hover
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const filterWithBackdrop = (results: any[]) =>
          (results || []).filter((item: Movie) => item.backdrop_path);

        let fetchedData;

        if (isKidsMode) {
          // Fetch kid-friendly content
          const heroMovieId = 1022789; // The Super Mario Bros. Movie
          const [
            heroRes,
            watchTogetherRes,
            tvDramasRes, // actually animated series
            trendingRes,
            netflixRes,
            popularRes,
            topRatedRes,
            upcomingRes,
            popularTvRes,
            topTenRes,
          ] = await Promise.all([
            fetchFromTMDB(`/movie/${heroMovieId}`),
            fetchFromTMDB("/discover/movie", {
              sort_by: "popularity.desc",
              with_genres: "10751,16",
              certification_country: "US",
              "certification.lte": "PG",
            }),
            fetchFromTMDB("/discover/tv", {
              with_genres: "16",
              sort_by: "popularity.desc",
            }),
            fetchFromTMDB("/discover/movie", {
              with_genres: "16,10751",
              sort_by: "popularity.desc",
              primary_release_year: new Date().getFullYear(),
            }),
            fetchFromTMDB("/discover/tv", {
              with_networks: "213",
              with_genres: "16",
              sort_by: "popularity.desc",
            }),
            fetchFromTMDB("/discover/movie", {
              with_genres: "16",
              sort_by: "popularity.desc",
            }),
            fetchFromTMDB("/discover/movie", {
              with_genres: "16",
              "vote_average.gte": "7.5",
              sort_by: "vote_average.desc",
            }),
            fetchFromTMDB("/discover/movie", {
              with_genres: "16",
              sort_by: "primary_release_date.desc",
              "primary_release_date.lte": new Date().toISOString().split('T')[0],
            }),
            fetchFromTMDB("/discover/tv", {
              with_genres: "10762",
              sort_by: "popularity.desc",
            }),
            fetchFromTMDB("/discover/movie", {
              with_genres: "16",
              sort_by: "popularity.desc",
              "vote_average.gte": "7",
            }),
          ]);

          fetchedData = {
            hero: heroRes,
            watchTogetherKids: filterWithBackdrop(watchTogetherRes.results),
            tvDramas: filterWithBackdrop(tvDramasRes.results),
            trending: filterWithBackdrop(trendingRes.results),
            netflixOriginals: filterWithBackdrop(netflixRes.results),
            popularMovies: filterWithBackdrop(popularRes.results),
            topRatedMovies: filterWithBackdrop(topRatedRes.results),
            upcomingMovies: filterWithBackdrop(upcomingRes.results),
            popularTv: filterWithBackdrop(popularTvRes.results),
            topTen: (topTenRes.results || []).filter((item: Movie) => item.poster_path).slice(0, 10),
          };
        } else {
          // Fetch regular content
          const heroMovieId = 93405; // Squid Game series ID
          const [
            heroRes,
            trendingRes,
            topRatedMoviesRes,
            popularMoviesRes,
            upcomingMoviesRes,
            popularTvRes,
            netflixOriginalsRes,
            watchTogetherKidsRes,
            tvDramasRes,
            topTenRes,
          ] = await Promise.all([
            fetchFromTMDB(`/tv/${heroMovieId}`),
            fetchFromTMDB("/trending/all/week"),
            fetchFromTMDB("/movie/top_rated"),
            fetchFromTMDB("/movie/popular"),
            fetchFromTMDB("/movie/upcoming"),
            fetchFromTMDB("/tv/popular"),
            fetchFromTMDB("/discover/tv", { with_networks: "213" }),
            fetchFromTMDB("/discover/movie", {
              with_genres: "10751",
              certification_country: "US",
              "certification.lte": "PG-13",
              sort_by: "popularity.desc",
            }),
            fetchFromTMDB("/discover/tv", {
              with_genres: "18",
              sort_by: "popularity.desc",
            }),
            fetchFromTMDB("/trending/all/day"),
          ]);

          fetchedData = {
            hero: heroRes,
            trending: filterWithBackdrop(trendingRes.results),
            topRatedMovies: filterWithBackdrop(topRatedMoviesRes.results),
            popularMovies: filterWithBackdrop(popularMoviesRes.results),
            upcomingMovies: filterWithBackdrop(upcomingMoviesRes.results),
            popularTv: filterWithBackdrop(popularTvRes.results),
            netflixOriginals: filterWithBackdrop(netflixOriginalsRes.results),
            watchTogetherKids: filterWithBackdrop(watchTogetherKidsRes.results),
            tvDramas: filterWithBackdrop(tvDramasRes.results),
            topTen: (topTenRes.results || [])
              .filter((item: Movie) => item.poster_path)
              .slice(0, 10),
          };
        }

        const history = getScreenSpecificData("history", []);
        const lastSearches = getScreenSpecificData("lastSearches", []);
        const favorites = getScreenSpecificData("favorites", []);

        const continueWatchingItems = history.map((h: HistoryItem) => ({
          id: h.id,
          media_type: h.type,
          title: h.title,
          name: h.title,
          backdrop_path: h.itemImage.replace(
            `${IMAGE_BASE_URL}${BACKDROP_SIZE_MEDIUM}`,
            "",
          ),
          poster_path: "",
          overview: "",
          vote_average: 0,
          vote_count: 0,
          currentTime: h.currentTime,
          duration: h.duration,
          seasonNumber: h.seasonNumber,
          episodeNumber: h.episodeNumber,
          episodeId: h.episodeId,
        }));

        // SMART RECOMMENDATION ENGINE (ALGORITHM)
        let recommendedItems: Movie[] = [];
        let recommendationReason = "";

        const blacklist = [
          "adult", "sex", "erotic", "nsfw", "porn", "xxx", "sensual", "lust", "desire", "naked",
          "إباحي", "جنس", "سكس", "شهوة", "عرية", "عاري"
        ];

        const filterSmartRecommendations = (results: any[]) => {
          return (results || []).filter((item: Movie) => {
            if (!item.backdrop_path) return false;
            // 1. Explicit TMDB adult flag
            // @ts-ignore
            if (item.adult) return false;

            // 2. Blacklisted keywords in title, original_title or overview
            const titleLower = (item.title || "").toLowerCase();
            const nameLower = (item.name || "").toLowerCase();
            const origTitleLower = (item.original_title || "").toLowerCase();
            const overviewLower = (item.overview || "").toLowerCase();

            const isBlacklisted = blacklist.some((word) =>
              titleLower.includes(word) ||
              nameLower.includes(word) ||
              origTitleLower.includes(word) ||
              overviewLower.includes(word)
            );
            if (isBlacklisted) return false;

            // 3. Filter out random/low-quality content
            const rating = item.vote_average || 0;
            const voteCount = item.vote_count || 0;
            if (rating > 0 && rating < 5.0 && voteCount > 10) return false;

            const popularity = item.popularity || 0;
            if (popularity < 1.5) return false;

            // 4. Exclude documentary/talk/news categories to keep it cinematic and clean
            const genreIds = (item as any).genre_ids || [];
            if (genreIds.includes(99) || genreIds.includes(10763) || genreIds.includes(10767)) return false;

            return true;
          });
        };

        try {
          // Candidate 1: Based on recently watched from history
          if (history.length > 0) {
            try {
              const lastWatched = history[0];
              const type = lastWatched.type || "movie";
              const recsRes = await fetchFromTMDB(`/${type}/${lastWatched.id}/recommendations`, {
                include_adult: false,
              });
              const filtered = filterSmartRecommendations(recsRes.results);
              if (filtered.length > 0) {
                recommendedItems = filtered.slice(0, 15);
                recommendationReason = language === "ar"
                  ? `لأنك شاهدت "${lastWatched.title}"`
                  : `Because you watched "${lastWatched.title}"`;
              }
            } catch (err) {
              console.warn("Failed to fetch recommendations from history:", err);
            }
          }

          // Candidate 2: Based on favorites
          if (recommendedItems.length === 0 && favorites.length > 0) {
            try {
              const lastFav = favorites[favorites.length - 1];
              const type = lastFav.type || "movie";
              const recsRes = await fetchFromTMDB(`/${type}/${lastFav.id}/recommendations`, {
                include_adult: false,
              });
              const filtered = filterSmartRecommendations(recsRes.results);
              if (filtered.length > 0) {
                recommendedItems = filtered.slice(0, 15);
                recommendationReason = language === "ar"
                  ? `لأنك فضلت "${lastFav.title || lastFav.name}"`
                  : `Because you liked "${lastFav.title || lastFav.name}"`;
              }
            } catch (err) {
              console.warn("Failed to fetch recommendations from favorites:", err);
            }
          }

          // Candidate 3: Based on search history
          if (recommendedItems.length === 0 && lastSearches.length > 0) {
            try {
              const lastSearchItem = lastSearches[0];
              const type = lastSearchItem.media_type || (lastSearchItem.title ? "movie" : "tv");
              const recsRes = await fetchFromTMDB(`/${type}/${lastSearchItem.id}/recommendations`, {
                include_adult: false,
              });
              const filtered = filterSmartRecommendations(recsRes.results);
              if (filtered.length > 0) {
                recommendedItems = filtered.slice(0, 15);
                recommendationReason = language === "ar"
                  ? `بناءً على بحثك عن "${lastSearchItem.title || lastSearchItem.name}"`
                  : `Based on your search for "${lastSearchItem.title || lastSearchItem.name}"`;
              }
            } catch (err) {
              console.warn("Failed to fetch recommendations from searches:", err);
            }
          }

          // Candidate 4: Cold-start fallback (curated highly acclaimed/popular masterpieces, fully filtered and non-explicit)
          if (recommendedItems.length === 0) {
            try {
              const discoverRes = await fetchFromTMDB("/discover/movie", {
                sort_by: "popularity.desc",
                "vote_average.gte": "7.5",
                "vote_count.gte": "500",
                include_adult: false,
                certification_country: "US",
                "certification.lte": isKidsMode ? "G" : "PG-13",
                with_genres: isKidsMode ? "10751,16" : "878,12,28",
              });
              const filtered = filterSmartRecommendations(discoverRes.results);
              if (filtered.length > 0) {
                recommendedItems = filtered.slice(0, 15);
                recommendationReason = language === "ar"
                  ? "ترشيحات ذكية مخصصة لك"
                  : "Smart Recommendations For You";
              }
            } catch (err) {
              console.warn("Failed to fetch cold-start smart recommendations:", err);
            }
          }
        } catch (e) {
          console.error("General error in Smart Recommendations algorithm:", e);
        }

        setData({
          ...fetchedData,
          continueWatching: continueWatchingItems,
          smartRecommendations: recommendedItems,
          smartRecommendationsReason: recommendationReason,
        });

        if (fetchedData.hero?.backdrop_path) {
          setFocusedImage(
            `${IMAGE_BASE_URL}${BACKDROP_SIZE_MEDIUM}${fetchedData.hero.backdrop_path}`,
          );
        }
      } catch (error) {
        console.error("Failed to fetch home page data:", error);
      } finally {
        setLoading(false);
      }
    };

    if (activeProfile) {
      fetchData();
    }
  }, [isKidsMode, activeProfile, getScreenSpecificData, language]);

  return (
    <Layout>
      <AmbientBackground imageUrl={focusedImage} />
      {loading ? (
        <SkeletonLoader />
      ) : (
        <div className="px-4 md:px-10 pt-24">
          <>
            <Hero slide={heroSlides[heroIndex] || (isKidsMode ? KIDS_DEFAULT_SLIDE : REGULAR_DEFAULT_SLIDE)} isKids={isKidsMode} />
            <div className="relative z-10 mt-12 space-y-20">
              <ContentRow
                title={isKidsMode ? t("kidsFavorites") : t("yourNextWatch")}
                movies={(data.watchTogetherKids || []).slice(0, 10)}
                onCardClick={handleOpenModal}
                category="your_next_watch"
                onItemFocus={handleItemFocus}
              />
              <LiveTvRow
                title="Live TV"
                zIndex={13}
                onItemFocus={handleItemFocus}
              />

              {/* Latest addons — circular row */}
              <LatestAddonsRow zIndex={14} />

              {data.smartRecommendations?.length > 0 && (
                <ContentRow
                  title={data.smartRecommendationsReason || (language === 'ar' ? 'ترشيحات ذكية مخصصة لك' : 'Recommended For You')}
                  movies={data.smartRecommendations}
                  onCardClick={handleOpenModal}
                  category="smart_recommendations"
                  zIndex={12}
                  onItemFocus={handleItemFocus}
                />
              )}
              <ContentRow
                title={isKidsMode ? t("animatedAdventures") : t("tvDramas")}
                movies={data.tvDramas}
                onCardClick={handleOpenModal}
                category="tv_dramas"
                zIndex={11}
                onItemFocus={handleItemFocus}
              />
              {data.continueWatching?.length > 0 && (
                <ContentRow
                  title={t("continueWatching")}
                  movies={data.continueWatching}
                  onCardClick={handleContinueWatchingClick}
                  category="continue_watching"
                  isContinueWatchingRow={true}
                  zIndex={10}
                  onItemFocus={handleItemFocus}
                />
              )}

              <InteractiveAdBanner />

              <TopTenRow
                title={t("top10Today")}
                movies={data.topTen}
                onCardClick={handleOpenModal}
                zIndex={9}
                onItemFocus={handleItemFocus}
              />
              <ContentRow
                title={t("trendingThisWeek")}
                movies={data.trending}
                onCardClick={handleOpenModal}
                category="trending"
                zIndex={8}
                onItemFocus={handleItemFocus}
              />

              <CineSatellitePromoBox />

              <ContentRow
                title={t("netflixOriginals")}
                movies={data.netflixOriginals}
                onCardClick={handleOpenModal}
                category="netflix_originals"
                isNetflixRow
                zIndex={7}
                onItemFocus={handleItemFocus}
              />
              <ContentRow
                title={t("popularMovies")}
                movies={data.popularMovies}
                onCardClick={handleOpenModal}
                category="popular_movies"
                zIndex={6}
                onItemFocus={handleItemFocus}
              />
              <ContentRow
                title={t("topRated")}
                movies={data.topRatedMovies}
                onCardClick={handleOpenModal}
                category="top_rated_movies"
                zIndex={5}
                onItemFocus={handleItemFocus}
              />
              <ContentRow
                title={t("recentlyAdded")}
                movies={data.upcomingMovies}
                onCardClick={handleOpenModal}
                category="upcoming_movies"
                isRecentlyAddedRow
                zIndex={4}
                onItemFocus={handleItemFocus}
              />
              <ContentRow
                title={t("popularSeries")}
                movies={data.popularTv}
                onCardClick={handleOpenModal}
                category="popular_tv"
                zIndex={3}
                onItemFocus={handleItemFocus}
              />
            </div>
          </>
        </div>
      )}
    </Layout>
  );
};

export default HomePage;
