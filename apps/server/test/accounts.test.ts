import { describe, expect, it } from 'vitest';
import {
  base64Url,
  betaMode,
  doorOpen,
  doorTag,
  emailListed,
  signPass,
  verifyIdToken,
  verifyPass,
} from '../src/accounts';

const SECRET = 'x'.repeat(40);

describe('the door pass', () => {
  it('opens the door for its own account until the code changes', async () => {
    const pass = await signPass('acct-1', SECRET, 'CODE1234');
    expect(await verifyPass(pass, 'acct-1', SECRET, 'CODE1234')).toBe(true);
    // A deploy brings a new code: every pass made before it stops working.
    expect(await verifyPass(pass, 'acct-1', SECRET, 'NEWCODE9')).toBe(false);
    // A pass handed to someone else opens nothing for them.
    expect(await verifyPass(pass, 'acct-2', SECRET, 'CODE1234')).toBe(false);
    expect(await verifyPass(null, 'acct-1', SECRET, 'CODE1234')).toBe(false);
  });

  it('follows the beta mode', async () => {
    const base = {
      accessCode: 'CODE',
      pass: null,
      accountId: 'a',
      email: 'me@x.com',
      secret: SECRET,
    };
    expect(betaMode(undefined)).toBe('code');
    expect(betaMode('nonsense')).toBe('code');
    expect(await doorOpen({ ...base, mode: 'code', allowed: undefined })).toBe(false);
    expect(
      await doorOpen({ ...base, mode: 'code', accessCode: undefined, allowed: undefined }),
    ).toBe(true);
    expect(await doorOpen({ ...base, mode: 'open', allowed: undefined })).toBe(true);
    expect(await doorOpen({ ...base, mode: 'allowlist', allowed: 'me@x.com' })).toBe(true);
    expect(await doorOpen({ ...base, mode: 'allowlist', allowed: 'you@x.com' })).toBe(false);
  });

  it('tags each code differently, so rooms notice a deploy', async () => {
    expect(await doorTag('A')).toBe(await doorTag('A'));
    expect(await doorTag('A')).not.toBe(await doorTag('B'));
  });
});

describe('admins', () => {
  it('are decided by email, ignoring case and spaces', () => {
    expect(emailListed(' Owner@Gmail.com , other@x.com', 'owner@gmail.com')).toBe(true);
    expect(emailListed('owner@gmail.com', 'someone@gmail.com')).toBe(false);
    expect(emailListed(undefined, 'owner@gmail.com')).toBe(false);
  });
});

describe("Google's ID token", () => {
  const encode = (value: unknown) => base64Url(new TextEncoder().encode(JSON.stringify(value)));

  async function keys() {
    const pair = (await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair;
    const jwk = {
      ...((await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey),
      kid: 'k1',
    };
    const token = async (claims: Record<string, unknown>, kid = 'k1') => {
      const body = `${encode({ alg: 'RS256', kid })}.${encode(claims)}`;
      const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        pair.privateKey,
        new TextEncoder().encode(body),
      );
      return `${body}.${base64Url(new Uint8Array(signature))}`;
    };
    return { jwks: [jwk], token };
  }

  const good = {
    aud: 'client-1',
    iss: 'https://accounts.google.com',
    exp: Math.floor(Date.now() / 1000) + 600,
    sub: '123',
    email: 'Me@Gmail.com',
    email_verified: true,
    name: 'Me',
  };

  it('accepts a token signed by Google for this app, and reads who it is', async () => {
    const { jwks, token } = await keys();
    expect(await verifyIdToken(await token(good), 'client-1', jwks)).toEqual({
      sub: '123',
      email: 'me@gmail.com',
      name: 'Me',
    });
  });

  it('refuses another app, another issuer, an old token, an unverified email or a bad signature', async () => {
    const { jwks, token } = await keys();
    expect(
      await verifyIdToken(await token({ ...good, aud: 'other' }), 'client-1', jwks),
    ).toBeNull();
    expect(
      await verifyIdToken(await token({ ...good, iss: 'https://evil.com' }), 'client-1', jwks),
    ).toBeNull();
    expect(await verifyIdToken(await token({ ...good, exp: 1 }), 'client-1', jwks)).toBeNull();
    expect(
      await verifyIdToken(await token({ ...good, email_verified: false }), 'client-1', jwks),
    ).toBeNull();
    expect(await verifyIdToken(await token(good, 'unknown-key'), 'client-1', jwks)).toBeNull();
    const other = await keys();
    expect(await verifyIdToken(await other.token(good), 'client-1', jwks)).toBeNull();
  });
});
