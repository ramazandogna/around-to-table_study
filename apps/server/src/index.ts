import { AREAS, createHealthResponse, normalizeName, type AreaId } from '@att/shared';
import { AREA_HEADERS } from './area-room';
import { signSession, verifySession } from './auth';
import type { Env } from './env';

export { AreaRoom } from './area-room';

const MIN_SECRET_LENGTH = 32;
const AREA_SOCKET = /^\/api\/areas\/([a-z]+)\/ws$/;

const error = (code: string, status: number) => Response.json({ error: code }, { status });

function secretOf(env: Env): string | null {
  return env.SESSION_SECRET && env.SESSION_SECRET.length >= MIN_SECRET_LENGTH
    ? env.SESSION_SECRET
    : null;
}

async function createGuest(request: Request, env: Env): Promise<Response> {
  const secret = secretOf(env);
  if (!secret) return error('server_misconfigured', 500);

  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = typeof body?.name === 'string' ? normalizeName(body.name) : null;
  if (!name) return error('invalid_name', 400);

  const session = { id: crypto.randomUUID(), name, iat: Math.floor(Date.now() / 1000) };
  return Response.json({ token: await signSession(session, secret), id: session.id, name });
}

async function joinArea(request: Request, env: Env, area: string): Promise<Response> {
  if (!(area in AREAS)) return error('unknown_area', 404);
  const secret = secretOf(env);
  if (!secret) return error('server_misconfigured', 500);

  const token = new URL(request.url).searchParams.get('token') ?? '';
  const session = await verifySession(token, secret);
  if (!session) return error('unauthorized', 401);

  const headers = new Headers(request.headers);
  headers.set(AREA_HEADERS.id, session.id);
  headers.set(AREA_HEADERS.name, encodeURIComponent(session.name));
  headers.set(AREA_HEADERS.area, area as AreaId);
  return env.AREAS.getByName(area).fetch(new Request(request, { headers }));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/health') return Response.json(createHealthResponse());
    if (pathname === '/api/guest' && request.method === 'POST') return createGuest(request, env);

    const socket = AREA_SOCKET.exec(pathname);
    if (socket?.[1]) return joinArea(request, env, socket[1]);

    return error('not_found', 404);
  },
} satisfies ExportedHandler<Env>;
