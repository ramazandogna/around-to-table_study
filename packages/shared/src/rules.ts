import { maskProfanity } from './profanity';
import { normalizeChat } from './text';
import { isRoomArea, type AreaId } from './world';

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
  /** Whispers to someone standing in the same room can be sent. */
  dmAllowed: boolean;
  /**
   * The phone works: messages to friends anywhere in the building. Everywhere,
   * the library too, where it only buzzes (see `notifySound`).
   */
  phone: boolean;
  /** A room chat panel next to the bubbles; everywhere but the library. */
  chatLog: boolean;
  /** People may dance here. */
  dance: boolean;
  /** Pets may come in; elsewhere they wait at the door. */
  pets: boolean;
  /** People may light a cigarette here. */
  smoke: boolean;
};

/** Private rooms are for the people who were invited: they talk freely, like the smoking room. */
const PRIVATE_ROOM: AreaRules = {
  maxChars: 300,
  cooldownMs: 2_000,
  allowCaps: true,
  allowLinks: false,
  effectsVisible: true,
  notifySound: true,
  dmAllowed: true,
  chatLog: true,
  dance: true,
  pets: true,
  phone: true,
  smoke: false,
};

export const AREA_RULES: Record<AreaId, AreaRules> = {
  room3: PRIVATE_ROOM,
  room5: PRIVATE_ROOM,
  room9: PRIVATE_ROOM,
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
    dance: false,
    pets: false,
    phone: true,
    smoke: false,
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
    dance: true,
    pets: true,
    phone: true,
    smoke: false,
  },
  // Talks and concerts: the audience may chat and cheer, like the hall.
  conference: {
    maxChars: 200,
    cooldownMs: 3_000,
    allowCaps: true,
    allowLinks: false,
    effectsVisible: true,
    notifySound: true,
    dmAllowed: true,
    chatLog: true,
    dance: true,
    pets: true,
    phone: true,
    smoke: false,
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
    dance: true,
    pets: true,
    phone: true,
    smoke: true,
  },
};

/**
 * A room's rules with its owner's choices on top, for private rooms: the sound
 * of notifications and whether pets may come in. Public rooms ignore them.
 */
export function rulesFor(area: AreaId, room?: { sound: boolean; pets: boolean } | null): AreaRules {
  const base = AREA_RULES[area];
  if (!room || !isRoomArea(area)) return base;
  return { ...base, notifySound: room.sound, pets: room.pets };
}

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
  | { ok: true; text: string; lowered: boolean; masked: boolean }
  | { ok: false; reason: 'empty' | 'link' };

/** Cleans a message and applies the area's length, caps and link rules. */
export function applyAreaRules(raw: string, rules: AreaRules): AreaTextResult {
  const clean = normalizeChat(raw, rules.maxChars);
  if (!clean) return { ok: false, reason: 'empty' };
  if (!rules.allowLinks && containsLink(clean)) return { ok: false, reason: 'link' };
  // Swears are masked, not refused: the rest of the message still counts.
  const { text: polite, masked } = maskProfanity(clean);
  if (rules.allowCaps) return { ok: true, text: polite, lowered: false, masked };
  const text = quietCase(polite);
  return { ok: true, text, lowered: text !== polite, masked };
}
