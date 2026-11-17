import type { Appearance, Profile } from '@att/shared';
import type { GuestSession } from './session';

/**
 * The account side: who is signed in (with Google), whether the game's door
 * is open to them (this deploy's access code), their characters, and the
 * game token for the one they play. Everything rides on same-origin cookies
 * the page cannot read; nothing about the account is kept in localStorage.
 */

export type AccountInfo = { name: string; email: string; role: 'admin' | 'user' };

export type ServerCharacter = {
  id: string;
  name: string;
  look: Appearance | null;
  /** What the character keeps between visits: storage keys and their raw values. */
  save: Record<string, string> | null;
  profile: Profile | null;
};

export type Me = {
  account: AccountInfo | null;
  door: boolean;
  characters: ServerCharacter[];
  /** With `presence`: whether that presence is still the account's. */
  presence?: boolean;
  google: boolean;
  devSignIn: boolean;
};

export type PlayTicket = GuestSession & { presence: string };

const json = { 'content-type': 'application/json' };

async function call<T>(url: string, init?: RequestInit): Promise<T | { error: string }> {
  try {
    const response = await fetch(url, { credentials: 'same-origin', ...init });
    const body = (await response.json().catch(() => ({}))) as T & { error?: string };
    return response.ok ? body : { error: body.error ?? `http_${response.status}` };
  } catch {
    return { error: 'network' };
  }
}

export const isError = (value: unknown): value is { error: string } =>
  typeof value === 'object' && value !== null && 'error' in value;

export async function fetchMe(presence?: string): Promise<Me | null> {
  const result = await call<Partial<Me>>(
    `/api/me${presence ? `?presence=${encodeURIComponent(presence)}` : ''}`,
  );
  if (isError(result)) return null;
  return {
    account: result.account ?? null,
    door: !!result.door,
    characters: result.characters ?? [],
    ...(result.presence !== undefined ? { presence: result.presence } : {}),
    google: !!result.google,
    devSignIn: !!result.devSignIn,
  };
}

export const enterDoor = (code: string) =>
  call<{ ok: true }>('/api/door', {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ code }),
  });

export const createCharacter = (name: string, look: Appearance) =>
  call<{ id: string }>('/api/characters', {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ name, look }),
  });

export const deleteCharacter = (id: string) =>
  call<{ ok: true }>(`/api/characters/${id}`, { method: 'DELETE' });

export const saveLookOnServer = (id: string, look: Appearance) =>
  call<{ ok: true }>(`/api/characters/${id}/look`, {
    method: 'PUT',
    headers: json,
    body: JSON.stringify({ look }),
  });

export const play = (id: string) =>
  call<PlayTicket>('/api/play', { method: 'POST', headers: json, body: JSON.stringify({ id }) });

export async function signOut(): Promise<void> {
  await call('/api/logout', { method: 'POST' });
}

/** Erases the account on the server (the caller has asked for a typed confirmation); true when it is gone. */
export async function deleteAccountOnServer(): Promise<boolean> {
  const result = await call<{ ok?: boolean }>('/api/account/delete', {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ confirm: true }),
  });
  return !isError(result);
}

/* ---------- Progress kept per character, on the server ---------- */

/**
 * The storage keys a character keeps between visits and devices. The game
 * still reads and writes them in localStorage; they are sent to the server
 * now and then, and put back when the character is chosen.
 */
export const PROGRESS_KEYS = [
  'att.lines',
  'att.linesUntil',
  'att.stats',
  'att.goal',
  'att.goals',
  'att.daily',
  'att.found',
  'att.played',
  'att.prizes',
  'att.lastPlan',
  'att.lastSit',
] as const;

/**
 * What the player has been shown (the welcome note, the room tips). Sent with
 * the progress and put back, but never erased by another character's save, so
 * the welcome shows once per account rather than once per character.
 */
export const SEEN_KEYS = ['att.intro', 'att.coach'] as const;

/** Which character's progress is in localStorage now (and which one a reload goes back to). */
const PLAYING_KEY = 'att.playing';

function storage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function playingId(): string | null {
  try {
    return sessionStorage.getItem(PLAYING_KEY);
  } catch {
    return null;
  }
}

export function setPlayingId(id: string | null): void {
  try {
    if (id) sessionStorage.setItem(PLAYING_KEY, id);
    else sessionStorage.removeItem(PLAYING_KEY);
  } catch {
    // This visit only.
  }
}

/** Puts a character's saved progress into localStorage, replacing whoever was there. */
export function loadProgress(save: Record<string, string> | null): void {
  const store = storage();
  if (!store) return;
  for (const key of PROGRESS_KEYS) {
    const value = save?.[key];
    if (typeof value === 'string') store.setItem(key, value);
    else store.removeItem(key);
  }
  for (const key of SEEN_KEYS) {
    const value = save?.[key];
    if (typeof value === 'string') store.setItem(key, mergeSeen(key, store.getItem(key), value));
  }
}

/** The union of two "seen" records: the room tips are an object of rooms, the intro a flag. */
export function mergeSeen(key: string, mine: string | null, theirs: string | null): string {
  if (key !== 'att.coach') return mine ?? theirs ?? 'true';
  try {
    return JSON.stringify({
      ...(JSON.parse(theirs ?? '{}') as object),
      ...(JSON.parse(mine ?? '{}') as object),
    });
  } catch {
    return mine ?? theirs ?? '{}';
  }
}

function collectProgress(): Record<string, string> {
  const store = storage();
  const save: Record<string, string> = {};
  if (!store) return save;
  for (const key of [...PROGRESS_KEYS, ...SEEN_KEYS]) {
    const value = store.getItem(key);
    if (value !== null) save[key] = value;
  }
  return save;
}

/** Sends the playing character's progress to the server; `leaving` survives the page closing. */
export function saveProgress(id: string, leaving = false): void {
  void fetch(`/api/characters/${id}/save`, {
    method: 'PUT',
    headers: json,
    credentials: 'same-origin',
    body: JSON.stringify({ save: collectProgress() }),
    keepalive: leaving,
  }).catch(() => {
    // Sent again in a minute, or when leaving.
  });
}
