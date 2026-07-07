// ============================================================
// Fast subtitle translation service (non-AI)
// ------------------------------------------------------------
// When a title only has subtitles in a single language, this
// service quickly translates the SRT into other languages using
// the free Google Translate web endpoint (the same lightweight
// endpoint used by popular libraries like google-translate-api).
// No AI model and no API key involved — it is a plain machine
// translation call, so it is fast and free.
//
// Cue numbers and timestamps are never sent for translation:
// the SRT is parsed first, only the dialogue text lines are
// translated in batches, and the file is rebuilt with the
// original numbering/timing untouched.
// ============================================================

/** Languages offered for quick translation of a subtitle track. */
export const FAST_TRANSLATE_LANGS: { code: string; label: string }[] = [
  { code: 'ar', label: 'العربية (Arabic)' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français (French)' },
  { code: 'es', label: 'Español (Spanish)' },
  { code: 'de', label: 'Deutsch (German)' },
  { code: 'tr', label: 'Türkçe (Turkish)' },
  { code: 'it', label: 'Italiano (Italian)' },
  { code: 'pt', label: 'Português (Portuguese)' },
  { code: 'ru', label: 'Русский (Russian)' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
];

const BATCH_MAX_CUES = 60;       // cues per request
const BATCH_MAX_CHARS = 4_000;   // characters per request
const MAX_CUES = 4_000;          // safety cap for extremely large files

interface SrtCue {
  index: string;      // original cue number line (kept as-is)
  timing: string;     // original timestamp line (kept as-is)
  text: string;       // dialogue lines joined with '\n'
}

/** Parse SRT text into cues, keeping numbering and timing verbatim. */
function parseSrt(srt: string): SrtCue[] {
  const blocks = srt.replace(/\r/g, '').split(/\n\n+/);
  const cues: SrtCue[] = [];
  const timingRegex = /^\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/;
  for (const block of blocks) {
    const lines = block.split('\n').filter(l => l.trim() !== '' || l === '');
    if (lines.length < 2) continue;
    let i = 0;
    let index = '';
    if (/^\d+$/.test(lines[0].trim())) { index = lines[0].trim(); i = 1; }
    if (!lines[i] || !timingRegex.test(lines[i].trim())) continue;
    const timing = lines[i].trim();
    const text = lines.slice(i + 1).join('\n').trim();
    if (!text) continue;
    cues.push({ index: index || String(cues.length + 1), timing, text });
    if (cues.length >= MAX_CUES) break;
  }
  return cues;
}

/**
 * Translate a batch of strings using the free Google Translate web
 * endpoint (client=gtx). Returns one translated string per input,
 * falling back to the original string on any per-item failure.
 */
async function translateBatch(texts: string[], targetLang: string): Promise<string[]> {
  // Try multiple Google Translate clients to avoid rate limits
  const clients = ['gtx', 'dict-chrome-ex', 'webapp', 't'];
  
  for (const client of clients) {
    // Primary strategy: translate_a/t supports multiple `q` params and returns an array.
    try {
      const body = new URLSearchParams();
      for (const t of texts) body.append('q', t);
      const url = `https://translate.googleapis.com/translate_a/t?client=${client}&sl=auto&tl=${encodeURIComponent(targetLang)}&format=text`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: body.toString(),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const out = data.map((item: any) => {
            if (typeof item === 'string') return item;
            if (Array.isArray(item) && typeof item[0] === 'string') return item[0];
            return '';
          });
          if (out.length === texts.length && out.every(s => typeof s === 'string')) {
            return out.map((s, i) => s || texts[i]);
          }
        }
      }
    } catch (e) {
      console.warn(`Fast translate primary endpoint failed with client ${client}`, e);
    }

    // Fallback strategy: translate_a/single with newline-preserving joining.
    // Using POST to avoid 414 URI Too Long for large batches.
    try {
      const SEP = '\n@@\n';
      const joined = texts.join(SEP);
      const url = `https://translate.googleapis.com/translate_a/single?client=${client}&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t`;
      const body = new URLSearchParams();
      body.append('q', joined);
      
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: body.toString(),
      });
      
      if (res.ok) {
        const data = await res.json();
        const translatedFull = Array.isArray(data?.[0])
          ? data[0].map((seg: any) => (Array.isArray(seg) ? seg[0] || '' : '')).join('')
          : '';
        const parts = translatedFull.split(/\n\s*@@\s*\n/);
        if (parts.length === texts.length) {
          return parts.map((s: string, i: number) => s.trim() || texts[i]);
        }
      }
    } catch (e) {
      console.warn(`Fast translate fallback endpoint failed with client ${client}`, e);
    }
  }

  // Final fallback: Lingva API proxy
  try {
    const SEP = ' ||| ';
    const joined = texts.join(SEP);
    const lingvaUrl = `https://lingva.ml/api/v1/auto/${encodeURIComponent(targetLang)}/${encodeURIComponent(joined)}`;
    const res = await fetch(lingvaUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.translation) {
        const parts = data.translation.split(/\s*\|\|\|\s*/);
        if (parts.length === texts.length) {
          return parts.map((s: string, i: number) => s.trim() || texts[i]);
        }
      }
    }
  } catch (e) {
    console.warn('Fast translate Lingva fallback failed', e);
  }

  // Could not translate — keep originals rather than corrupt cues.
  return texts;
}

/**
 * Translates SRT content into the target language quickly using free
 * machine translation (no AI). Returns a valid SRT string with the
 * original cue numbers and timestamps completely untouched.
 */
export const translateSrtFast = async (
  srtContent: string,
  targetLangCode: string,
  onProgress?: (done: number, total: number) => void,
): Promise<string> => {
  const cues = parseSrt(srtContent);
  if (cues.length === 0) throw new Error('Subtitle file is empty or unreadable');

  // Build batches on cue boundaries.
  const batches: { start: number; texts: string[] }[] = [];
  let current: string[] = [];
  let currentStart = 0;
  let chars = 0;
  for (let i = 0; i < cues.length; i++) {
    if (current.length >= BATCH_MAX_CUES || (chars + cues[i].text.length > BATCH_MAX_CHARS && current.length > 0)) {
      batches.push({ start: currentStart, texts: current });
      current = [];
      currentStart = i;
      chars = 0;
    }
    current.push(cues[i].text);
    chars += cues[i].text.length;
  }
  if (current.length) batches.push({ start: currentStart, texts: current });

  const translatedTexts: string[] = cues.map(c => c.text); // default to original
  let successes = 0;

  for (let b = 0; b < batches.length; b++) {
    try {
      const out = await translateBatch(batches[b].texts, targetLangCode);
      for (let j = 0; j < out.length; j++) {
        translatedTexts[batches[b].start + j] = out[j];
      }
      successes++;
    } catch (e) {
      console.error('Fast subtitle translation batch failed:', e);
      // Originals are kept for this batch so timing/structure stays intact.
    }
    if (onProgress) onProgress(b + 1, batches.length);
  }

  if (successes === 0) throw new Error('Quick translation failed — please try again');

  return cues
    .map((cue, i) => `${cue.index}\n${cue.timing}\n${translatedTexts[i]}`)
    .join('\n\n') + '\n';
};
