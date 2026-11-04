import { cleanStatusLines, DOINGS, EMPTY_LINES, MOODS, VIBES, type StatusLines } from '@att/shared';
import { readJson, writeJson } from './storage';

/**
 * The game token for the character being played, given by `/api/play` (see
 * net/account.ts). It lives in memory only: the account's cookie gets a new
 * one on every visit, and every deploy ends the old ones.
 */
export type GuestSession = { token: string; id: string; name: string };

const LINES_KEY = 'att.lines';

/** Status lines are kept per device too, and checked again since storage can hold anything. */
export function loadLines(): StatusLines {
  const stored = readJson<Partial<StatusLines>>(LINES_KEY);
  if (!stored) return EMPTY_LINES;
  const pick = <T extends string>(options: readonly T[], value: unknown) =>
    options.includes(value as T) ? (value as T) : null;
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  return (
    cleanStatusLines({
      announcement: text(stored.announcement),
      doing: pick(DOINGS, stored.doing),
      doingNote: text(stored.doingNote),
      mood: pick(MOODS, stored.mood),
      moodNote: text(stored.moodNote),
      vibe: pick(VIBES, stored.vibe),
    }) ?? EMPTY_LINES
  );
}

export function saveLines(lines: StatusLines): void {
  writeJson(LINES_KEY, lines);
}
