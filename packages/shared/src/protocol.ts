import { z } from 'zod';
import { LOOK_OPTIONS, type Appearance } from './character';
import { ACTIVITIES, MAX_TIMER_MS, type StudyStatus } from './study';
import type { AreaId, Point } from './world';

const areaId = z.enum(['hall', 'library', 'smoking']);
const point = z.object({ x: z.number().int(), y: z.number().int() });
const choice = (options: readonly unknown[]) =>
  z
    .number()
    .int()
    .min(0)
    .max(options.length - 1);
const appearance = z.object({
  skin: choice(LOOK_OPTIONS.skin),
  hair: choice(LOOK_OPTIONS.hair),
  hairColor: choice(LOOK_OPTIONS.hairColor),
  top: choice(LOOK_OPTIONS.top),
  topColor: choice(LOOK_OPTIONS.topColor),
  bottom: choice(LOOK_OPTIONS.bottom),
  bottomColor: choice(LOOK_OPTIONS.bottomColor),
});
const studyStatus = z.object({
  activity: z.enum(ACTIVITIES).nullable(),
  timer: z
    .object({
      remainingMs: z.number().int().min(0).max(MAX_TIMER_MS),
      totalMs: z.number().int().min(1).max(MAX_TIMER_MS),
    })
    .nullable(),
  dnd: z.boolean(),
});

/** Longest text a client may send in one message, before area rules apply. */
export const MAX_CHAT_LENGTH = 300;

export const clientMessageSchema = z.discriminatedUnion('t', [
  /** First message on every (re)connect. */
  z.object({
    t: z.literal('hello'),
    look: appearance,
    from: areaId.optional(),
    status: studyStatus.optional(),
  }),
  z.object({ t: z.literal('move'), to: point }),
  z.object({ t: z.literal('say'), text: z.string().max(MAX_CHAT_LENGTH) }),
  /** Changes the sender's look, e.g. after the wardrobe. */
  z.object({ t: z.literal('look'), look: appearance }),
  /** Replaces the sender's whole study status. */
  z.object({ t: z.literal('status'), status: studyStatus }),
  /** A friendly nudge to someone in the same area. */
  z.object({ t: z.literal('poke'), to: z.string().min(1).max(64) }),
  /** A private message to someone in the same area; only where the area allows it. */
  z.object({
    t: z.literal('whisper'),
    to: z.string().min(1).max(64),
    text: z.string().max(MAX_CHAT_LENGTH),
  }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type PlayerSnapshot = {
  id: string;
  name: string;
  look: Appearance;
  tile: Point;
  status: StudyStatus;
};

export type ErrorCode =
  | 'bad_message'
  | 'rate_limited'
  | 'blocked'
  | 'replaced'
  | 'link_blocked'
  /** The person asked not to be disturbed. */
  | 'dnd'
  /** The person left the area. */
  | 'unavailable'
  /** This area does not allow that, e.g. whispers in the library. */
  | 'not_allowed';

export type ServerMessage =
  | { t: 'welcome'; self: string; tile: Point; area: AreaId; players: PlayerSnapshot[] }
  | { t: 'joined'; player: PlayerSnapshot }
  | { t: 'left'; id: string }
  | { t: 'moved'; id: string; to: Point }
  /** Puts a player back where the server knows they are (after a rejected move). */
  | { t: 'placed'; id: string; tile: Point }
  | { t: 'said'; id: string; text: string }
  | { t: 'status'; id: string; status: StudyStatus }
  | { t: 'looked'; id: string; look: Appearance }
  | { t: 'poked'; from: string }
  /** Sent to both the sender and the receiver. */
  | { t: 'whispered'; from: string; to: string; text: string }
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
