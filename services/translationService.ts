

import { SCRAPER_API_URL } from '../contexts/constants';

/**
 * WARNING: This service uses an unofficial, public Google Translate API endpoint.
 * It is not guaranteed to be stable and may be rate-limited or blocked by Google at any time.
 * For production applications, it is highly recommended to use the official Google Cloud Translation API
 * via a secure backend server to protect your API key.
 */

// FINAL FIX: Update the regex to be flexible, accepting both comma and period, and optional spaces around "-->". And handle end of file correctly.
const srtBlockRegex = /(\d+)\n(\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3})\n([\s\S]+?)(?=\n\n|$)/g;


interface SrtBlock {
    index: string;
    timestamp: string;
    text: string;
    isTranslatable?: boolean;
}

const parseSrt = (srtContent: string): SrtBlock[] => {
    const blocks: SrtBlock[] = [];
    let match;
    srtBlockRegex.lastIndex = 0; // Reset regex state
    while ((match = srtBlockRegex.exec(srtContent)) !== null) {
        const text = match[3].trim();
        blocks.push({
            index: match[1],
            timestamp: match[2],
            text: text,
        });
    }
    return blocks;
};

const reconstructSrt = (blocks: SrtBlock[]): string => {
    return blocks
        .map(block => `${block.index}\n${block.timestamp}\n${block.text}`)
        .join('\n\n');
};

const translateTextBatch = async (texts: string[], targetLang: string): Promise<string[]> => {
    if (texts.length === 0) return [];
    
    const separator = " ||| ";
    const combinedText = texts.join(separator);

    const url = new URL('https://translate.googleapis.com/translate_a/single');
    url.searchParams.append('client', 'gtx');
    url.searchParams.append('sl', 'auto');
    url.searchParams.append('tl', targetLang);
    url.searchParams.append('dt', 't');
    url.searchParams.append('q', combinedText);

    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`Translation API failed: ${response.status}`);
    
    const data = await response.json();
    if (!data || !data[0] || !data[0][0] || !data[0][0][0]) {
        throw new Error("Invalid response from translation API");
    }

    const translatedFullText = data[0][0][0];
    const translatedTexts = translatedFullText.split(separator.trim());
    
    if (targetLang === 'ar') {
        return translatedTexts.map(text => text.replace(/\.+$/, ''));
    }
    
    return translatedTexts;
};

export const translateSrtViaGoogle = async (srtContent: string, targetLang: string = 'ar'): Promise<string | null> => {
    try {
        console.log(`Sending translation request for ${srtContent.length} characters to Python service...`);
        const requestBody = {
            srt_content: srtContent,
            target_lang: targetLang
        };
        
        const baseUrl = new URL(SCRAPER_API_URL).origin;
        
        const response = await fetch(`${baseUrl}/translate_srt`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            console.error(`Translation service error: ${response.status}`);
            const errorText = await response.text();
            console.error('Error response:', errorText);
            return await translateSrtViaGoogleFallback(srtContent, targetLang);
        }

        const data = await response.json();
        console.log('Translation response received:', Object.keys(data));
        
        if (data.error || !data.translated_srt) {
            console.error("Translation service error:", data.error);
            return await translateSrtViaGoogleFallback(srtContent, targetLang);
        }

        // Sanitize the response from the backend by parsing and reconstructing it.
        // This ensures consistent formatting and fixes issues with mixed content.
        const srtBlocks = parseSrt(data.translated_srt);
        const sanitizedSrt = reconstructSrt(srtBlocks);
        return sanitizedSrt;

    } catch (error) {
        console.error("Error connecting to translation service:", error);
        return await translateSrtViaGoogleFallback(srtContent, targetLang);
    }
};

const translateSrtViaGoogleFallback = async (srtContent: string, targetLang: string = 'ar'): Promise<string | null> => {
    try {
        // This fallback logic now becomes the reference for how SRT should be handled.
        const parseForFallback = (content: string): SrtBlock[] => {
            const blocks: SrtBlock[] = [];
            let match;
            srtBlockRegex.lastIndex = 0;
            while ((match = srtBlockRegex.exec(content)) !== null) {
                const text = match[3].trim();
                const isTranslatable = !(text.startsWith('[') && text.endsWith(']')) && !text.startsWith('♪');
                blocks.push({ index: match[1], timestamp: match[2].trim(), text: text, isTranslatable: isTranslatable });
            }
            return blocks;
        };

        const srtBlocks = parseForFallback(srtContent);
        if (srtBlocks.length === 0) return srtContent;

        const translatableBlocks = srtBlocks.filter(b => b.isTranslatable);
        const originalTextsToTranslate = translatableBlocks.map(b => b.text.replace(/\n/g, ' '));
        const translatedTexts = await translateTextBatch(originalTextsToTranslate, targetLang);

        if (originalTextsToTranslate.length !== translatedTexts.length) {
            console.warn("Mismatch in translated segments count. Aborting.");
            return null;
        }

        const translationMap = new Map<string, string>();
        originalTextsToTranslate.forEach((original, index) => {
            translationMap.set(original, translatedTexts[index]);
        });

        const finalSrtBlocks = srtBlocks.map(block => {
            if (block.isTranslatable) {
                const originalKey = block.text.replace(/\n/g, ' ');
                const translatedText = translationMap.get(originalKey);
                if (translatedText) {
                    return { ...block, text: translatedText };
                }
            }
            return block;
        });
        
        return reconstructSrt(finalSrtBlocks);
    } catch (error) {
        console.error("Error translating SRT content:", error);
        return null;
    }
};
