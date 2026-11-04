import { normalizeName } from '@att/shared';

/**
 * A game token: one character of one account, playing now. It is signed with
 * a key that includes the access code, so every deploy ends it, and it names
 * the account's presence, so only the newest tab or device keeps playing.
 */
export type Session = {
  /** The character's id: what everyone else sees as "who". */
  id: string;
  name: string;
  /** Issued-at, seconds since epoch. */
  iat: number;
  /** The account it belongs to. */
  acct: string;
  /** The account's presence it was made for (see `takePresence`). */
  p: string;
};

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/** A token is `payload.signature`, both base64url; the payload is JSON. */
async function signPayload(payload: unknown, secret: string): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/** The JSON inside a token signed with `secret`, or null. */
async function verifyPayload(
  token: string,
  secret: string,
): Promise<Record<string, unknown> | null> {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  const signatureBytes = fromBase64Url(signature);
  if (!signatureBytes) return null;
  const valid = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    signatureBytes,
    encoder.encode(payload),
  );
  if (!valid) return null;
  const payloadBytes = fromBase64Url(payload);
  if (!payloadBytes) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(payloadBytes)) as unknown;
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function signSession(session: Session, secret: string): Promise<string> {
  return signPayload(session, secret);
}

export async function verifySession(token: string, secret: string): Promise<Session | null> {
  const session = await verifyPayload(token, secret);
  if (!session || typeof session.id !== 'string' || typeof session.iat !== 'number') return null;
  const name = typeof session.name === 'string' ? normalizeName(session.name) : null;
  if (typeof session.acct !== 'string' || typeof session.p !== 'string') return null;
  return name ? { id: session.id, name, iat: session.iat, acct: session.acct, p: session.p } : null;
}

/** How long a room pass lets someone (re)connect to a private room. */
export const ROOM_PASS_MS = 12 * 60 * 60_000;

/**
 * A pass into one private room for one guest, given once the password (if
 * any) was right, so sockets never carry the password itself.
 */
export function signRoomPass(
  code: string,
  id: string,
  now: number,
  secret: string,
): Promise<string> {
  return signPayload({ kind: 'room', code, id, exp: now + ROOM_PASS_MS }, secret);
}

export async function verifyRoomPass(
  token: string,
  secret: string,
  code: string,
  id: string,
  now: number,
): Promise<boolean> {
  const pass = await verifyPayload(token, secret);
  return (
    pass?.kind === 'room' &&
    pass.code === code &&
    pass.id === id &&
    typeof pass.exp === 'number' &&
    pass.exp > now
  );
}
