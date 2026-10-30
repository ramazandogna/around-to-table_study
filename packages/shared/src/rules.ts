import { normalizeChat } from './text';
import type { AreaId } from './world';

/** What each area allows. The server enforces these; clients only give early feedback. */
export type AreaRules = {
  /** Longest speech bubble, in characters. */
  maxChars: number;
  /** Shortest time between two messages from one person. */
  cooldownMs: number;
  /** When false, text is lowercased (Turkish-aware) instead of rejected. */
  allowCaps: boolean;
  allowLinks: boolean;
  /** Flashy cosmetic effects and big emotes are drawn. */
  effectsVisible: boolean;
  /** Friend requests and mentions may play a sound. */
  notifySound: boolean;
  /** Whispers (private messages) can be sent. */
  dmAllowed: boolean;
  /** A room chat panel next to the bubbles; everywhere but the library. */
  chatLog: boolean;
};

export const AREA_RULES: Record<AreaId, AreaRules> = {
  library: {
    maxChars: 50,
    // Anywhere from 60 to 90 seconds keeps the library quiet; 75 is the middle.
    cooldownMs: 75_000,
    allowCaps: false,
    allowLinks: false,
    effectsVisible: false,
    notifySound: false,
    dmAllowed: false,
    chatLog: false,
  },
  hall: {
    maxChars: 200,
    cooldownMs: 3_000,
    allowCaps: true,
    allowLinks: false,
    effectsVisible: true,
    notifySound: true,
    dmAllowed: true,
    chatLog: true,
  },
  smoking: {
    maxChars: 300,
    cooldownMs: 3_000,
    allowCaps: true,
    allowLinks: true,
    effectsVisible: true,
    notifySound: true,
    dmAllowed: true,
    chatLog: true,
  },
};

const TURKISH_LETTERS = /[çğıöşüÇĞİÖŞÜ]/;

/** Text with Turkish-only letters is lowercased the Turkish way. */
export function looksTurkish(text: string): boolean {
  return TURKISH_LETTERS.test(text);
}

/**
 * Lowercases without breaking Turkish: "İ" always becomes "i", and "I" becomes
 * "ı" only when the text is Turkish, so English "I" still becomes "i".
 */
export function quietCase(text: string): string {
  const turkish = looksTurkish(text);
  return text
    .replace(/İ/g, 'i')
    .replace(/I/g, turkish ? 'ı' : 'i')
    .toLowerCase();
}

const LINK = /(https?:\/\/|www\.)\S|\b[\w-]+\.(com|net|org|io|dev|app|me|gg|co|tr|jp|ly|xyz)\b/i;

export function containsLink(text: string): boolean {
  return LINK.test(text);
}

export type AreaTextResult =
  { ok: true; text: string; lowered: boolean } | { ok: false; reason: 'empty' | 'link' };

/** Cleans a message and applies the area's length, caps and link rules. */
export function applyAreaRules(raw: string, rules: AreaRules): AreaTextResult {
  const clean = normalizeChat(raw, rules.maxChars);
  if (!clean) return { ok: false, reason: 'empty' };
  if (!rules.allowLinks && containsLink(clean)) return { ok: false, reason: 'link' };
  if (rules.allowCaps) return { ok: true, text: clean, lowered: false };
  const text = quietCase(clean);
  return { ok: true, text, lowered: text !== clean };
}
