import { describe, expect, it } from 'vitest';
import {
  ROOM_PASS_MS,
  signRoomPass,
  signSession,
  verifyRoomPass,
  verifySession,
} from '../src/auth';

const secret = 'test-secret-that-is-long-enough-1234567890';
const session = { id: 'abc', name: 'Ayşe', iat: 1, acct: 'a1', p: 'p1' };

describe('guest tokens', () => {
  it('round-trips a session', async () => {
    const token = await signSession(session, secret);
    expect(await verifySession(token, secret)).toEqual(session);
  });

  it('rejects a token signed with another secret', async () => {
    const token = await signSession(session, `${secret}-other`);
    expect(await verifySession(token, secret)).toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const [, signature] = (await signSession(session, secret)).split('.');
    const forged = Buffer.from(JSON.stringify({ ...session, id: 'someone-else' })).toString(
      'base64url',
    );
    expect(await verifySession(`${forged}.${signature}`, secret)).toBeNull();
  });

  it.each(['', 'a', 'a.b.c', '!!!.???'])('rejects malformed token %j', async (token) => {
    expect(await verifySession(token, secret)).toBeNull();
  });
});

describe('room passes', () => {
  const now = 1_000_000;
  it('lets one guest into one room for a while', async () => {
    const pass = await signRoomPass('ABCDEF', 'abc', now, secret);
    expect(await verifyRoomPass(pass, secret, 'ABCDEF', 'abc', now + 1000)).toBe(true);
    expect(await verifyRoomPass(pass, secret, 'ABCDEG', 'abc', now)).toBe(false);
    expect(await verifyRoomPass(pass, secret, 'ABCDEF', 'xyz', now)).toBe(false);
    expect(await verifyRoomPass(pass, secret, 'ABCDEF', 'abc', now + ROOM_PASS_MS + 1)).toBe(false);
  });

  it('is never a session, and a session is never a pass', async () => {
    const pass = await signRoomPass('ABCDEF', 'abc', now, secret);
    expect(await verifySession(pass, secret)).toBeNull();
    const token = await signSession(session, secret);
    expect(await verifyRoomPass(token, secret, 'ABCDEF', 'abc', now)).toBe(false);
  });
});
