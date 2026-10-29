import { z } from 'zod';
import type { Appearance } from './character';
import type { AreaId, Point } from './world';

const areaId = z.enum(['hall', 'library', 'smoking']);
const point = z.object({ x: z.number().int(), y: z.number().int() });
const appearance = z.object({
  skin: z.number().int(),
  pants: z.number().int(),
  shoes: z.number().int(),
  top: z.number().int(),
  hair: z.number().int(),
  hairColor: z.number().int(),
  beard: z.number().int(),
});

/** Longest text a client may send in one message, before area rules apply. */
export const MAX_CHAT_LENGTH = 300;

export const clientMessageSchema = z.discriminatedUnion('t', [
  /** First message on every (re)connect. */
  z.object({ t: z.literal('hello'), look: appearance, from: areaId.optional() }),
  z.object({ t: z.literal('move'), to: point }),
  z.object({ t: z.literal('say'), text: z.string().max(MAX_CHAT_LENGTH) }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type PlayerSnapshot = {
  id: string;
  name: string;
  look: Appearance;
  tile: Point;
};

export type ErrorCode = 'bad_message' | 'rate_limited' | 'blocked' | 'replaced';

export type ServerMessage =
  | { t: 'welcome'; self: string; tile: Point; area: AreaId; players: PlayerSnapshot[] }
  | { t: 'joined'; player: PlayerSnapshot }
  | { t: 'left'; id: string }
  | { t: 'moved'; id: string; to: Point }
  /** Puts a player back where the server knows they are (after a rejected move). */
  | { t: 'placed'; id: string; tile: Point }
  | { t: 'said'; id: string; text: string }
  | { t: 'error'; code: ErrorCode; retryInMs?: number };

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const result = clientMessageSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Guest nicknames: 2–20 letters, digits, spaces, dots, dashes or underscores, in any script. */
export const NAME_PATTERN = /^[\p{L}\p{N} _.-]{2,20}$/u;

export function normalizeName(raw: string): string | null {
  const name = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  return NAME_PATTERN.test(name) ? name : null;
}

// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/** Collapses whitespace and strips control characters; returns null when nothing is left. */
export function normalizeChat(raw: string, maxLength: number): string | null {
  const text = raw.normalize('NFC').replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, maxLength) : null;
}
