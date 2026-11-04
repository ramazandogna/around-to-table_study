import { isValidAppearance, type Appearance } from '@att/shared';
import { type GuestSession, loadLook, loadSession } from './session';
import { readJson, remove, writeJson } from './storage';

/**
 * A device keeps up to two characters, like the character select of an old
 * online game. There are no accounts: each character is its own guest (name,
 * look, session token) with its own stats and goals. The one being played
 * lives in the usual storage keys; the other waits in `att.characters` as a
 * copy of those keys, and switching swaps the two and reloads the page.
 */
export const MAX_CHARACTERS = 2;

/** What belongs to a character rather than to the device. */
const CHARACTER_KEYS = [
  'att.session',
  'att.look',
  'att.lines',
  'att.linesUntil',
  'att.stats',
  'att.goal',
  'att.goals',
  'att.played',
  'att.prizes',
  'att.lastPlan',
  'att.lastSit',
] as const;

const ROSTER_KEY = 'att.characters';

/** A character waiting on this device: its stored keys, as they were when it was left. */
type Stored = { id: string; keys: Partial<Record<string, string>> };

export type Character = {
  id: string;
  name: string;
  look: Appearance | null;
  token: string;
  /** The one whose keys are live (played last, or now). */
  active: boolean;
  /** Reads one of its stored values. */
  read: <T>(key: string) => T | null;
};

function roster(): Stored[] {
  const stored = readJson<Stored[]>(ROSTER_KEY);
  return Array.isArray(stored) ? stored.filter((c) => typeof c?.id === 'string' && c.keys) : [];
}

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string | undefined): void {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Not kept: the switch still works for this visit.
  }
}

const parse = <T>(raw: string | undefined | null): T | null => {
  try {
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

function fromStored(stored: Stored): Character | null {
  const session = parse<GuestSession>(stored.keys['att.session']);
  if (!session?.id || !session.token || !session.name) return null;
  const look = parse<unknown>(stored.keys['att.look']);
  return {
    id: session.id,
    name: session.name,
    token: session.token,
    look: isValidAppearance(look) ? look : null,
    active: false,
    read: (key) => parse(stored.keys[key]),
  };
}

/** The characters on this device: the live one first, then the one waiting. */
export function listCharacters(): Character[] {
  const live = loadSession();
  const list: Character[] = [];
  if (live) {
    list.push({
      id: live.id,
      name: live.name,
      token: live.token,
      look: loadLook(),
      active: true,
      read: (key) => readJson(key),
    });
  }
  for (const stored of roster()) {
    const character = fromStored(stored);
    if (character && character.id !== live?.id) list.push(character);
  }
  return list.slice(0, MAX_CHARACTERS);
}

/** Puts the live character away into the roster, leaving the usual keys empty. */
function storeLive(): void {
  const live = loadSession();
  if (!live) return;
  const keys: Partial<Record<string, string>> = {};
  for (const key of CHARACTER_KEYS) {
    const value = readRaw(key);
    if (value !== null) keys[key] = value;
    writeRaw(key, undefined);
  }
  writeJson(ROSTER_KEY, [...roster().filter((c) => c.id !== live.id), { id: live.id, keys }]);
}

/** Plays as another character of this device: its keys come back, and the page starts again. */
export function switchTo(id: string): void {
  if (loadSession()?.id === id) return;
  const target = roster().find((c) => c.id === id);
  if (!target) return;
  storeLive();
  for (const key of CHARACTER_KEYS) writeRaw(key, target.keys[key]);
  writeJson(
    ROSTER_KEY,
    roster().filter((c) => c.id !== id),
  );
  location.reload();
}

/** Room for one more character on this device. */
export function canCreate(): boolean {
  return listCharacters().length < MAX_CHARACTERS;
}

/** Puts the live character away and opens the creator for a new one. */
export function createAnother(): void {
  if (!canCreate()) return;
  storeLive();
  location.reload();
}

/**
 * Deletes a character from this device for good: its keys go, and the server
 * is asked to send it out of the building now.
 */
export function deleteCharacter(id: string): void {
  const live = loadSession();
  const stored = roster().find((c) => c.id === id);
  const token =
    live?.id === id
      ? live.token
      : stored
        ? (parse<GuestSession>(stored.keys['att.session'])?.token ?? null)
        : null;
  if (live?.id === id) for (const key of CHARACTER_KEYS) remove(key);
  else
    writeJson(
      ROSTER_KEY,
      roster().filter((c) => c.id !== id),
    );
  if (token) leaveNow([token]);
}

/** Tells the server these guests left, so they stop standing around in the rooms. */
export function leaveNow(tokens: string[]): void {
  void fetch('/api/leave', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tokens }),
    keepalive: true,
  }).catch(() => {
    // Offline: the sockets close by themselves once the heartbeat stops.
  });
}
