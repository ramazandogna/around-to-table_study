import { z } from 'zod';
import {
  CHARACTERS,
  OUTFIT_PARTS,
  PALETTES,
  PETS_AVAILABLE,
  type Appearance,
  type OutfitPart,
  type PetKind,
} from './character';
import { DOINGS, EMOTES, MOODS, STATUS_LIMITS, type Emote, type StatusLines } from './status';
import { ACTIVITIES, MAX_TIMER_MS, type StudyStatus } from './study';
import type { AreaId, Point } from './world';

const areaId = z.enum(['hall', 'library', 'smoking']);
const point = z.object({ x: z.number().int(), y: z.number().int() });
const index = (length: number) =>
  z
    .number()
    .int()
    .min(0)
    .max(length - 1);
const appearance = z.object({
  character: index(CHARACTERS.length),
  ...(Object.fromEntries(
    OUTFIT_PARTS.map((part) => [part, index(PALETTES[part].length).optional()]),
  ) as Record<OutfitPart, z.ZodOptional<z.ZodNumber>>),
  pet: z.enum(PETS_AVAILABLE as [PetKind, ...PetKind[]]).optional(),
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

export { normalizeChat } from './text';

/** Longest text a client may send in one message, before area rules apply. */
export const MAX_CHAT_LENGTH = 300;

// Lines are cut to length by cleanStatusLines; this only stops oversized messages.
const statusLines = z.object({
  announcement: z.string().max(STATUS_LIMITS.announcement * 2),
  doing: z.enum(DOINGS).nullable(),
  doingNote: z.string().max(STATUS_LIMITS.note * 2),
  mood: z.enum(MOODS).nullable(),
  moodNote: z.string().max(STATUS_LIMITS.note * 2),
});

export const clientMessageSchema = z.discriminatedUnion('t', [
  /** First message on every (re)connect. */
  z.object({
    t: z.literal('hello'),
    look: appearance,
    from: areaId.optional(),
    status: studyStatus.optional(),
    lines: statusLines.optional(),
  }),
  z.object({ t: z.literal('move'), to: point }),
  z.object({ t: z.literal('say'), text: z.string().max(MAX_CHAT_LENGTH) }),
  /** Changes the sender's look, e.g. after the wardrobe. */
  z.object({ t: z.literal('look'), look: appearance }),
  /** Replaces the sender's whole study status. */
  z.object({ t: z.literal('status'), status: studyStatus }),
  /** Replaces the sender's status lines. */
  z.object({ t: z.literal('lines'), lines: statusLines }),
  z.object({ t: z.literal('emote'), emote: z.enum(EMOTES) }),
  /** Starts or stops dancing, where the area allows it. Walking stops it too. */
  z.object({ t: z.literal('dance'), on: z.boolean() }),
  /** The sender's study timer ran out: everyone in the room sees them celebrate. */
  z.object({ t: z.literal('finished') }),
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
  lines: StatusLines;
  dancing: boolean;
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
  | 'not_allowed'
  /** Someone else already sits there. */
  | 'seat_taken';

export type ServerMessage =
  | {
      t: 'welcome';
      self: string;
      tile: Point;
      area: AreaId;
      players: PlayerSnapshot[];
      /** How many renovation strips of the room are open. */
      opened: number;
    }
  /** The room grew: another renovation strip (a desk for two) opened. */
  | { t: 'grew'; opened: number }
  | { t: 'joined'; player: PlayerSnapshot }
  | { t: 'left'; id: string }
  | { t: 'moved'; id: string; to: Point }
  /** Puts a player back where the server knows they are (after a rejected move). */
  | { t: 'placed'; id: string; tile: Point }
  /** `at` is the server's clock, for the time next to the line in the chat. */
  | { t: 'said'; id: string; text: string; at: number }
  | { t: 'status'; id: string; status: StudyStatus }
  | { t: 'looked'; id: string; look: Appearance }
  | { t: 'lined'; id: string; lines: StatusLines }
  | { t: 'emoted'; id: string; emote: Emote }
  /** Sent to the person poked and to whoever poked them. */
  | { t: 'poked'; from: string; to: string }
  | { t: 'danced'; id: string; on: boolean }
  /** Sent to both the sender and the receiver. */
  | { t: 'whispered'; from: string; to: string; text: string; at: number }
  /** Someone's study timer ran out. */
  | { t: 'finished'; id: string }
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
