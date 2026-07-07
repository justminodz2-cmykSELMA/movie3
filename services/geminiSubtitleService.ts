// ============================================================
// Gemini subtitle translation service
// ------------------------------------------------------------
// Translates a full SRT/VTT subtitle file into a target language
// with Gemini while preserving cue numbers and timestamps perfectly.
// Used by the "AI Subtitles" addon.
// ============================================================

import { GoogleGenAI, Type } from "@google/genai";

const MODEL = "gemini-3.5-flash";
const MAX_TOTAL_CUES = 1200; // safety cap on very large subtitle files

interface SubtitleCue {
  index: string;      // cue number or identifier (if any, e.g. "1")
  timing: string;     // the complete timing line, e.g., "00:00:06.120 --> 00:00:08.720"
  text: string;       // the dialogue lines
}

/** Parse any SRT or WebVTT file into clean cues, keeping timings verbatim. */
function parseSubtitles(content: string): SubtitleCue[] {
  const normalized = content.replace(/\r/g, '');
  const blocks = normalized.split(/\n\n+/);
  const cues: SubtitleCue[] = [];
  const timingRegex = /((?:\d{2}:)?\d{2}:\d{2}[,.]\d{3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}[,.]\d{3})/;

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l !== '');
    if (lines.length === 0) continue;
    
    // Find the timing line in this block
    let timingIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (timingRegex.test(lines[i])) {
        timingIndex = i;
        break;
      }
    }
    
    if (timingIndex === -1) {
      // No timing line found (e.g., file headers or comments), safe to skip
      continue;
    }
    
    const timing = lines[timingIndex];
    // Any line before the timing line is the index (or identifier)
    const index = timingIndex > 0 ? lines.slice(0, timingIndex).join(' ') : '';
    // Any line after the timing line is the dialogue text
    const text = lines.slice(timingIndex + 1).join('\n');
    
    cues.push({ index, timing, text });
    if (cues.length >= MAX_TOTAL_CUES) break;
  }
  
  return cues;
}

/**
 * Translates subtitle content into the target language with Gemini.
 * Returns a valid subtitle string with identical timestamps and structure.
 * Throws when the API key is missing or every chunk fails.
 */
export const translateSrtWithGemini = async (
  srtContent: string,
  targetLanguageLabel: string,
  onProgress?: (done: number, total: number) => void,
): Promise<string> => {
  if (!process.env.API_KEY) {
    throw new Error("Gemini API key not configured");
  }
  
  const ai = new GoogleGenAI({ 
    apiKey: process.env.API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  const cues = parseSubtitles(srtContent);
  if (cues.length === 0) {
    throw new Error("Subtitle file is empty or invalid");
  }

  const BATCH_SIZE = 60; // Safe batch size for high-quality structured translations
  const batches: SubtitleCue[][] = [];
  for (let i = 0; i < cues.length; i += BATCH_SIZE) {
    batches.push(cues.slice(i, i + BATCH_SIZE));
  }

  const translatedTexts: string[] = new Array(cues.length);
  // Pre-populate with original text as a fallback
  for (let i = 0; i < cues.length; i++) {
    translatedTexts[i] = cues[i].text;
  }

  let successes = 0;

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const startIndex = b * BATCH_SIZE;
    const textsToTranslate = batch.map(c => c.text);

    const prompt = `You are an expert subtitle translator. Translate the following list of dialogue strings into ${targetLanguageLabel}.
    
STRICT RULES:
1. Translate each dialogue string accurately and naturally into ${targetLanguageLabel}.
2. Keep the translation concise, simple and natural so it fits on screen as a subtitle.
3. Preserve HTML tags like <i></i>, <b></b> and music notes (♪) exactly as they are.
4. Return a JSON array of strings containing EXACTLY the same number of elements (${textsToTranslate.length} elements) as the input array.
5. The order of items in the output array must match the input array exactly. Do not skip, merge, or reorder any items.`;

    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: [
          { text: prompt },
          { text: JSON.stringify(textsToTranslate) }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING
            }
          }
        }
      });

      const textOutput = response.text || '';
      const parsed = JSON.parse(textOutput);
      if (Array.isArray(parsed) && parsed.length === textsToTranslate.length) {
        for (let j = 0; j < parsed.length; j++) {
          translatedTexts[startIndex + j] = String(parsed[j]);
        }
        successes++;
      } else {
        console.warn(`Gemini batch ${b} returned length mismatch. Expected ${textsToTranslate.length}, got ${parsed?.length}.`);
      }
    } catch (error) {
      console.error(`Gemini subtitle translation batch ${b} failed:`, error);
    }

    if (onProgress) {
      onProgress(b + 1, batches.length);
    }
  }

  if (successes === 0) {
    throw new Error("AI subtitle translation failed");
  }

  // Reconstruct the clean subtitle list
  // Note: We intentionally omit any "WEBVTT" header here, because Player.tsx always prepends it itself.
  // This completely avoids any double WEBVTT headers that corrupt subtitle rendering in the browser player!
  return cues
    .map((cue, i) => {
      const text = translatedTexts[i];
      if (cue.index) {
        return `${cue.index}\n${cue.timing}\n${text}`;
      } else {
        return `${cue.timing}\n${text}`;
      }
    })
    .join('\n\n') + '\n';
};

