import type { RoomInfo, RoomRules, RoomSize } from '@att/shared';

/** What went wrong with a room request, as the server says it. */
export type RoomError =
  | 'invalid_name'
  | 'invalid_size'
  | 'invalid_password'
  | 'too_many_rooms'
  | 'unknown_room'
  | 'wrong_password'
  /** The room's owner banned this player. */
  | 'banned'
  | 'network';

/** A room the player is in (or going into), with the pass its socket needs. */
export type RoomTicket = { room: RoomInfo; pass: string };

async function call<T>(path: string, init?: RequestInit): Promise<T | RoomError> {
  try {
    const response = await fetch(path, init);
    const body = (await response.json()) as T & { error?: RoomError };
    if (!response.ok) return body.error ?? 'network';
    return body;
  } catch {
    return 'network';
  }
}

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export async function openRooms(token: string): Promise<RoomInfo[] | RoomError> {
  const result = await call<{ rooms: RoomInfo[] }>(`/api/rooms?token=${encodeURIComponent(token)}`);
  return typeof result === 'string' ? result : result.rooms;
}

export async function findRoom(token: string, code: string): Promise<RoomInfo | RoomError> {
  const result = await call<{ room: RoomInfo }>(
    `/api/rooms/${encodeURIComponent(code)}?token=${encodeURIComponent(token)}`,
  );
  return typeof result === 'string' ? result : result.room;
}

export async function createRoom(
  token: string,
  name: string,
  size: RoomSize,
  password: string,
  rules: RoomRules,
): Promise<RoomInfo | RoomError> {
  const result = await call<{ room: RoomInfo }>(
    '/api/rooms',
    post({ token, name, size, rules, ...(password ? { password } : {}) }),
  );
  return typeof result === 'string' ? result : result.room;
}

/** Checks the password (if any) and returns the pass for the room's socket. */
export function enterRoom(
  token: string,
  code: string,
  password: string,
): Promise<RoomTicket | RoomError> {
  return call<RoomTicket>(
    `/api/rooms/${encodeURIComponent(code)}/enter`,
    post({ token, ...(password ? { password } : {}) }),
  );
}

/** The link that brings someone straight to a room's door. */
export const roomLink = (code: string) => `${location.origin}/?room=${code}`;
