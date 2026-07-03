export interface IptvCategory {
  name: string;
  count: number;
  url: string;
}

export const iptvCategories: IptvCategory[] = [
  { name: 'Main (Ugeen)', count: 0, url: 'https://ugeen.live/get.php?username=Ugeen_VIPpHH2vT&password=qTMubv&type=m3u&output=ts' },
  { name: 'All Channels', count: 0, url: 'https://iptv-org.github.io/iptv/index.m3u' },
  { name: 'Animation', count: 170, url: 'https://iptv-org.github.io/iptv/categories/animation.m3u' },
  { name: 'Auto', count: 30, url: 'https://iptv-org.github.io/iptv/categories/auto.m3u' },
  { name: 'Business', count: 76, url: 'https://iptv-org.github.io/iptv/categories/business.m3u' },
  { name: 'Classic', count: 110, url: 'https://iptv-org.github.io/iptv/categories/classic.m3u' },
  { name: 'Comedy', count: 219, url: 'https://iptv-org.github.io/iptv/categories/comedy.m3u' },
  { name: 'Cooking', count: 52, url: 'https://iptv-org.github.io/iptv/categories/cooking.m3u' },
  { name: 'Culture', count: 181, url: 'https://iptv-org.github.io/iptv/categories/culture.m3u' },
  { name: 'Documentary', count: 221, url: 'https://iptv-org.github.io/iptv/categories/documentary.m3u' },
  { name: 'Education', count: 242, url: 'https://iptv-org.github.io/iptv/categories/education.m3u' },
  { name: 'Entertainment', count: 880, url: 'https://iptv-org.github.io/iptv/categories/entertainment.m3u' },
  { name: 'Family', count: 57, url: 'https://iptv-org.github.io/iptv/categories/family.m3u' },
  { name: 'General', count: 2640, url: 'https://iptv-org.github.io/iptv/categories/general.m3u' },
  { name: 'Interactive', count: 1, url: 'https://iptv-org.github.io/iptv/categories/interactive.m3u' },
  { name: 'Kids', count: 397, url: 'https://iptv-org.github.io/iptv/categories/kids.m3u' },
  { name: 'Legislative', count: 190, url: 'https://iptv-org.github.io/iptv/categories/legislative.m3u' },
  { name: 'Lifestyle', count: 129, url: 'https://iptv-org.github.io/iptv/categories/lifestyle.m3u' },
  { name: 'Movies', count: 709, url: 'https://iptv-org.github.io/iptv/categories/movies.m3u' },
  { name: 'Music', count: 738, url: 'https://iptv-org.github.io/iptv/categories/music.m3u' },
  { name: 'News', count: 990, url: 'https://iptv-org.github.io/iptv/categories/news.m3u' },
  { name: 'Outdoor', count: 66, url: 'https://iptv-org.github.io/iptv/categories/outdoor.m3u' },
  { name: 'Public', count: 38, url: 'https://iptv-org.github.io/iptv/categories/public.m3u' },
  { name: 'Relax', count: 8, url: 'https://iptv-org.github.io/iptv/categories/relax.m3u' },
  { name: 'Religious', count: 758, url: 'https://iptv-org.github.io/iptv/categories/religious.m3u' },
  { name: 'Science', count: 22, url: 'https://iptv-org.github.io/iptv/categories/science.m3u' },
  { name: 'Series', count: 544, url: 'https://iptv-org.github.io/iptv/categories/series.m3u' },
  { name: 'Shop', count: 82, url: 'https://iptv-org.github.io/iptv/categories/shop.m3u' },
  { name: 'Sports', count: 437, url: 'https://iptv-org.github.io/iptv/categories/sports.m3u' },
  { name: 'Travel', count: 49, url: 'https://iptv-org.github.io/iptv/categories/travel.m3u' },
  { name: 'Weather', count: 16, url: 'https://iptv-org.github.io/iptv/categories/weather.m3u' }
];

export interface IptvChannel {
  id: string;
  name: string;
  logo: string;
  streamUrl: string;
  group: string;
  playerType?: 'hls' | 'iframe';
}

export const getProxiedStreamUrl = (url: string): string => {
  if (!url) return url;
  // Don't proxy m3u8 URLs through the live-proxy, as HLS.js needs to resolve relative paths
  if (url.includes('.m3u8')) return url;
  if (url.startsWith('http://') || url.includes('ugeen.live')) {
    return `/api/live-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
};

export const parseM3u = (m3uText: string, maxChannels?: number): IptvChannel[] => {
  const lines = m3uText.split('\n');
  const channels: IptvChannel[] = [];
  let currentChannel: Partial<IptvChannel> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF:')) {
      // Parse #EXTINF:-1 tvg-id="" tvg-logo="https://..." group-title="...",Channel Name
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      const groupMatch = line.match(/group-title="([^"]+)"/);
      
      const parts = line.split(',');
      const name = parts.length > 1 ? parts[parts.length - 1].trim() : 'Unknown Channel';
      
      currentChannel = {
        id: Math.random().toString(36).substring(2, 11),
        name,
        logo: logoMatch ? logoMatch[1] : 'https://via.placeholder.com/150x150.png?text=TV',
        group: groupMatch ? groupMatch[1] : 'Uncategorized',
      };
    } else if (line.startsWith('http')) {
      if (currentChannel.name) {
        currentChannel.streamUrl = line;
        currentChannel.playerType = 'hls';
        channels.push(currentChannel as IptvChannel);
        currentChannel = {};
        if (maxChannels && channels.length >= maxChannels) {
          break;
        }
      }
    }
  }
  
  return channels;
};

export const fetchRandomCategoryChannels = async (): Promise<IptvChannel[]> => {
  // Exclude the 'All Channels' category (index 0) from random selection to avoid heavy downloads
  const categoriesToPickFrom = iptvCategories.slice(1);
  const randomCategory = categoriesToPickFrom[Math.floor(Math.random() * categoriesToPickFrom.length)];
  try {
    const proxiedUrl = `/api/m3u-proxy?url=${encodeURIComponent(randomCategory.url)}&limit=100`;
    const response = await fetch(proxiedUrl);
    if (!response.ok) throw new Error('Failed to fetch playlist');
    const text = await response.text();
    return parseM3u(text, 100);
  } catch (error) {
    console.error('Error fetching random IPTV category:', error);
    return [];
  }
};
