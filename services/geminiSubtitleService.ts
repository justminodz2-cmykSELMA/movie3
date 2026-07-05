// ============================================================
// Gemini subtitle translation service
// ------------------------------------------------------------
// Translates a full SRT subtitle file into a target language
// with Gemini while preserving cue numbers and timestamps, so
// the result can be rendered as a normal subtitle track in the
// player's Subtitles panel. Used by the "AI Subtitles" addon.
// ============================================================

import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-3.5-flash";
const MAX_TOTAL_CHARS = 120_000;   // safety cap on very large subtitle files
const CHUNK_CHAR_TARGET = 14_000;  // per-request payload target
const MAX_CHUNKS = 8;

/** Split an SRT file into chunks on cue boundaries (blank lines). */
function chunkSrt(srt: string): string[] {
  const cues = srt.replace(/\r/g, '').split(/\n\n+/).filter(c => c.trim());
  const chunks: string[] = [];
  let current: string[] = [];
  let size = 0;
  for (const cue of cues) {
    if (size + cue.length > CHUNK_CHAR_TARGET && current.length > 0) {
      chunks.push(current.join('\n\n'));
      current = [];
      size = 0;
    }
    current.push(cue);
    size += cue.length + 2;
  }
  if (current.length) chunks.push(current.join('\n\n'));
  return chunks.slice(0, MAX_CHUNKS);
}

/** Strip markdown fences Gemini sometimes wraps around raw output. */
function stripFences(text: string): string {
  return text.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
}

/**
 * Translates SRT content into the target language with Gemini.
 * Returns a valid SRT string with identical timestamps.
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
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const chunks = chunkSrt(srtContent.slice(0, MAX_TOTAL_CHARS));
  if (chunks.length === 0) throw new Error("Subtitle file is empty");

  const translated: string[] = [];
  let failures = 0;

  for (let i = 0; i < chunks.length; i++) {
    const prompt = `You are a professional subtitle translator. Translate the dialogue text of the following SRT subtitle cues into ${targetLanguageLabel}.

STRICT RULES:
- Keep every cue number and every timestamp line (e.g. "00:01:02,500 --> 00:01:04,000") EXACTLY as they are. Never change, merge, drop or reorder cues.
- Translate ONLY the dialogue text lines.
- Keep the translation natural, fluent and concise so it fits on screen.
- Preserve italics tags like <i></i> and music notes (♪) if present.
- Output the raw SRT content only — no explanations, no markdown fences.

SRT CUES:
"""
${chunks[i]}
"""`;

    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
      });
      const text = stripFences(response.text || '');
      if (text) translated.push(text);
      else failures++;
    } catch (error) {
      console.error("Gemini subtitle translation chunk failed:", error);
      failures++;
      // Keep the original cues for a failed chunk so timing stays intact.
      translated.push(chunks[i]);
    }
    if (onProgress) onProgress(i + 1, chunks.length);
  }

  if (failures >= chunks.length) {
    throw new Error("AI subtitle translation failed");
  }
  return translated.join('\n\n');
};
