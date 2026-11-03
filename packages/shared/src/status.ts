import { hasProfanity } from './profanity';
import { normalizeChat } from './text';
import { containsLink } from './rules';

/**
 * The short lines over a person's head, under the speech bubble: an
 * announcement, what they are doing and how they feel. Unlike the table
 * activity they are chosen by hand and stay until changed.
 */
export const DOINGS = [
  'studying',
  'reading',
  'working',
  'writing',
  'coding',
  'drawing',
  'resting',
  'team',
] as const;
export type Doing = (typeof DOINGS)[number];

export const MOODS = ['happy', 'calm', 'focused', 'tired', 'sad', 'excited', 'anxious'] as const;
export type Mood = (typeof MOODS)[number];

/**
 * How open someone is to company right now, over their head and on their
 * friends' phones: up for a chat, looking for someone to study with, or
 * heads down (say hi later).
 */
export const VIBES = ['chat', 'buddy', 'quiet'] as const;
export type Vibe = (typeof VIBES)[number];

export const STATUS_LIMITS = { announcement: 40, note: 20 } as const;

export type StatusLines = {
  /** E.g. "we need 3 more people for our tuesday room". */
  announcement: string;
  doing: Doing | null;
  doingNote: string;
  mood: Mood | null;
  moodNote: string;
  vibe: Vibe | null;
};

/** Lines as they come over the wire: older clients send no vibe. */
export type IncomingLines = Omit<StatusLines, 'vibe'> & { vibe?: Vibe | null | undefined };

export const EMPTY_LINES: StatusLines = {
  announcement: '',
  doing: null,
  doingNote: '',
  mood: null,
  moodNote: '',
  vibe: null,
};

/** Trims and shortens every line; null when any of them carries a link (no ads over heads). */
export function cleanStatusLines(lines: IncomingLines): StatusLines | null {
  const clean = (text: string, max: number) => normalizeChat(text, max) ?? '';
  const result: StatusLines = {
    announcement: clean(lines.announcement, STATUS_LIMITS.announcement),
    doing: lines.doing,
    doingNote: lines.doing ? clean(lines.doingNote, STATUS_LIMITS.note) : '',
    mood: lines.mood,
    moodNote: lines.mood ? clean(lines.moodNote, STATUS_LIMITS.note) : '',
    vibe: lines.vibe ?? null,
  };
  const texts = [result.announcement, result.doingNote, result.moodNote];
  return texts.some((text) => containsLink(text) || hasProfanity(text)) ? null : result;
}

export function hasStatusLines(lines: StatusLines): boolean {
  return (
    lines.announcement !== '' || lines.doing !== null || lines.mood !== null || lines.vibe !== null
  );
}

/** Quick feelings shown over the head for a moment. */
/** The dances on the dance ring, in order; a dance is sent as its index. */
export const DANCES = ['bounce', 'sway', 'robot', 'disco', 'twist', 'cheer'] as const;
export type Dance = (typeof DANCES)[number];

export const EMOTES = [
  'wave',
  'laugh',
  'heart',
  'sleepy',
  'thinking',
  'cheer',
  'sad',
  'coffee',
] as const;
export type Emote = (typeof EMOTES)[number];
