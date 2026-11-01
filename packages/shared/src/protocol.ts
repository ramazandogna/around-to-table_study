import { z } from 'zod';
import {
  CHARACTERS,
  OUTFIT_PARTS,
  PALETTES,
  PET_ACCESSORIES,
  PET_COLORS,
  PET_SEXES,
  PETS_AVAILABLE,
  type Appearance,
  type OutfitPart,
  type PetKind,
} from './character';
import { JUKEBOX, type JukeboxState } from './jukebox';
import {
  DOINGS,
  EMOTES,
  MOODS,
  STATUS_LIMITS,
  VIBES,
  type Emote,
  type StatusLines,
} from './status';
import { ACTIVITIES, MAX_TIMER_MS, type StudyStatus } from './study';
import { TABLE_GAMES, type Table, type TableError, type TableKind } from './tables';
import type { RoomRules } from './rooms';
import type { AreaId, Point } from './world';

const areaId = z.enum(['hall', 'library', 'smoking', 'room3', 'room5', 'room9']);
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
  petSex: z.enum(PET_SEXES).optional(),
  petColor: index(PET_COLORS.length).optional(),
  petAccessory: z.enum(PET_ACCESSORIES).optional(),
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
  round: z
    .object({ n: z.number().int().min(1).max(12), of: z.number().int().min(1).max(12) })
    .nullable()
    .optional(),
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
  vibe: z.enum(VIBES).nullable().optional(),
});

const userId = z.string().min(1).max(64);
const tableAction = z.discriminatedUnion('a', [
  z.object({ a: z.literal('open') }),
  z.object({ a: z.literal('join') }),
  z.object({ a: z.literal('leave') }),
  z.object({ a: z.literal('start') }),
  z.object({ a: z.literal('throw'), x: z.number().finite(), y: z.number().finite() }),
  z.object({ a: z.literal('roll') }),
  z.object({ a: z.literal('hold') }),
  z.object({ a: z.literal('guess'), n: z.number().int().min(0).max(1000) }),
  z.object({ a: z.literal('nudge') }),
]);
const tuneId = z.string().min(1).max(32);

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
  /** Lights a cigarette or puts it out, where the area allows it. Walking puts it out too. */
  z.object({ t: z.literal('smoke'), on: z.boolean() }),
  /** Pets someone's pet (`owner` is whose pet it is); everyone sees it purr. */
  z.object({ t: z.literal('pat'), owner: userId }),
  /** Something done at one of the room's game tables. */
  z.object({ t: z.literal('table'), kind: z.enum(TABLE_GAMES), action: tableAction }),
  /** Queues a song on the jukebox: a YouTube link or video id. */
  z.object({ t: z.literal('tune'), link: z.string().min(1).max(200) }),
  /** Asks to skip the song playing (its id), or takes back your own queued one. */
  z.object({ t: z.literal('skip'), id: tuneId }),
  /** A player found how long the song playing is, in seconds. */
  z.object({
    t: z.literal('tuneLength'),
    id: tuneId,
    seconds: z
      .number()
      .positive()
      .max(JUKEBOX.maxSeconds * 2),
  }),
  /** The sender's study timer ran out: everyone in the room sees them celebrate. */
  z.object({ t: z.literal('finished') }),
  /** A chair pulled out from its table, or pushed back under it. */
  z.object({ t: z.literal('chair'), tile: point, pulled: z.boolean() }),
  /** Asks someone in the same area to come to the sender's private room. */
  z.object({
    t: z.literal('invite'),
    to: z.string().min(1).max(64),
    code: z.string().regex(/^[A-Z2-9]{6}$/),
    name: z.string().min(1).max(48),
  }),
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
  smoking: boolean;
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
  | 'seat_taken'
  /** The room's owner sent the player out (they may come back). */
  | 'kicked'
  /** The room's owner banned the player: they cannot come back. */
  | 'banned'
  /** The owner closed the room. */
  | 'room_closed'
  /** Not a YouTube link, or a video that cannot be played here. */
  | 'tune_bad'
  /** The queue is full, or the sender already has songs waiting. */
  | 'tune_full'
  /** The video is longer than the jukebox takes. */
  | 'tune_long';

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
  | { t: 'smoked'; id: string; on: boolean }
  /** Someone moved a chair: pulled out from the table, or pushed back under it. */
  | { t: 'chaired'; tile: Point; pulled: boolean }
  /** The owner changed the private room's rules. */
  | { t: 'roomRules'; rules: RoomRules }
  /** Someone (`id`) petted the pet of `owner`. */
  | { t: 'patted'; id: string; owner: string }
  /** A game table changed (null: nobody sits at it any more). */
  | { t: 'table'; kind: TableKind; table: Table | null }
  | { t: 'tableError'; kind: TableKind; code: TableError }
  /** The jukebox's queue and song; sent on arrival and whenever it changes. */
  | { t: 'jukebox'; state: JukeboxState }
  /** Sent to both the sender and the receiver. */
  | { t: 'whispered'; from: string; to: string; text: string; at: number }
  /** Someone's study timer ran out. */
  | { t: 'finished'; id: string }
  /** An invitation to someone's private room, for the person invited. */
  | { t: 'invited'; from: string; code: string; name: string }
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
