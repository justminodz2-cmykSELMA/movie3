import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { iptvCategories, fetchRandomCategoryChannels, parseM3u, IptvChannel, IptvCategory, getProxiedStreamUrl } from '../services/iptvService';
import { useTranslation } from '../contexts/LanguageContext';

const IptvPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState<IptvCategory>(iptvCategories[0]);
  const [channels, setChannels] = useState<IptvChannel[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categorySearchQuery, setCategorySearchQuery] = useState<string>('');
  const [failedLogos, setFailedLogos] = useState<Record<string, boolean>>({});
  
  const filteredCategories = useMemo(() => {
    if (!categorySearchQuery) return iptvCategories;
    const lowerQuery = categorySearchQuery.toLowerCase();
    return iptvCategories.filter(c => c.name.toLowerCase().includes(lowerQuery));
  }, [categorySearchQuery]);
  
  useEffect(() => {
    let isMounted = true;
    const fetchChannels = async () => {
      setLoading(true);
      try {
        let urlToFetch = selectedCategory.url;
        
        // Always route through our backend proxy to completely avoid CORS and Mixed-content errors
        urlToFetch = `/api/m3u-proxy?url=${encodeURIComponent(urlToFetch)}`;
        
        const response = await fetch(urlToFetch);
        if (!response.ok) throw new Error('Failed to fetch');
        
        const text = await response.text();
        const parsedChannels = parseM3u(text);
        if (isMounted) setChannels(parsedChannels);
      } catch (e) {
        console.error('Error fetching channels:', e);
        if (isMounted) setChannels([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchChannels();
    return () => {
      isMounted = false;
    };
  }, [selectedCategory]);

  const filteredChannels = useMemo(() => {
    if (!searchQuery) return channels;
    const lowerQuery = searchQuery.toLowerCase();
    return channels.filter(c => c.name.toLowerCase().includes(lowerQuery));
  }, [channels, searchQuery]);

  const handlePlayChannel = (channel: IptvChannel) => {
    const originalIndex = channels.findIndex(c => c.id === channel.id);
    
    // Ensure all URLs passed to the player are proxied so they play perfectly
    const proxiedChannels = channels.map(c => ({
      ...c,
      streamUrl: getProxiedStreamUrl(c.streamUrl)
    }));

    const state = {
      item: { id: channel.id, name: channel.name, title: channel.name, logo: channel.logo },
      streamUrl: getProxiedStreamUrl(channel.streamUrl),
      liveChannels: proxiedChannels,
      currentChannelIndex: originalIndex !== -1 ? originalIndex : 0,
      logo: channel.logo,
      hideLogo: selectedCategory.name === 'Main (Ugeen)',
      needsProxy: false,
    };
    if (channel.playerType === 'iframe') {
      navigate('/iframe-player', { state });
    } else {
      navigate('/player', { state: { ...state, type: 'movie' } });
    }
  };

  const renderChannelLogo = (channel: IptvChannel) => {
    const isPlaceholder = !channel.logo || channel.logo.includes('placeholder.com') || channel.logo.includes('via.placeholder');
    const hasFailed = failedLogos[channel.id];
    
    if (isPlaceholder || hasFailed) {
      // Strip language tag prefixes and get first letter
      const cleanName = channel.name
        .replace(/^(AR|FR|EN|ES|DE|IT|UK|US|MA|TN|DZ|LY|SY|LB|ZA|PT|TR|AL|PL|RO|RU|KSA|OSN|beIN|MBC|TOD|BTV|OCS|Starz|Dragon|Hulu|Skyflix|ART|Rotana|ON|DMC|CBC|Al Alhy|Zamalek|Nile|Sada Elbalad|Star|Paramount|Comedy|TNT|HBO|ESPN|Fox|Sony|ZDF|RTL|SAT|Pro7|Super RTL|Vox|VOX|Kika|Arte|TF1|M6|W9|RMC|BFM|LCI|DAZN|TMC|France)\s*:\s*/i, '')
        .trim();
      const firstLetter = cleanName.charAt(0).toUpperCase() || '📺';
      
      return (
        <div className="w-full h-full rounded bg-gradient-to-br from-amber-400 via-yellow-400 to-yellow-500 flex flex-col items-center justify-center text-zinc-950 font-bold select-none p-1 shadow-inner shadow-yellow-300">
          <span className="text-2xl drop-shadow-sm font-extrabold">{firstLetter}</span>
          <span className="text-[9px] uppercase tracking-wider opacity-80 font-mono -mt-1">TV</span>
        </div>
      );
    }
    
    return (
      <img 
        src={channel.logo} 
        alt={channel.name} 
        className="max-w-full max-h-full object-contain"
        onError={() => {
          setFailedLogos(prev => ({ ...prev, [channel.id]: true }));
        }}
      />
    );
  };

  return (
    <Layout>
      <div className="pt-24 px-4 md:px-10 pb-20 min-h-screen text-white">
        <h1 className="text-3xl font-bold mb-6">IPTV Channels</h1>
        
        <div className="flex flex-col md:flex-row gap-6 h-[calc(100vh-140px)]">
          {/* Sidebar - Categories */}
          <div className="w-full md:w-64 flex-shrink-0 flex flex-col bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
            <div className="p-4 border-b border-zinc-800 bg-zinc-950">
              <h2 className="font-bold mb-2">Categories</h2>
              <div className="relative">
                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"></i>
                <input
                  type="text"
                  placeholder="Search category..."
                  value={categorySearchQuery}
                  onChange={(e) => setCategorySearchQuery(e.target.value)}
                  className="bg-zinc-800 text-white pl-9 pr-3 py-1.5 rounded-md outline-none focus:ring-1 focus:ring-red-600 w-full text-xs"
                />
              </div>
            </div>
            <div className="overflow-y-auto no-scrollbar flex-1">
              {filteredCategories.map((cat) => (
                <button
                  key={cat.name}
                  onClick={() => setSelectedCategory(cat)}
                  className={`w-full text-left px-4 py-3 border-b border-zinc-800/50 hover:bg-zinc-800 focus:outline-none transition-colors ${
                    selectedCategory.name === cat.name ? 'bg-red-600/20 text-red-500 border-l-4 border-l-red-600' : 'text-zinc-300'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span>{cat.name}</span>
                    <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">{cat.count}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Main Content - Channels */}
          <div className="flex-1 flex flex-col bg-zinc-900/50 rounded-lg border border-zinc-800 overflow-hidden">
            <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950">
              <h2 className="font-bold text-lg">{selectedCategory.name} Channels ({filteredChannels.length})</h2>
              <div className="relative">
                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"></i>
                <input
                  type="text"
                  placeholder="Search channel..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-zinc-800 text-white pl-10 pr-4 py-2 rounded-full outline-none focus:ring-1 focus:ring-red-600 w-48 md:w-64 text-sm"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
              {loading ? (
                <div className="flex justify-center items-center h-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-red-600"></div>
                </div>
              ) : filteredChannels.length === 0 ? (
                <div className="flex justify-center items-center h-full text-zinc-500">
                  No channels found.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {filteredChannels.map((channel) => (
                    <button
                      key={channel.id}
                      onClick={() => handlePlayChannel(channel)}
                      className="group bg-zinc-800 hover:bg-zinc-700 rounded-lg p-3 transition-all flex flex-col items-center justify-center text-center gap-3 border border-zinc-700 hover:border-red-600 focusable"
                    >
                      <div className="w-16 h-16 rounded overflow-hidden p-0.5 flex items-center justify-center border border-zinc-700 group-hover:border-red-600/50">
                        {renderChannelLogo(channel)}
                      </div>
                      <span className="text-sm font-semibold text-zinc-300 group-hover:text-white line-clamp-2">
                        {channel.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default IptvPage;
