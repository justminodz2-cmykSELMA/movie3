

// PERF: @google/genai (~200KB) is now dynamically imported inside
// analyzeSubtitlesForSkips() so it never loads at app startup — it only
// downloads the moment subtitle skip-analysis is actually requested.
// Behavior, logic, and all fetching code are 100% identical.
import type { GoogleGenAI as GoogleGenAIType } from "@google/genai";
import { TMDB_API_KEY, TMDB_BASE_URL, SCRAPER_API_URL, AVAILABLE_PROVIDERS } from '../contexts/constants';
import { Movie, SubtitleTrack, StreamLink, StreamData } from '../types';

const fetchWithTimeout = async (resource: RequestInfo, options: RequestInit & { timeout?: number } = {}) => {
  const { timeout = 15000, ...fetchOptions } = options; // Increased default timeout for scraper
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
      const response = await fetch(resource, {
        ...fetchOptions,
        signal: controller.signal
      });
      clearTimeout(id);
      return response;
  } catch(error: any) {
      clearTimeout(id);
      if (error.name === 'AbortError') {
          throw new Error('The request timed out. The server took too long to respond.');
      }
      // This is a common browser error for CORS issues or network failures.
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
          throw new Error('Network Error: Could not connect to the server. Please ensure the backend server is running and configured for cross-origin requests.');
      }
      // Re-throw other unexpected errors.
      throw error;
  }
};


const fetchWithHeaders = async (url: string, options: RequestInit & { timeout?: number } = {}) => {
    const response = await fetchWithTimeout(url, options);
    if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch (e) {
            errorData = await response.text();
        }
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorData) || response.statusText}`);
    }
    const contentType = response.headers.get("content-type");
    return contentType?.includes("application/json") ? response.json() : response.text();
};


export const fetchFromTMDB = async (endpoint: string, params: Record<string, string | number | boolean> = {}) => {
  const lang = localStorage.getItem('cineStreamLanguage') || 'en';
  const defaultParams = {
    api_key: TMDB_API_KEY,
    language: lang === 'ar' ? 'ar-SA' : 'en-US',
  };
  const urlParams = new URLSearchParams({ ...defaultParams, ...params } as Record<string, string>);
  const url = `${TMDB_BASE_URL}${endpoint}?${urlParams}`;
  return fetchWithHeaders(url);
};

export const fetchStreamUrl = async (
    item: Movie,
    media_type: 'movie' | 'tv',
    season?: number | null,
    episode?: number | null,
    specificProvider?: string,
    serverPreferences: string[] = [],
    dubLang?: 'ar' | 'fr' | null
): Promise<StreamData & { provider: string }> => {
    const cacheKey = `stream_cache_v4_${media_type}_${item.id}${season ? `_s${season}`:''}${episode ? `_e${episode}`:''}${specificProvider ? `_p${specificProvider}`: '_p_auto'}${dubLang ? `_d${dubLang}`: ''}`;
    try {
        const cachedItem = localStorage.getItem(cacheKey);
        if (cachedItem) {
            const parsed: { data: StreamData & { provider: string }; expiry: number } = JSON.parse(cachedItem);
            if (Date.now() < parsed.expiry) {
                console.log("Returning stream URL from cache.", parsed.data);
                return parsed.data;
            } else {
                localStorage.removeItem(cacheKey);
                console.log("Removed expired stream URL from cache.");
            }
        }
    } catch (e) {
        console.error("Error reading from stream cache:", e);
    }
    
    // Titles are only needed by TITLE-based providers (akwam, aflam, moviebox...).
    // Fetch them lazily (and only once) so TMDB-id providers like VidSrc start
    // playback immediately without waiting for two extra TMDB round-trips.
    let titlesPromise: Promise<{ englishTitle: string; arabicTitle: string }> | null = null;
    const getTitles = () => {
        if (!titlesPromise) {
            titlesPromise = (async () => {
                try {
                    const [detailsInEnglish, detailsInArabic] = await Promise.all([
                        fetchFromTMDB(`/${media_type}/${item.id}`, { language: 'en-US' }),
                        fetchFromTMDB(`/${media_type}/${item.id}`, { language: 'ar-SA' })
                    ]);
                    return {
                        englishTitle: detailsInEnglish.title || detailsInEnglish.name || item.original_title || item.title || '',
                        arabicTitle: detailsInArabic.title || detailsInArabic.name || ''
                    };
                } catch (err) {
                    console.error("Failed to fetch titles, will fall back to item's default title.", err);
                    // We can't get arabic title if the call fails, so arabic-toons will likely fail.
                    return {
                        englishTitle: item.title || item.name || item.original_title || '',
                        arabicTitle: ''
                    };
                }
            })();
        }
        return titlesPromise;
    };

    const allProviders = AVAILABLE_PROVIDERS;

    let providersToTry;

    if (specificProvider) {
        providersToTry = allProviders.filter(p => p.id === specificProvider || p.name === specificProvider);
    } else if (serverPreferences && serverPreferences.length > 0) {
        const preferredProviderObjects = serverPreferences
            .map(id => allProviders.find(p => p.id === id))
            .filter((p): p is { id: string; name: string } => !!p);
        
        const remainingProviders = allProviders.filter(p => !serverPreferences.includes(p.id));
        
        providersToTry = [...preferredProviderObjects, ...remainingProviders];
    } else {
        providersToTry = allProviders;
    }
    
    if (providersToTry.length === 0 && specificProvider) {
        throw new Error(`Provider ${specificProvider} is not a valid provider.`);
    }


    for (const provider of providersToTry) {
        try {
            console.log(`Trying provider: ${provider.name}`);

            // VidSrc (vsembed) works directly with TMDB ids via our own backend extractor.
            if (provider.id === 'vsembed') {
                const vsParams = new URLSearchParams();
                vsParams.append('type', media_type);
                vsParams.append('tmdb_id', String(item.id));
                if (media_type === 'tv') {
                    if (season) vsParams.append('season', String(season));
                    if (episode) vsParams.append('episode', String(episode));
                }

                const vsData: any = await fetchWithHeaders(`/api/vs-extract?${vsParams.toString()}`);
                if (!vsData || vsData.success !== true) {
                    throw new Error('VidSrc: no stream found');
                }
                const vsFirst: any = Object.values(vsData.results || {}).find((r: any) => r && r.hls_url);
                if (!vsFirst) {
                    throw new Error('VidSrc: no working stream found');
                }

                const vsResult: StreamData & { provider: string } = {
                    links: [{ quality: 'Auto', url: vsFirst.hls_url }],
                    provider: provider.name,
                };

                if (Array.isArray(vsFirst.subtitles) && vsFirst.subtitles.length > 0) {
                    const vsLangMap: Record<string, string> = {
                        'english': 'en', 'arabic': 'ar', 'french': 'fr', 'spanish': 'es',
                        'german': 'de', 'italian': 'it', 'portuguese': 'pt', 'russian': 'ru',
                        'turkish': 'tr', 'chinese': 'zh', 'japanese': 'ja', 'korean': 'ko', 'hindi': 'hi'
                    };
                    const vsSeen = new Set<string>();
                    vsResult.subtitles = vsFirst.subtitles
                        .filter((s: any) => s && s.url)
                        .filter((s: any) => {
                            const key = (s.lang || 'Sub') + s.url;
                            if (vsSeen.has(key)) return false;
                            vsSeen.add(key);
                            return true;
                        })
                        .map((s: any) => {
                            const label = s.lang || 'Sub';
                            const code = vsLangMap[label.toLowerCase()] || label;
                            return {
                                display: label,
                                language: code,
                                url: `/api/vs-sub?url=${encodeURIComponent(s.url)}`,
                                filename: s.filename,
                                release: s.release,
                                downloads: s.downloads,
                                rating: s.rating
                            };
                        });
                }

                try {
                    const expiry = Date.now() + 30 * 60 * 1000; // 30 minute expiry
                    localStorage.setItem(cacheKey, JSON.stringify({ data: vsResult, expiry }));
                } catch (e) {
                    console.error("Error writing to stream cache:", e);
                }

                console.log(`Success with provider: ${provider.name}`);
                return vsResult;
            }

            const params = new URLSearchParams();
            
            if (provider.id === 'td') {
                params.append('provider', 'tmdb');
            } else {
                params.append('provider', provider.id);
            }

            if (provider.id === 'ristoanime' && media_type !== 'tv') {
                console.log(`Skipping ristoanime for non-series content.`);
                continue;
            }

            params.append('type', media_type === 'tv' ? 'series' : 'movie');

            if (provider.id === 'veloratv' || provider.id === 'td') {
                params.append('tmdb_id', String(item.id));
            } else { // akwam, ristoanime, aflam, arabic-toons, and moviebox use title for searching
                 let titleToScrape = '';
                 const { englishTitle, arabicTitle } = await getTitles();

                 if (provider.id === 'arabic-toons') {
                    if (!arabicTitle) {
                        console.warn("Arabic title not available for 'arabic-toons', skipping provider.");
                        continue;
                    }
                    titleToScrape = arabicTitle;
                 } else {
                     if (!englishTitle) {
                         console.warn("English title not available, skipping title-based provider:", provider.name);
                         continue;
                     }
                     titleToScrape = englishTitle;
                 }

                 if (provider.id === 'moviebox' && dubLang) {
                    if (dubLang === 'ar') {
                        titleToScrape = `${titleToScrape} [Arabic]`;
                    } else if (dubLang === 'fr') {
                        titleToScrape = `${titleToScrape} [Version française]`;
                    }
                 }

                 params.append('title', titleToScrape);
            }

            if (media_type === 'tv') {
                if (season) params.append('season', String(season));
                if (episode) params.append('episode', String(episode));
            }
            
            const targetUrl = `${SCRAPER_API_URL}?${params.toString()}`;
            
            const responseData = await fetchWithHeaders(targetUrl, {
                headers: {
                    'ngrok-skip-browser-warning': 'true'
                }
            });

            if (typeof responseData !== 'object' || responseData === null) {
                throw new Error('Invalid response from scraper API');
            }
            
            const typedResponse = responseData as { status: string, links?: StreamLink[], subtitles?: { lang: string, url: string }[], message?: string };

            if (typedResponse.status === 'success' && Array.isArray(typedResponse.links) && typedResponse.links.length > 0) {
                console.log(`Success with provider: ${provider.name}`);
                
                let finalLinks = typedResponse.links;
                // For MovieBox, if MP4 links are available, use them exclusively as HLS can be unreliable.
                if (provider.id === 'moviebox') {
                    const mp4Links = finalLinks.filter(link => link.url.toLowerCase().includes('.mp4') || link.quality.toLowerCase().includes('mp4'));
                    if (mp4Links.length > 0) {
                        console.log("MovieBox: MP4 links found, prioritizing them over HLS.");
                        finalLinks = mp4Links;
                    }
                }
                
                const PROXY_URL = 'https://12spapi.fly.dev';
                // Build proxied links for moviebox to ensure CORS compatibility, especially for local development.
                let processedLinks = finalLinks.map(link => {
                    if (provider.id === 'moviebox') {
                        return { ...link, url: `${PROXY_URL}/proxy?url=${encodeURIComponent(link.url)}` };
                    }
                    return link;
                });

                if (provider.id === 'moviebox') {
                    const hostRank = (urlStr: string): number => {
                        try {
                            const host = new URL(urlStr).hostname;
                            if (host.includes('valiw.')) return 0; // commonly allowed by proxy
                            if (host.includes('hakunaymatata.com')) return 1;
                            return 2;
                        } catch {
                            return 3;
                        }
                    };
                    processedLinks.sort((a, b) => hostRank(a.url) - hostRank(b.url));
                }
        
                const result: StreamData & { provider: string } = {
                    links: processedLinks,
                    provider: provider.name
                };

                if (typedResponse.subtitles && Array.isArray(typedResponse.subtitles)) {
                    const langMap: Record<string, string> = {
                        'اَلْعَرَبِيَّةُ': 'ar', 'arabic': 'ar', 'arbic': 'ar', 'english': 'en', 'englsh': 'en', 'français': 'fr', 'french': 'fr',
                        '中文': 'zh', 'chinese': 'zh', 'português': 'pt', 'portuguese': 'pt', 'indonesian': 'id',
                        'filipino': 'tl', 'اُردُو': 'ur', 'urdu': 'ur', 'বাংলা': 'bn', 'bengali': 'bn',
                        'ar': 'ar', 'en': 'en', 'fr': 'fr', 'zh': 'zh', 'pt': 'pt', 'id': 'id', 'tl': 'tl', 'ur': 'ur', 'bn': 'bn',
                        'es': 'es', 'es-la': 'es', 'es-es': 'es', 'spanish': 'es',
                        'hi': 'hi', 'hindi': 'hi',
                        'ja': 'ja', 'japanese': 'ja',
                        'ko': 'ko', 'korean': 'ko',
                        'ru': 'ru', 'russian': 'ru',
                        'de': 'de', 'german': 'de',
                        'it': 'it', 'italian': 'it',
                        'tr': 'tr', 'turkish': 'tr',
                        'vi': 'vi', 'vietnamese': 'vi',
                        'th': 'th', 'thai': 'th',
                        'nl': 'nl', 'dutch': 'nl',
                        'pl': 'pl', 'polish': 'pl',
                        'in_id': 'id', 'ms': 'ms', 'malay': 'ms',
                        'fil': 'tl'
                    };
                    const codeToDisplayMap: Record<string, string> = {
                        'ar': 'Arabic', 'en': 'English', 'fr': 'French', 'zh': 'Chinese', 'pt': 'Portuguese',
                        'id': 'Indonesian', 'tl': 'Filipino', 'ur': 'Urdu', 'bn': 'Bengali', 'es': 'Spanish',
                        'hi': 'Hindi', 'ja': 'Japanese', 'ko': 'Korean', 'ru': 'Russian', 'de': 'German',
                        'it': 'Italian', 'tr': 'Turkish', 'vi': 'Vietnamese', 'th': 'Thai', 'nl': 'Dutch',
                        'pl': 'Polish', 'ms': 'Malay'
                    };
                    const uniqueSubs = new Map<string, { lang: string, url: string }>();
                    for (const sub of typedResponse.subtitles) {
                        if (!uniqueSubs.has(sub.lang)) {
                            uniqueSubs.set(sub.lang, sub);
                        }
                    }
                    result.subtitles = Array.from(uniqueSubs.values()).map(sub => {
                        let langCode = 'unknown';
                        const normalizedLang = sub.lang.toLowerCase();
                        
                        if (langMap[normalizedLang]) {
                            langCode = langMap[normalizedLang];
                        } else {
                            for (const key in langMap) {
                                if (normalizedLang.includes(key)) {
                                    langCode = langMap[key];
                                    break;
                                }
                            }
                        }
                        
                        // Fallback to the original language string if we couldn't map it, to ensure uniqueness
                        if (langCode === 'unknown') {
                             langCode = sub.lang;
                        }
                        
                        const displayStr = codeToDisplayMap[langCode] || sub.lang;

                        return { display: displayStr, language: langCode, url: sub.url };
                    });
                }

                try {
                    const expiry = Date.now() + 30 * 60 * 1000; // 30 minute expiry
                    localStorage.setItem(cacheKey, JSON.stringify({ data: result, expiry }));
                    console.log("Stream URL cached successfully.");
                } catch(e) {
                    console.error("Error writing to stream cache:", e);
                }

                return result;

            } else {
                const errorMessage = typedResponse.message || `Provider ${provider.name} failed to find links.`;
                throw new Error(errorMessage);
            }
        } catch (error: any) {
            console.error(`Error with provider ${provider.name}:`, error.message);
        }
    }

    throw new Error('Failed to get stream from all available providers. The content might not be available.');
};

// Lightweight IndexedDB helper for downloads
export const downloadVideoToIndexedDB = async (
    initialUrl: string,
    onProgress?: (received: number, total?: number) => void,
    getFreshUrl?: () => Promise<string>
): Promise<{ id: string, size: number }> => {
    const dbName = 'cineStreamDownloads';
    const storeName = 'videos';

    const openDB = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });

    const chunks: Uint8Array[] = [];
    const segmentSize = 5 * 1024 * 1024; // 5MB للبداية السريعة

    let url = initialUrl;

    // Determine total size and range support
    let total = 0;
    try {
        const probeResp = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } });
        if (probeResp.status === 206) {
            const contentRange = probeResp.headers.get('Content-Range');
            if (contentRange) {
                const match = /bytes \d+-\d+\/(\d+)/.exec(contentRange);
                if (match) total = parseInt(match[1], 10);
            }
        }
        if (total === 0) {
            const cl = probeResp.headers.get('Content-Length');
            if (cl) total = parseInt(cl, 10);
        }
        // If server ignored range and returned 200 with body for 1 byte, fallback to full
        if (probeResp.status === 200 && total === 0) {
            const cl = probeResp.headers.get('Content-Length');
            if (cl) total = parseInt(cl, 10);
        }
        // Consume body quietly
        try { await probeResp.body?.cancel(); } catch {}
    } catch (e) {
        // If probe fails, we'll fallback to full fetch below
    }

    // If cannot determine total or range not supported, fallback to single fetch
    if (!total || Number.isNaN(total)) {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Failed to download. HTTP ${resp.status}`);
        const fallbackTotal = Number(resp.headers.get('content-length') || 0);
        const reader = resp.body?.getReader();
        if (!reader) throw new Error('No readable stream');
        let received = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
                chunks.push(value);
                received += value.byteLength;
                if (onProgress) onProgress(received, fallbackTotal || undefined);
            }
        }
        const blob = new Blob(chunks, { type: 'video/mp4' });
        const id = `dl_${Date.now()}`;
        const db = await openDB();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            tx.objectStore(storeName).put(blob, id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
        return { id, size: blob.size };
    }

    // Segmented download with resume and URL renewal
    let received = 0;
    while (received < total) {
        const start = received;
        const end = Math.min(received + segmentSize - 1, total - 1);
        let attempts = 0;
        let success = false;
        // Try to fetch this segment with retries and optional URL refresh
        while (attempts < 3 && !success) {
            attempts++;
            try {
                const resp = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
                if (!(resp.status === 206 || (resp.status === 200 && start === 0))) {
                    throw new Error(`Unexpected HTTP ${resp.status} for range ${start}-${end}`);
                }
                const reader = resp.body?.getReader();
                if (!reader) throw new Error('No readable stream');
                let segReceived = 0;
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (value) {
                        chunks.push(value);
                        segReceived += value.byteLength;
                        received += value.byteLength;
                        if (onProgress) onProgress(received, total);
                    }
                }
                success = true;
            } catch (err) {
                // Try to renew URL and retry
                if (getFreshUrl) {
                    try {
                        url = await getFreshUrl();
                    } catch {}
                }
                if (attempts >= 3) throw err;
            }
        }
    }
    const blob = new Blob(chunks, { type: 'video/mp4' });
    const id = `dl_${Date.now()}`;
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(blob, id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    db.close();
    return { id, size: blob.size };
};


export const getDownloadedVideoURL = async (id: string): Promise<string | null> => {
    const dbName = 'cineStreamDownloads';
    const storeName = 'videos';

    const openDB = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });

    const db = await openDB();
    const blob: Blob | null = await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
    db.close();
    if (!blob) return null;
    return URL.createObjectURL(blob);
};

// Schema is built lazily with the dynamically imported Type enum so the SDK
// is not needed at module load. Values are identical to before.
const buildSkipTimesSchema = (Type: typeof import("@google/genai").Type) => ({
    type: Type.OBJECT,
    properties: {
        intro: {
            type: Type.OBJECT,
            nullable: true,
            properties: {
                start: { type: Type.NUMBER, description: "The start time of the intro in seconds from the beginning of the video." },
                end: { type: Type.NUMBER, description: "The end time of the intro in seconds from the beginning of the video." }
            },
            required: ['start', 'end']
        },
        outro: {
            type: Type.OBJECT,
            nullable: true,
            properties: {
                start: { type: Type.NUMBER, description: "The start time of the outro in seconds from the beginning of the video." },
                end: { type: Type.NUMBER, description: "The end time of the outro in seconds from the beginning of the video." }
            },
            required: ['start', 'end']
        }
    }
});

import { SCRAPER_API_URL } from '../contexts/constants';

export const analyzeSubtitlesForSkips = async (srtContent: string): Promise<{ intro: { start: number, end: number } | null; outro: { start: number, end: number } | null; }> => {
    if (!process.env.API_KEY) {
        console.error("Gemini API key not found.");
        return { intro: null, outro: null };
    }
    const { GoogleGenAI, Type } = await import("@google/genai");
    const skipTimesSchema = buildSkipTimesSchema(Type);
    const ai: GoogleGenAIType = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const prompt = `You are an expert video editor's assistant. Your task is to analyze subtitle files (SRT format) to identify the start and end times for the intro and outro sequences.

Analyze the provided SRT content. Look for significant gaps in dialogue that match typical intro/outro durations. Intros usually happen within the first few minutes, and outros at the very end. The presence of musical notes (♪) can also be an indicator, but the primary signal is a lack of spoken words for a sustained period (e.g., 30-90 seconds).

Here are typical durations:
- Modern series (Netflix, HBO): 30–90 seconds for intros.
- Anime series: 60-90 seconds for intros.
- Outros are usually shorter, 30-60 seconds, and occur before the absolute end of the file.

Return your findings as a JSON object that strictly follows the provided schema. The times must be in seconds. If an intro or outro is not detected, its value should be null.

SRT Content:
"""
${srtContent.substring(0, 40000)}
"""
`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: skipTimesSchema,
            },
        });
        
        const jsonText = response.text.trim();
        const parsed = JSON.parse(jsonText);
        
        const result = {
            intro: parsed.intro && typeof parsed.intro.start === 'number' && typeof parsed.intro.end === 'number' ? { start: parsed.intro.start, end: parsed.intro.end } : null,
            outro: parsed.outro && typeof parsed.outro.start === 'number' && typeof parsed.outro.end === 'number' ? { start: parsed.outro.start, end: parsed.outro.end } : null,
        };

        console.log("Gemini analysis result:", result);
        return result;

    } catch (error) {
        console.error("Error analyzing subtitles with Gemini:", error);
        return { intro: null, outro: null };
    }
};

export interface DubbingSegment {
    audio_url: string;
    start_ms: number;
    end_ms: number;
    text: string;
}

export interface DubbingBatch {
    batch: DubbingSegment[];
    progress: string;
}

export const streamDubbing = async (
    srtUrl: string,
    onData: (data: DubbingBatch) => void,
    onError: (error: Error) => void,
    onClose: () => void
) => {
    const baseUrl = new URL(SCRAPER_API_URL).origin;
    const DUBBING_API_URL = `${baseUrl}/dub`;
    const encodedUrl = encodeURIComponent(srtUrl);
    const fullUrl = `${DUBBING_API_URL}?url=${encodedUrl}`;

    console.log(`Starting dubbing stream from: ${fullUrl}`);

    try {
        const response = await fetch(fullUrl, {
            headers: { 'ngrok-skip-browser-warning': 'true' }
        });

        if (!response.ok || !response.body) {
            const errorText = await response.text();
            throw new Error(`Dubbing service failed with status ${response.status}: ${errorText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                console.log('Dubbing stream finished.');
                onClose();
                break;
            }
            
            buffer += decoder.decode(value, { stream: true });
            
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const data = JSON.parse(line) as DubbingBatch;
                        onData(data);
                    } catch (e) {
                        console.warn('Failed to parse JSON line from dubbing stream:', line, e);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error in dubbing stream:', error);
        onError(error as Error);
    }
};
