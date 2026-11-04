import {
  AREAS,
  cleanRoomName,
  createHealthResponse,
  isRoomArea,
  isValidRoomPassword,
  normalizeName,
  normalizeRoomCode,
  PUBLIC_AREAS,
  cleanRoomRules,
  roomArea,
  ROOM_SIZES,
  type AreaId,
  type RoomSize,
} from '@att/shared';
import { AREA_HEADERS } from './area-room';
import { signRoomPass, signSession, verifyRoomPass, verifySession, type Session } from './auth';
import type { Env } from './env';
import { SOCIAL_HEADERS } from './social-hub';

export { AreaRoom } from './area-room';
export { SocialHub } from './social-hub';

const MIN_SECRET_LENGTH = 32;
const AREA_SOCKET = /^\/api\/areas\/([a-z0-9]+)\/ws$/;
const ROOM_PATH = /^\/api\/rooms\/([A-Za-z2-9]+)(\/enter)?$/;

const error = (code: string, status: number) => Response.json({ error: code }, { status });

/**
 * The key tokens are signed with. The access password is part of it, so a new
 * password (every deploy) ends every session and room pass made before it.
 */
function secretOf(env: Env): string | null {
  return env.SESSION_SECRET && env.SESSION_SECRET.length >= MIN_SECRET_LENGTH
    ? `${env.SESSION_SECRET}:${env.ACCESS_PASSWORD ?? ''}`
    : null;
}

/** Compares two strings in time that does not depend on where they differ. */
function sameText(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Whether the door needs the password, and whether a token the browser holds
 * still opens it (after a new password, it does not).
 */
async function access(request: Request, env: Env): Promise<Response> {
  const secret = secretOf(env);
  const token = new URL(request.url).searchParams.get('token') ?? '';
  const valid = !!secret && !!token && (await verifySession(token, secret)) !== null;
  return Response.json({ required: !!env.ACCESS_PASSWORD, valid });
}

async function createGuest(request: Request, env: Env): Promise<Response> {
  const secret = secretOf(env);
  if (!secret) return error('server_misconfigured', 500);

  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    password?: unknown;
  } | null;
  if (env.ACCESS_PASSWORD) {
    const address = request.headers.get('cf-connecting-ip') ?? 'local';
    if (!(await env.SOCIAL.getByName('hub').passwordTry(address))) {
      return error('too_many_tries', 429);
    }
    const password = typeof body?.password === 'string' ? body.password.trim() : '';
    if (!sameText(password, env.ACCESS_PASSWORD)) return error('wrong_password', 403);
  }
  const name = typeof body?.name === 'string' ? normalizeName(body.name) : null;
  if (!name) return error('invalid_name', 400);

  const session = { id: crypto.randomUUID(), name, iat: Math.floor(Date.now() / 1000) };
  return Response.json({ token: await signSession(session, secret), id: session.id, name });
}

/** The session from a socket URL's `token`, or an error response. */
async function sessionFrom(request: Request, env: Env): Promise<Session | Response> {
  const secret = secretOf(env);
  if (!secret) return error('server_misconfigured', 500);
  const token = new URL(request.url).searchParams.get('token') ?? '';
  return (await verifySession(token, secret)) ?? error('unauthorized', 401);
}

/**
 * The profile behind a token: the character select screen shows each of the
 * device's characters with their badges and hours, without entering the world.
 */
async function ownProfile(request: Request, env: Env): Promise<Response> {
  const session = await sessionFrom(request, env);
  if (session instanceof Response) return session;
  const profile = await env.SOCIAL.getByName('hub').profileOf(session.id);
  return profile ? Response.json({ profile }) : error('not_found', 404);
}

/** Tokens one "start over" may clear: this device's current and past guests. */
const MAX_LEAVE_TOKENS = 10;

/**
 * Starting over: every guest this device has been leaves the building now,
 * instead of lingering until their sockets time out. Only tokens the device
 * holds count, so nobody can send anyone else away.
 */
async function leave(request: Request, env: Env): Promise<Response> {
  const secret = secretOf(env);
  if (!secret) return error('server_misconfigured', 500);
  const body = (await request.json().catch(() => null)) as { tokens?: unknown } | null;
  const tokens = Array.isArray(body?.tokens) ? body.tokens.slice(0, MAX_LEAVE_TOKENS) : [];
  const sessions = await Promise.all(
    tokens.map((token) => (typeof token === 'string' ? verifySession(token, secret) : null)),
  );
  const ids = [...new Set(sessions.flatMap((session) => (session ? [session.id] : [])))];
  if (ids.length > 0) {
    const [rooms] = await Promise.all([
      env.SOCIAL.getByName('hub').kick(ids),
      ...PUBLIC_AREAS.map((area) => env.AREAS.getByName(area).kick(ids)),
    ]);
    await Promise.all(rooms.map((code) => env.AREAS.getByName(`room:${code}`).kick(ids)));
  }
  return Response.json({ left: ids.length });
}

async function joinSocial(request: Request, env: Env): Promise<Response> {
  const session = await sessionFrom(request, env);
  if (session instanceof Response) return session;
  const headers = new Headers(request.headers);
  headers.set(SOCIAL_HEADERS.id, session.id);
  headers.set(SOCIAL_HEADERS.name, encodeURIComponent(session.name));
  return env.SOCIAL.getByName('hub').fetch(new Request(request, { headers }));
}

/** The session from a JSON body's `token`, or an error response. */
async function sessionFromBody(
  body: { token?: unknown } | null,
  env: Env,
): Promise<Session | Response> {
  const secret = secretOf(env);
  if (!secret) return error('server_misconfigured', 500);
  const token = typeof body?.token === 'string' ? body.token : '';
  return (await verifySession(token, secret)) ?? error('unauthorized', 401);
}

/**
 * Private rooms. Opening one, listing the open ones for the reception, looking
 * one up by code, and coming in: the password (if any) is checked once here,
 * and the answer is a pass the room's socket accepts for a while.
 */
async function rooms(request: Request, env: Env, pathname: string): Promise<Response> {
  const hub = env.SOCIAL.getByName('hub');
  if (pathname === '/api/rooms') {
    if (request.method === 'GET') {
      const session = await sessionFrom(request, env);
      if (session instanceof Response) return session;
      return Response.json({ rooms: await hub.openRooms() });
    }
    if (request.method !== 'POST') return error('not_found', 404);
    const body = (await request.json().catch(() => null)) as {
      token?: unknown;
      name?: unknown;
      size?: unknown;
      password?: unknown;
      rules?: unknown;
    } | null;
    const session = await sessionFromBody(body, env);
    if (session instanceof Response) return session;
    const name = typeof body?.name === 'string' ? cleanRoomName(body.name) : null;
    const size = ROOM_SIZES.find((s) => s === body?.size);
    const password = typeof body?.password === 'string' && body.password ? body.password : null;
    if (!name) return error('invalid_name', 400);
    if (!size) return error('invalid_size', 400);
    if (password !== null && !isValidRoomPassword(password)) return error('invalid_password', 400);
    const room = await hub.createRoom(
      session.id,
      name,
      size,
      password,
      cleanRoomRules(body?.rules),
    );
    return room ? Response.json({ room }) : error('too_many_rooms', 429);
  }
  const match = ROOM_PATH.exec(pathname);
  const code = match?.[1] ? normalizeRoomCode(match[1]) : null;
  if (!code) return error('not_found', 404);
  if (!match?.[2]) {
    const session = await sessionFrom(request, env);
    if (session instanceof Response) return session;
    const room = await hub.roomInfo(code);
    return room ? Response.json({ room }) : error('unknown_room', 404);
  }
  if (request.method !== 'POST') return error('not_found', 404);
  const body = (await request.json().catch(() => null)) as {
    token?: unknown;
    password?: unknown;
  } | null;
  const session = await sessionFromBody(body, env);
  if (session instanceof Response) return session;
  const password = typeof body?.password === 'string' ? body.password : null;
  const check = await hub.checkRoom(code, password, session.id);
  if (check === 'unknown') return error('unknown_room', 404);
  if (check === 'banned') return error('banned', 403);
  if (check === 'password') return error('wrong_password', 403);
  const room = await hub.roomInfo(code);
  const secret = secretOf(env);
  if (!room || !secret) return error('unknown_room', 404);
  return Response.json({ room, pass: await signRoomPass(code, session.id, Date.now(), secret) });
}

async function joinArea(request: Request, env: Env, area: string): Promise<Response> {
  if (!(area in AREAS)) return error('unknown_area', 404);
  const session = await sessionFrom(request, env);
  if (session instanceof Response) return session;

  // A private room: only with a pass for this room, into that room's own object.
  let object = area;
  let rules: string | null = null;
  if (isRoomArea(area)) {
    const params = new URL(request.url).searchParams;
    const code = normalizeRoomCode(params.get('room') ?? '');
    const secret = secretOf(env);
    if (!code || !secret) return error('unknown_room', 404);
    const passed = await verifyRoomPass(
      params.get('pass') ?? '',
      secret,
      code,
      session.id,
      Date.now(),
    );
    if (!passed) return error('unauthorized', 401);
    const room = await env.SOCIAL.getByName('hub').roomInfo(code);
    if (!room || roomArea(room.size as RoomSize) !== area) return error('unknown_room', 404);
    object = `room:${code}`;
    rules = JSON.stringify(room.rules);
  }
  // The conference hall is always open; who presents is asked again at each change of the screen.
  let role: string | null = null;
  if (area === 'conference') {
    role = (await env.SOCIAL.getByName('hub').conferenceRole(session.id, !env.ACCESS_PASSWORD))
      .role;
  }

  const headers = new Headers(request.headers);
  headers.set(AREA_HEADERS.id, session.id);
  headers.set(AREA_HEADERS.name, encodeURIComponent(session.name));
  headers.set(AREA_HEADERS.area, area as AreaId);
  if (rules) headers.set(AREA_HEADERS.rules, rules);
  if (role) headers.set(AREA_HEADERS.role, role);
  return env.AREAS.getByName(object).fetch(new Request(request, { headers }));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/health') return Response.json(createHealthResponse());
    if (pathname === '/api/guest' && request.method === 'POST') return createGuest(request, env);
    if (pathname === '/api/access') return access(request, env);
    if (pathname === '/api/profile') return ownProfile(request, env);

    if (pathname === '/api/leave' && request.method === 'POST') return leave(request, env);
    if (pathname === '/api/rooms' || pathname.startsWith('/api/rooms/'))
      return rooms(request, env, pathname);
    if (pathname === '/api/social/ws') return joinSocial(request, env);
    const socket = AREA_SOCKET.exec(pathname);
    if (socket?.[1]) return joinArea(request, env, socket[1]);

    return error('not_found', 404);
  },
} satisfies ExportedHandler<Env>;
