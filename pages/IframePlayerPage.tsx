import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const ChannelListPanel: React.FC<{
  channels: any[];
  currentIndex: number;
  onSelect: (index: number) => void;
  onClose: () => void;
  isVisible: boolean;
}> = ({ channels, currentIndex, onSelect, onClose, isVisible }) => {
  const [focusedIndex, setFocusedIndex] = useState(currentIndex);
  const [isRendered, setIsRendered] = useState(isVisible);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isVisible) {
      setIsRendered(true);
      setFocusedIndex(currentIndex);
    } else {
      const timer = setTimeout(() => setIsRendered(false), 400); // match animation duration
      return () => clearTimeout(timer);
    }
  }, [isVisible, currentIndex]);

  useEffect(() => {
    if (isVisible) {
      const focusItem = () => {
        const item = itemRefs.current[focusedIndex];
        if (item) {
          item.focus();
          // TV browsers struggle with smooth scrolling; use snappy instant scrolling for TV.
          const isTV = typeof navigator !== 'undefined' && /SmartTV|Tizen|Web0S|AppleTV|AndroidTV|TV|PlayStation/i.test(navigator.userAgent);
          item.scrollIntoView({ behavior: isTV ? 'auto' : 'smooth', block: 'center' });
        } else {
          panelRef.current?.focus();
        }
      };
      const timer = setTimeout(focusItem, 150);
      return () => clearTimeout(timer);
    }
  }, [isVisible, focusedIndex]);

  const handlePanelKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape', 'Enter'].includes(e.key)) {
        e.preventDefault();
    }

    if (e.key === 'ArrowUp') {
      setFocusedIndex(prev => (prev > 0 ? prev - 1 : channels.length - 1));
    } else if (e.key === 'ArrowDown') {
      setFocusedIndex(prev => (prev < channels.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'Enter') {
      onSelect(focusedIndex);
    } else if (['ArrowLeft', 'Escape', 'ArrowRight'].includes(e.key)) {
      onClose();
    }
  };


  if (!isRendered) return null;
  const animationClass = isVisible ? 'animate-slide-in-from-right' : 'animate-slide-out-to-right';

  return (
    <div
      ref={panelRef}
      onKeyDown={handlePanelKeyDown}
      tabIndex={-1}
      style={{outline: 'none'}}
      className={`fixed top-0 right-0 h-full w-full max-w-xs bg-black/80 backdrop-blur-lg z-30 p-4 ${animationClass}`}
    >
      <h2 className="text-2xl font-bold text-white mb-4">Channels</h2>
      <div className="h-[calc(100%-4rem)] overflow-y-auto no-scrollbar">
        {channels.map((channel, index) => (
          <button
            key={channel.id}
            // FIX: Ref callback should not return a value. Changed to a block statement.
            ref={el => { itemRefs.current[index] = el; }}
            onClick={() => onSelect(index)}
            className="w-full flex items-center gap-4 p-3 my-1 rounded-lg text-left transition-colors duration-200 focus:outline-none focus:bg-white/20 hover:bg-white/10"
          >
            <img src={channel.logo} alt={channel.name} className="w-16 h-12 object-contain flex-shrink-0 rounded-md bg-zinc-700 p-1" />
            <span className="text-white font-semibold truncate">{channel.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};


const IframePlayerPage: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [unmuted, setUnmuted] = useState(false);
    const [isChannelListVisible, setIsChannelListVisible] = useState(false);

    const { item, streamUrl, liveChannels, currentChannelIndex, logo } = location.state || {};

    const backButtonRef = useRef<HTMLButtonElement>(null);
    const unmuteButtonRef = useRef<HTMLButtonElement>(null);
    const channelListButtonRef = useRef<HTMLButtonElement>(null);

    React.useEffect(() => {
        if (!item || !streamUrl || !liveChannels) {
            navigate('/home', { replace: true });
        } else {
            setUnmuted(false);
        }
    }, [item, streamUrl, liveChannels, navigate]);

    useEffect(() => {
        if (!isChannelListVisible) {
            channelListButtonRef.current?.focus();
        }
    }, [isChannelListVisible]);


    if (!item || !streamUrl || !liveChannels) {
        return null;
    }

    const handleSelectChannel = (index: number) => {
        if (!liveChannels || typeof currentChannelIndex !== 'number') return;
        if (index === currentChannelIndex) {
            setIsChannelListVisible(false);
            return;
        }
        
        const nextChannel = liveChannels[index];

        const nextState = {
            item: { id: nextChannel.id, name: nextChannel.name, title: nextChannel.name },
            streamUrl: nextChannel.streamUrl,
            liveChannels: liveChannels,
            currentChannelIndex: index,
            logo: nextChannel.logo,
        };

        if (nextChannel.playerType === 'iframe') {
            navigate('/iframe-player', { state: nextState, replace: true });
        } else {
            navigate('/player', { state: { ...nextState, type: 'movie' }, replace: true });
        }
    };

    const handleUnmute = (e: React.MouseEvent) => {
        e.stopPropagation();
        setUnmuted(true);
        setTimeout(() => channelListButtonRef.current?.focus(), 50);
    }

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'black',
            overflow: 'hidden'
        }}>
            {/* FIX: The `inert` attribute expects a boolean value, not a string. */}
            <div inert={isChannelListVisible} style={{ width: '100%', height: '100%', position: 'relative' }}>
                <iframe
                    key={streamUrl + (unmuted ? '_unmuted' : '_muted')}
                    src={streamUrl}
                    style={{
                        width: '100%',
                        height: '100%',
                        border: 'none'
                    }}
                    allow="autoplay; fullscreen"
                    allowFullScreen
                ></iframe>

                <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10">
                    <button 
                        ref={backButtonRef}
                        onClick={() => navigate(-1)} 
                        className="w-12 h-12 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm text-white text-xl btn-press focusable"
                        aria-label="Go Back"
                    >
                        <i className="fa-solid fa-arrow-left"></i>
                    </button>

                    <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none">
                    {logo && (
                        <img src={logo} alt={`${item.name} logo`} className="h-20 max-w-[240px] object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)]" />
                    )}
                    </div>

                    <div className="flex items-center gap-2">
                        {!unmuted && (
                            <button
                                ref={unmuteButtonRef}
                                onClick={handleUnmute}
                                className="w-12 h-12 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm text-white text-xl btn-press focusable animate-pulse"
                                aria-label="Unmute Video"
                            >
                                <i className="fa-solid fa-volume-xmark"></i>
                            </button>
                        )}  
                        <button
                            ref={channelListButtonRef}
                            onClick={() => setIsChannelListVisible(true)}
                            className="w-12 h-12 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm text-white text-xl btn-press focusable"
                            aria-label="Channel List"
                        >
                            <i className="fas fa-list-ul"></i>
                        </button>
                    </div> 
                </div>
            </div>

            <ChannelListPanel
                channels={liveChannels}
                currentIndex={currentChannelIndex}
                isVisible={isChannelListVisible}
                onSelect={handleSelectChannel}
                onClose={() => setIsChannelListVisible(false)}
            />
        </div>
    );
};

export default IframePlayerPage;
