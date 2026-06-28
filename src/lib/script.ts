// Script-detection helpers for off-language gating.
//
// Deepgram runs the realtime connection for RTL sources (Arabic, ...) in
// multilingual mode (`language=multi`, nova-3). In that mode non-source speech
// transcribes in its OWN script — e.g. English comes through as Latin text, not
// Arabic-transliterated gibberish — so a script-ratio check reliably flags
// off-language segments. This replaced the removed OpenAI-Whisper language ID.
//
// Used both client-side (instant drop in use-deepgram, before a segment renders)
// and server-side (the noise filter in /api/translate, as a backstop).

const ARABIC_SCRIPT_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const HEBREW_SCRIPT_RE = /[֐-׿]/;

/** Forced RTL source languages: the STT connection runs in Deepgram
 *  multilingual mode for these, and their transcripts are script-gated. */
export const RTL_LANGS = new Set(["ar", "ur", "he", "fa", "ps", "sd"]);

/**
 * True when `sourceLang` is RTL but `text` is predominantly NOT in that script
 * (<50% source-script letters) — i.e. off-language bleed (English in an Arabic
 * session). Returns false for non-RTL sources (not script-gated) and for
 * empty/letterless text (the caller's word-count check handles those).
 */
export function isOffLanguageScript(
  text: string,
  sourceLang: string | undefined
): boolean {
  if (!sourceLang || !RTL_LANGS.has(sourceLang.toLowerCase())) return false;
  // Denominator = LETTERS only. Digits (\p{N}) must NOT count as "non-source
  // script": with smart_format Deepgram renders spoken numbers as Western (or
  // Arabic-Indic) digits, so a short valid Arabic segment citing a Hijri year /
  // ayah / hadith number (e.g. "سنة 1445") would otherwise drop below the 50%
  // ratio and be wrongly discarded — a fail-CLOSED drop of valid source speech,
  // which the off-language gate must never do. Stripping everything that is not
  // a letter leaves only letters in the ratio, so numbers are script-neutral.
  const visibleChars = text.trim().replace(/[^\p{L}]/gu, "");
  if (visibleChars.length === 0) return false;
  const scriptRe =
    sourceLang.toLowerCase() === "he" ? HEBREW_SCRIPT_RE : ARABIC_SCRIPT_RE;
  let scriptChars = 0;
  for (const ch of visibleChars) if (scriptRe.test(ch)) scriptChars++;
  return scriptChars / visibleChars.length < 0.5;
}
