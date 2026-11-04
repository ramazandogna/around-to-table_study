/**
 * Accounts are Google accounts: no passwords are kept here. This file holds
 * the pieces that do not need storage: the Google sign-in (OAuth 2.0 with
 * PKCE, the ID token checked against Google's keys), the cookies, and the
 * game's door (the per-deploy access code, separate from the account).
 */

export const SESSION_COOKIE = 'att_session';
export const PASS_COOKIE = 'att_pass';
const OAUTH_COOKIE = 'att_oauth';

/** An account session lasts this long, and is extended whenever it is used. */
export const SESSION_MS = 30 * 24 * 60 * 60_000;
/** How long the Google round trip may take. */
const OAUTH_MS = 10 * 60_000;

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_KEYS = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

const encoder = new TextEncoder();

export function base64Url(bytes: Uint8Array): string {
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

export function randomId(bytes = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/* ---------- Cookies ---------- */

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/** A cookie only the server reads; `Secure` everywhere but plain-http localhost. */
export function cookie(request: Request, name: string, value: string, maxAgeMs: number): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  const age = Math.max(0, Math.floor(maxAgeMs / 1000));
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure}`;
}

export const clearCookie = (request: Request, name: string) => cookie(request, name, '', 0);

/* ---------- Signed values (the door pass, the OAuth round trip) ---------- */

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function sign(payload: unknown, secret: string): Promise<string> {
  const body = base64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body));
  return `${body}.${base64Url(new Uint8Array(signature))}`;
}

export async function unsign(
  token: string,
  secret: string,
): Promise<Record<string, unknown> | null> {
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined) return null;
  const bytes = fromBase64Url(signature);
  if (!bytes) return null;
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), bytes, encoder.encode(body));
  if (!ok) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(body) ?? new Uint8Array()));
    return typeof parsed === 'object' && parsed ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/* ---------- The game's door ---------- */

/**
 * Who may walk into the game, apart from having an account:
 * - `code`: whoever knows this deploy's access code (now);
 * - `allowlist`: listed accounts (later, for the closed beta);
 * - `open`: everyone signed in (later, for the open beta).
 */
export const BETA_MODES = ['code', 'allowlist', 'open'] as const;
export type BetaMode = (typeof BETA_MODES)[number];

export function betaMode(value: string | undefined): BetaMode {
  return (BETA_MODES as readonly string[]).includes(value ?? '') ? (value as BetaMode) : 'code';
}

/**
 * The door pass: proof that this account entered the current code. It is
 * signed with the access code itself, so a new code (every deploy) ends every
 * pass, and it names the account, so it opens the door for no one else.
 */
export function signPass(accountId: string, secret: string, accessCode: string): Promise<string> {
  return sign({ kind: 'pass', acct: accountId }, `${secret}:door:${accessCode}`);
}

export async function verifyPass(
  token: string | null,
  accountId: string,
  secret: string,
  accessCode: string,
): Promise<boolean> {
  if (!token) return false;
  const pass = await unsign(token, `${secret}:door:${accessCode}`);
  return pass?.kind === 'pass' && pass.acct === accountId;
}

/** Whether an account may walk in now, by the beta mode. */
export async function doorOpen(options: {
  mode: BetaMode;
  accessCode: string | undefined;
  pass: string | null;
  accountId: string;
  email: string;
  allowed: string | undefined;
  secret: string;
}): Promise<boolean> {
  if (options.mode === 'open') return true;
  if (options.mode === 'allowlist') return emailListed(options.allowed, options.email);
  // No access code set (a local server): the door is open.
  if (!options.accessCode) return true;
  return verifyPass(options.pass, options.accountId, options.secret, options.accessCode);
}

/** A short tag for the current access code, kept on each socket to notice a new deploy. */
export async function doorTag(accessCode: string | undefined): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`door:${accessCode ?? ''}`));
  return base64Url(new Uint8Array(digest).slice(0, 9));
}

export function emailListed(list: string | undefined, email: string): boolean {
  const wanted = email.trim().toLowerCase();
  return (list ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(wanted);
}

/* ---------- Google sign-in ---------- */

export type GoogleUser = { sub: string; email: string; name: string };

async function challengeOf(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export const redirectUri = (request: Request) =>
  `${new URL(request.url).origin}/api/auth/google/callback`;

/** The way to Google's sign-in page, and the cookie that remembers the round trip. */
export async function googleStart(
  request: Request,
  clientId: string,
  secret: string,
): Promise<{ url: string; cookie: string }> {
  const state = randomId(16);
  const verifier = randomId(32);
  const url = new URL(GOOGLE_AUTH);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(request),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: await challengeOf(verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  const trip = await sign({ state, verifier, exp: Date.now() + OAUTH_MS }, secret);
  return { url: url.toString(), cookie: cookie(request, OAUTH_COOKIE, trip, OAUTH_MS) };
}

export const clearOauthCookie = (request: Request) => clearCookie(request, OAUTH_COOKIE);

/** Back from Google: the state checked, the code traded for an ID token, and the token checked. */
export async function googleFinish(
  request: Request,
  options: { clientId: string; clientSecret: string; secret: string },
  fetcher: typeof fetch = fetch,
): Promise<GoogleUser | null> {
  const params = new URL(request.url).searchParams;
  const trip = await unsign(readCookie(request, OAUTH_COOKIE) ?? '', options.secret);
  const state = params.get('state');
  const code = params.get('code');
  if (!trip || !state || !code || trip.state !== state) return null;
  if (typeof trip.exp !== 'number' || trip.exp < Date.now()) return null;
  const response = await fetcher(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: options.clientId,
      client_secret: options.clientSecret,
      redirect_uri: redirectUri(request),
      grant_type: 'authorization_code',
      code_verifier: String(trip.verifier),
    }).toString(),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { id_token?: string };
  if (!body.id_token) return null;
  return verifyIdToken(body.id_token, options.clientId, await googleKeys(fetcher));
}

type Jwk = JsonWebKey & { kid?: string };
let cachedKeys: { keys: Jwk[]; until: number } | null = null;

async function googleKeys(fetcher: typeof fetch): Promise<Jwk[]> {
  if (cachedKeys && cachedKeys.until > Date.now()) return cachedKeys.keys;
  const response = await fetcher(GOOGLE_KEYS);
  const body = (await response.json()) as { keys?: Jwk[] };
  const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '')?.[1]);
  cachedKeys = {
    keys: body.keys ?? [],
    until: Date.now() + (Number.isFinite(maxAge) ? maxAge * 1000 : 60 * 60_000),
  };
  return cachedKeys.keys;
}

/**
 * An ID token from Google, checked: signed by one of Google's keys (RS256),
 * for this app, from Google, not expired, with a verified email.
 */
export async function verifyIdToken(
  token: string,
  clientId: string,
  keys: readonly Jwk[],
  now = Date.now(),
): Promise<GoogleUser | null> {
  const [head, body, signature, extra] = token.split('.');
  if (!head || !body || !signature || extra !== undefined) return null;
  let header: { alg?: string; kid?: string };
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(new TextDecoder().decode(fromBase64Url(head) ?? new Uint8Array()));
    claims = JSON.parse(new TextDecoder().decode(fromBase64Url(body) ?? new Uint8Array()));
  } catch {
    return null;
  }
  if (header.alg !== 'RS256') return null;
  const jwk = keys.find((k) => k.kid === header.kid);
  const bytes = fromBase64Url(signature);
  if (!jwk || !bytes) return null;
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    bytes,
    encoder.encode(`${head}.${body}`),
  );
  if (!ok) return null;
  if (claims.aud !== clientId) return null;
  if (!GOOGLE_ISSUERS.includes(String(claims.iss))) return null;
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < now) return null;
  if (claims.email_verified !== true && claims.email_verified !== 'true') return null;
  if (typeof claims.sub !== 'string' || typeof claims.email !== 'string') return null;
  const name =
    typeof claims.name === 'string' && claims.name ? claims.name : claims.email.split('@')[0];
  return { sub: claims.sub, email: claims.email.toLowerCase(), name: name ?? 'player' };
}
