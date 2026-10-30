import {
  cleanStatusLines,
  DOINGS,
  EMPTY_LINES,
  isValidAppearance,
  MOODS,
  type Appearance,
  type StatusLines,
} from '@att/shared';
import { readJson, remove, writeJson } from './storage';

export type GuestSession = { token: string; id: string; name: string };

const SESSION_KEY = 'att.session';
const LOOK_KEY = 'att.look';
const LINES_KEY = 'att.lines';

export function loadSession(): GuestSession | null {
  const session = readJson<GuestSession>(SESSION_KEY);
  return session?.token && session.id && session.name ? session : null;
}

export function forgetSession(): void {
  remove(SESSION_KEY);
}

/** Forgets the name and look on this device, so the next visit starts as someone new. */
export function forgetCharacter(): void {
  forgetSession();
  remove(LOOK_KEY);
  remove(LINES_KEY);
}

export type GuestError = 'invalid_name' | 'server_misconfigured' | 'network';

export async function createGuest(name: string): Promise<GuestSession | GuestError> {
  try {
    const response = await fetch('/api/guest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const body = (await response.json()) as Partial<GuestSession> & { error?: GuestError };
    if (!response.ok || !body.token || !body.id || !body.name) return body.error ?? 'network';
    const session = { token: body.token, id: body.id, name: body.name };
    writeJson(SESSION_KEY, session);
    return session;
  } catch {
    return 'network';
  }
}

/**
 * The look is kept per device until accounts arrive. Looks from before the
 * character creator are not valid, so those players are asked to make one.
 */
export function loadLook(): Appearance | null {
  const stored = readJson<unknown>(LOOK_KEY);
  return isValidAppearance(stored) ? stored : null;
}

export function saveLook(look: Appearance): void {
  writeJson(LOOK_KEY, look);
}

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
    }) ?? EMPTY_LINES
  );
}

export function saveLines(lines: StatusLines): void {
  writeJson(LINES_KEY, lines);
}
