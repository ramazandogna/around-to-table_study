import en from './en.json';
import tr from './tr.json';

export type MessageKey = keyof typeof en;

/** The languages the game speaks; English is the default. */
export const LANGUAGES = ['en', 'tr'] as const;
export type Language = (typeof LANGUAGES)[number];

const CATALOGS: Record<Language, Record<string, string>> = { en, tr };
const KEY = 'att.language';

/** A language code ("tr", "tr-TR", "en-GB") as one the game speaks, or null. */
function asLanguage(code: string | null | undefined): Language | null {
  const base = code?.trim().toLowerCase().split(/[-_]/)[0];
  return LANGUAGES.find((l) => l === base) ?? null;
}

/**
 * The language to start in: a saved choice wins, then `?lang=` (the website
 * passes it on its play links), then Turkish for a Turkish browser, else English.
 */
export function pickLanguage(
  saved: string | null,
  search: string,
  browser: string | undefined,
): Language {
  const kept = LANGUAGES.find((l) => l === saved);
  if (kept) return kept;
  const asked = asLanguage(new URLSearchParams(search).get('lang'));
  if (asked) return asked;
  return asLanguage(browser) === 'tr' ? 'tr' : 'en';
}

function startLanguage(): Language {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    // No storage: nothing saved.
  }
  const search = typeof location === 'undefined' ? '' : location.search;
  const browser = typeof navigator === 'undefined' ? undefined : navigator.language;
  const picked = pickLanguage(saved, search, browser);
  if (!LANGUAGES.includes(saved as Language)) {
    // Remembered, so the first visit's language sticks (the choice can still be changed).
    try {
      localStorage.setItem(KEY, picked);
    } catch {
      // This visit only.
    }
  }
  return picked;
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
