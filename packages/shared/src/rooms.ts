import { hasProfanity } from './profanity';
import { containsLink } from './rules';
import { normalizeChat } from './text';
import type { RoomSize } from './world';

/**
 * Private rooms: anyone can open one for 3, 5 or 9 people. A room has a short
 * code to share; without a password it is listed at the reception for anyone
 * to join, with one only people who know both get in.
 */

/** No 0/O or 1/I/L, so a code read aloud or off a screen is never ambiguous. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

export const ROOM_NAME_MAX = 24;
export const ROOM_PASSWORD = { min: 4, max: 32 } as const;
/** An empty room is forgotten after this long. */
export const ROOM_IDLE_MS = 24 * 60 * 60_000;

/** What the owner allows in a room; set when opening it, changed later from the room's settings. */
export type RoomRules = {
  /** Notification sounds and the chat's sounds. */
  sound: boolean;
  pets: boolean;
  /** A game table in the room, for its people to play together. */
  games: boolean;
};

export const DEFAULT_ROOM_RULES: RoomRules = { sound: true, pets: true, games: true };

/** Rules from storage or a request, with anything missing or wrong taken from the defaults. */
export function cleanRoomRules(raw: unknown): RoomRules {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<
    Record<keyof RoomRules, unknown>
  >;
  const pick = (key: keyof RoomRules) =>
    typeof value[key] === 'boolean' ? (value[key] as boolean) : DEFAULT_ROOM_RULES[key];
  return { sound: pick('sound'), pets: pick('pets'), games: pick('games') };
}

export type RoomInfo = {
  code: string;
  name: string;
  size: RoomSize;
  /** Needs a password to come in. */
  locked: boolean;
  /** People inside right now. */
  people: number;
  /** Who opened it: they can change its rules, send people out and close it. */
  owner: string;
  rules: RoomRules;
};

export function makeRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return code;
}

/** A code as typed (any case, with spaces or dashes) made canonical, or null. */
export function normalizeRoomCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[\s-]/g, '');
  return CODE_PATTERN.test(code) ? code : null;
}

/** A room's name: short, on one line, and no links. */
export function cleanRoomName(raw: string): string | null {
  const name = normalizeChat(raw, ROOM_NAME_MAX);
  return name && name.length >= 2 && !containsLink(name) && !hasProfanity(name) ? name : null;
}

export function isValidRoomPassword(password: string): boolean {
  return password.length >= ROOM_PASSWORD.min && password.length <= ROOM_PASSWORD.max;
}

/** How a room invite travels in a phone message; the phone turns it into a "join" button. */
export const roomInviteMark = (code: string) => `⟦room:${code}⟧`;
const INVITE = /⟦room:([A-Z2-9]{6})⟧/;

export function findRoomInvite(text: string): string | null {
  const code = INVITE.exec(text)?.[1];
  return code && CODE_PATTERN.test(code) ? code : null;
}
