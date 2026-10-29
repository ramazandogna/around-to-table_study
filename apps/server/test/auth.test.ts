import { describe, expect, it } from 'vitest';
import { signSession, verifySession } from '../src/auth';

const secret = 'test-secret-that-is-long-enough-1234567890';
const session = { id: 'abc', name: 'Ayşe', iat: 1 };

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
