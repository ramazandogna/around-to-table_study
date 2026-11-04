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
import {
  betaMode,
  clearCookie,
  clearOauthCookie,
  cookie,
  doorOpen,
  emailListed,
  googleFinish,
  googleStart,
  PASS_COOKIE,
  randomId,
  readCookie,
  SESSION_COOKIE,
  SESSION_MS,
  signPass,
} from './accounts';
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

/* ---------- Accounts: who someone is ---------- */

type Account = { id: string; email: string; name: string };

/** The signed-in account behind the session cookie, or null. */
async function accountFrom(request: Request, env: Env): Promise<Account | null> {
  const sessionId = readCookie(request, SESSION_COOKIE);
  if (!sessionId) return null;
  return env.SOCIAL.getByName('hub').sessionAccount(sessionId, SESSION_MS);
}

const isLocal = (request: Request) =>
  ['localhost', '127.0.0.1'].includes(new URL(request.url).hostname);

/** Signs an account in: a session row and its cookie, then back to the game. */
async function startSession(request: Request, env: Env, accountId: string): Promise<Response> {
  const sessionId = randomId(32);
  await env.SOCIAL.getByName('hub').createSession(
    accountId,
    sessionId,
    request.headers.get('user-agent') ?? '',
    SESSION_MS,
  );
  const headers = new Headers({ location: '/' });
  headers.append('set-cookie', cookie(request, SESSION_COOKIE, sessionId, SESSION_MS));
  headers.append('set-cookie', clearOauthCookie(request));
  return new Response(null, { status: 302, headers });
}

async function googleSignIn(request: Request, env: Env): Promise<Response> {
  const secret = secretOf(env);
  if (!secret || !env.GOOGLE_CLIENT_ID) return error('google_not_set', 503);
  const { url, cookie: trip } = await googleStart(request, env.GOOGLE_CLIENT_ID, secret);
  return new Response(null, { status: 302, headers: { location: url, 'set-cookie': trip } });
}

async function googleCallback(request: Request, env: Env): Promise<Response> {
  const secret = secretOf(env);
  if (!secret || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return error('google_not_set', 503);
  }
  const user = await googleFinish(request, {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    secret,
  });
  if (!user) return Response.redirect(`${new URL(request.url).origin}/?signin=failed`, 302);
  const accountId = await env.SOCIAL.getByName('hub').signIn(user);
  if (!accountId) return Response.redirect(`${new URL(request.url).origin}/?signin=disabled`, 302);
  return startSession(request, env, accountId);
}

/**
 * For tests and local play only: signs in as a made-up Google user. It exists
 * only on a local server with no Google client set; in production it is a 404.
 */
async function devSignIn(request: Request, env: Env): Promise<Response> {
  if (env.GOOGLE_CLIENT_ID || !isLocal(request)) return error('not_found', 404);
  const email = (new URL(request.url).searchParams.get('email') ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) return error('invalid_email', 400);
  const accountId = await env.SOCIAL.getByName('hub').signIn({
    sub: `dev:${email}`,
    email,
    name: email.split('@')[0] ?? 'player',
  });
  return accountId ? startSession(request, env, accountId) : error('disabled', 403);
}

async function logout(request: Request, env: Env): Promise<Response> {
  const sessionId = readCookie(request, SESSION_COOKIE);
  if (sessionId) await env.SOCIAL.getByName('hub').endSession(sessionId);
  const headers = new Headers();
  headers.append('set-cookie', clearCookie(request, SESSION_COOKIE));
  headers.append('set-cookie', clearCookie(request, PASS_COOKIE));
  return Response.json({ ok: true }, { headers });
}

/** Whether this account may walk into the game now (see `doorOpen`). */
async function doorOpenFor(request: Request, env: Env, account: Account): Promise<boolean> {
  const secret = secretOf(env);
  if (!secret) return false;
  return doorOpen({
    mode: betaMode(env.BETA_MODE),
    accessCode: env.ACCESS_PASSWORD,
    pass: readCookie(request, PASS_COOKIE),
    accountId: account.id,
    email: account.email,
    allowed: env.ALLOWED_EMAILS,
    secret,
  });
}

/**
 * Who is signed in, whether the game's door is open to them, their characters
 * and, with `?presence=`, whether that tab's presence is still the account's.
 */
async function me(request: Request, env: Env): Promise<Response> {
  const google = !!env.GOOGLE_CLIENT_ID;
  const devSignIn = !google && isLocal(request);
  const account = await accountFrom(request, env);
  if (!account) return Response.json({ account: null, google, devSignIn });
  const hub = env.SOCIAL.getByName('hub');
  const nonce = new URL(request.url).searchParams.get('presence');
  return Response.json({
    account: {
      name: account.name,
      email: account.email,
      role: emailListed(env.ADMIN_EMAILS, account.email) ? 'admin' : 'user',
    },
    mode: betaMode(env.BETA_MODE),
    door: await doorOpenFor(request, env, account),
    characters: await hub.charactersOf(account.id),
    ...(nonce ? { presence: await hub.presenceIs(account.id, nonce) } : {}),
    google,
    devSignIn,
  });
}

/** The door: this deploy's access code, tried a few times at most, gives a pass for this account. */
async function door(request: Request, env: Env): Promise<Response> {
  const account = await accountFrom(request, env);
  if (!account) return error('signed_out', 401);
  const secret = secretOf(env);
  if (!secret) return error('server_misconfigured', 500);
  if (!env.ACCESS_PASSWORD) return Response.json({ ok: true });
  const hub = env.SOCIAL.getByName('hub');
  const address = request.headers.get('cf-connecting-ip') ?? 'local';
  const [byAccount, byAddress] = await Promise.all([
    hub.passwordTry(`acct:${account.id}`),
    hub.passwordTry(`ip:${address}`),
  ]);
  if (!byAccount || !byAddress) return error('too_many_tries', 429);
  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (!sameText(code, env.ACCESS_PASSWORD)) return error('wrong_code', 403);
  const pass = await signPass(account.id, secret, env.ACCESS_PASSWORD);
  // The pass lasts until the next deploy changes the code; the cookie may outlive that harmlessly.
  return Response.json(
    { ok: true },
    { headers: { 'set-cookie': cookie(request, PASS_COOKIE, pass, SESSION_MS) } },
  );
}

const CHARACTER_PATH = /^\/api\/characters(?:\/([0-9a-f-]{36})(?:\/(look|save))?)?$/;

/** Making, changing and deleting the account's characters (the door need not be open). */
async function characters(request: Request, env: Env, pathname: string): Promise<Response> {
  const account = await accountFrom(request, env);
  if (!account) return error('signed_out', 401);
  const hub = env.SOCIAL.getByName('hub');
  const match = CHARACTER_PATH.exec(pathname);
  if (!match) return error('not_found', 404);
  const [, id, part] = match;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!id && request.method === 'POST') {
    const name = typeof body?.name === 'string' ? normalizeName(body.name) : null;
    if (!name) return error('invalid_name', 400);
    const made = await hub.createCharacter(account.id, name, body?.look);
    return 'error' in made ? error(made.error, 400) : Response.json(made);
  }
  if (id && !part && request.method === 'DELETE') {
    const gone = await hub.deleteCharacter(account.id, id);
    if (gone) await sendOut(env, [id]);
    return gone ? Response.json({ ok: true }) : error('not_found', 404);
  }
  if (id && part === 'look' && request.method === 'PUT') {
    return (await hub.setCharacterLook(account.id, id, body?.look))
      ? Response.json({ ok: true })
      : error('invalid', 400);
  }
  if (id && part === 'save' && request.method === 'PUT') {
    const save = JSON.stringify(body?.save ?? {});
    return (await hub.saveCharacter(account.id, id, save))
      ? Response.json({ ok: true })
      : error('invalid', 400);
  }
  return error('not_found', 404);
}

/** Sends characters out of every room they are in (another tab took over, or one was deleted). */
async function sendOut(env: Env, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const [rooms] = await Promise.all([
    env.SOCIAL.getByName('hub').kick(ids),
    ...PUBLIC_AREAS.map((area) => env.AREAS.getByName(area).kick(ids)),
  ]);
  await Promise.all(rooms.map((code) => env.AREAS.getByName(`room:${code}`).kick(ids)));
}

/**
 * Into the game as one character: the door must be open, the character the
 * account's own, and this becomes the account's one presence (any other tab
 * or device is sent out). The answer is the game token the sockets use.
 */
async function play(request: Request, env: Env): Promise<Response> {
  const account = await accountFrom(request, env);
  if (!account) return error('signed_out', 401);
  if (!(await doorOpenFor(request, env, account))) return error('door_closed', 403);
  const secret = secretOf(env);
  if (!secret) return error('server_misconfigured', 500);
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const hub = env.SOCIAL.getByName('hub');
  const character =
    typeof body?.id === 'string' ? await hub.characterOf(account.id, body.id) : null;
  if (!character) return error('not_found', 404);
  const { nonce, previous } = await hub.takePresence(account.id, character.id);
  await sendOut(env, previous);
  const session: Session = {
    id: character.id,
    name: character.name,
    iat: Math.floor(Date.now() / 1000),
    acct: account.id,
    p: nonce,
  };
  return Response.json({
    token: await signSession(session, secret),
    id: character.id,
    name: character.name,
    presence: nonce,
  });
}

/**
 * The game token from a socket URL's `token`, or an error: signed with this
 * deploy's key, made for the account signed in on this browser, and still the
 * account's current presence.
 */
async function sessionFrom(request: Request, env: Env): Promise<Session | Response> {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  return checkToken(request, env, token);
}

async function checkToken(request: Request, env: Env, token: string): Promise<Session | Response> {
  const secret = secretOf(env);
  if (!secret) return error('server_misconfigured', 500);
  const session = await verifySession(token, secret);
  if (!session) return error('unauthorized', 401);
  const account = await accountFrom(request, env);
  if (!account || account.id !== session.acct) return error('unauthorized', 401);
  if (!(await env.SOCIAL.getByName('hub').presenceIs(account.id, session.p))) {
    return error('elsewhere', 409);
  }
  return session;
}

/**
 * The profile of one of the account's characters, for the character select.
 */
async function ownProfile(request: Request, env: Env): Promise<Response> {
  const session = await sessionFrom(request, env);
  if (session instanceof Response) return session;
  const profile = await env.SOCIAL.getByName('hub').profileOf(session.id);
  return profile ? Response.json({ profile }) : error('not_found', 404);
}

async function joinSocial(request: Request, env: Env): Promise<Response> {
  const session = await sessionFrom(request, env);
  if (session instanceof Response) return session;
  const headers = new Headers(request.headers);
  headers.set(SOCIAL_HEADERS.id, session.id);
  headers.set(SOCIAL_HEADERS.name, encodeURIComponent(session.name));
  return env.SOCIAL.getByName('hub').fetch(new Request(request, { headers }));
}

/** The game token from a JSON body's `token`, checked like a socket's. */
async function sessionFromBody(
  request: Request,
  body: { token?: unknown } | null,
  env: Env,
): Promise<Session | Response> {
  return checkToken(request, env, typeof body?.token === 'string' ? body.token : '');
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
    const session = await sessionFromBody(request, body, env);
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
  const session = await sessionFromBody(request, body, env);
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
    if (pathname === '/api/auth/google') return googleSignIn(request, env);
    if (pathname === '/api/auth/google/callback') return googleCallback(request, env);
    if (pathname === '/api/auth/dev') return devSignIn(request, env);
    if (pathname === '/api/me') return me(request, env);
    if (pathname === '/api/logout' && request.method === 'POST') return logout(request, env);
    if (pathname === '/api/door' && request.method === 'POST') return door(request, env);
    if (pathname === '/api/play' && request.method === 'POST') return play(request, env);
    if (pathname === '/api/characters' || pathname.startsWith('/api/characters/'))
      return characters(request, env, pathname);
    if (pathname === '/api/profile') return ownProfile(request, env);

    if (pathname === '/api/rooms' || pathname.startsWith('/api/rooms/'))
      return rooms(request, env, pathname);
    if (pathname === '/api/social/ws') return joinSocial(request, env);
    const socket = AREA_SOCKET.exec(pathname);
    if (socket?.[1]) return joinArea(request, env, socket[1]);

    return error('not_found', 404);
  },
} satisfies ExportedHandler<Env>;
