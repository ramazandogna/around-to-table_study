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

export const STATUS_LIMITS = { announcement: 40, note: 20 } as const;

export type StatusLines = {
  /** E.g. "we need 3 more people for our tuesday room". */
  announcement: string;
  doing: Doing | null;
  doingNote: string;
  mood: Mood | null;
  moodNote: string;
};

export const EMPTY_LINES: StatusLines = {
  announcement: '',
  doing: null,
  doingNote: '',
  mood: null,
  moodNote: '',
};

/** Trims and shortens every line; null when any of them carries a link (no ads over heads). */
export function cleanStatusLines(lines: StatusLines): StatusLines | null {
  const clean = (text: string, max: number) => normalizeChat(text, max) ?? '';
  const result: StatusLines = {
    announcement: clean(lines.announcement, STATUS_LIMITS.announcement),
    doing: lines.doing,
    doingNote: lines.doing ? clean(lines.doingNote, STATUS_LIMITS.note) : '',
    mood: lines.mood,
    moodNote: lines.mood ? clean(lines.moodNote, STATUS_LIMITS.note) : '',
  };
  const texts = [result.announcement, result.doingNote, result.moodNote];
  return texts.some(containsLink) ? null : result;
}

export function hasStatusLines(lines: StatusLines): boolean {
  return lines.announcement !== '' || lines.doing !== null || lines.mood !== null;
}

/** Quick feelings shown over the head for a moment. */
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
