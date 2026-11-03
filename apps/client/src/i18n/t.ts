import en from './en.json';
import tr from './tr.json';

export type MessageKey = keyof typeof en;

/** The languages the game speaks; English is the default. */
export const LANGUAGES = ['en', 'tr'] as const;
export type Language = (typeof LANGUAGES)[number];

const CATALOGS: Record<Language, Record<string, string>> = { en, tr };
const KEY = 'att.language';

/** The saved choice, else Turkish on a Turkish device, else English. */
function startLanguage(): Language {
  try {
    const saved = localStorage.getItem(KEY);
    if (LANGUAGES.includes(saved as Language)) return saved as Language;
  } catch {
    // No storage: go by the device.
  }
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('tr')
    ? 'tr'
    : 'en';
}

let language: Language = startLanguage();
if (typeof document !== 'undefined') document.documentElement.lang = language;

/** Dates and times in the game's language (Turkish chosen), else as the device writes them. */
export function dateLocale(): string | undefined {
  return language === 'tr' ? 'tr-TR' : undefined;
}

export function getLanguage(): Language {
  return language;
}

/**
 * Switches the language and reloads the page: names on signs and labels in
 * the 3D scene are drawn once, so a fresh start is the honest way to change
 * every word at once. The session and the look are kept.
 */
export function setLanguage(next: Language): void {
  if (next === language) return;
  language = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Not kept; this visit only.
  }
  location.reload();
}

/** A message in the player's language (English if a key is missing); `{name}` style slots are filled from `vars`. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const text = CATALOGS[language][key] ?? en[key];
  return vars
    ? text.replace(/\{(\w+)\}/g, (slot, name: string) => String(vars[name] ?? slot))
    : text;
}
