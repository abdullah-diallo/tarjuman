/**
 * UI locales for the dashboard (the *interface* language — separate from the
 * transcription source/target languages in src/lib/constants LANGUAGES).
 * Arabic and Urdu render the dashboard right-to-left.
 */
export const UI_LOCALES = [
  { code: "en", label: "English", native: "English", rtl: false },
  { code: "ar", label: "Arabic", native: "العربية", rtl: true },
  { code: "ur", label: "Urdu", native: "اردو", rtl: true },
  { code: "fr", label: "French", native: "Français", rtl: false },
  { code: "es", label: "Spanish", native: "Español", rtl: false },
  { code: "id", label: "Indonesian", native: "Bahasa Indonesia", rtl: false },
  { code: "tr", label: "Turkish", native: "Türkçe", rtl: false },
  { code: "bn", label: "Bengali", native: "বাংলা", rtl: false },
  { code: "ms", label: "Malay", native: "Bahasa Melayu", rtl: false },
  { code: "de", label: "German", native: "Deutsch", rtl: false },
  // Machine-translated additions (strings in messages-extra.ts) — the full
  // transcription language set, so any language you can transcribe you can also
  // run the app in. Hebrew is right-to-left.
  { code: "pt", label: "Portuguese", native: "Português", rtl: false },
  { code: "it", label: "Italian", native: "Italiano", rtl: false },
  { code: "nl", label: "Dutch", native: "Nederlands", rtl: false },
  { code: "ru", label: "Russian", native: "Русский", rtl: false },
  { code: "hi", label: "Hindi", native: "हिन्दी", rtl: false },
  { code: "ja", label: "Japanese", native: "日本語", rtl: false },
  { code: "ko", label: "Korean", native: "한국어", rtl: false },
  { code: "zh", label: "Chinese", native: "中文", rtl: false },
  { code: "vi", label: "Vietnamese", native: "Tiếng Việt", rtl: false },
  { code: "pl", label: "Polish", native: "Polski", rtl: false },
  { code: "cs", label: "Czech", native: "Čeština", rtl: false },
  { code: "hu", label: "Hungarian", native: "Magyar", rtl: false },
  { code: "no", label: "Norwegian", native: "Norsk", rtl: false },
  { code: "sv", label: "Swedish", native: "Svenska", rtl: false },
  { code: "da", label: "Danish", native: "Dansk", rtl: false },
  { code: "fi", label: "Finnish", native: "Suomi", rtl: false },
  { code: "el", label: "Greek", native: "Ελληνικά", rtl: false },
  { code: "he", label: "Hebrew", native: "עברית", rtl: true },
  { code: "ro", label: "Romanian", native: "Română", rtl: false },
  { code: "ca", label: "Catalan", native: "Català", rtl: false },
  { code: "uk", label: "Ukrainian", native: "Українська", rtl: false },
] as const;

export type LocaleCode = (typeof UI_LOCALES)[number]["code"];

export const DEFAULT_LOCALE: LocaleCode = "en";

export function isRtlLocale(code: string): boolean {
  return UI_LOCALES.some((l) => l.code === code && l.rtl);
}

export function isLocaleCode(code: string): code is LocaleCode {
  return UI_LOCALES.some((l) => l.code === code);
}

/** Best-effort: map a browser language tag (e.g. "ar-SA") to a supported UI locale. */
export function localeFromNavigator(lang: string | undefined): LocaleCode {
  if (!lang) return DEFAULT_LOCALE;
  const base = lang.toLowerCase().split("-")[0];
  return isLocaleCode(base) ? base : DEFAULT_LOCALE;
}
