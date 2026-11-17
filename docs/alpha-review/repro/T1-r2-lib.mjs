import { createRequire } from 'node:module';
const require = createRequire('/home/user/around-to-table_study/package.json');
const WS = require('/home/user/around-to-table_study/node_modules/.pnpm/ws@8.21.0/node_modules/ws');
export const BASE = 'http://localhost:8787';
export const uniq = () =>
  Array.from(
    { length: 5 },
    () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)],
  ).join('');
export async function signIn(email) {
  const r = await fetch(`${BASE}/api/auth/dev?email=${encodeURIComponent(email)}`, {
    redirect: 'manual',
  });
  const sc = r.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  return sc;
}
export async function api(cookie, path, method = 'GET', body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { cookie, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j;
  try {
    j = await r.json();
  } catch {
    j = null;
  }
  return { status: r.status, body: j };
}
export async function makeChar(cookie, name, look = { character: 0 }) {
  return api(cookie, '/api/characters', 'POST', { name, look });
}
export async function player(prefix = 'q') {
  const email = `${prefix}${uniq()}@t1.test`;
  const cookie = await signIn(email);
  const name = prefix + uniq();
  const c = await makeChar(cookie, name);
  if (!c.body?.id) throw new Error('char ' + JSON.stringify(c));
  const p = await api(cookie, '/api/play', 'POST', { id: c.body.id });
  return { cookie, email, name, id: c.body.id, token: p.body.token };
}
export function connect(pl, area, extra = '') {
  const ws = new WS(
    `ws://localhost:8787/api/areas/${area}/ws?token=${encodeURIComponent(pl.token)}${extra}`,
    { headers: { cookie: pl.cookie } },
  );
  const msgs = [];
  ws.msgs = msgs;
  ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
  ws.opened = new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
    ws.on('unexpected-response', (q, r) => rej(new Error('http ' + r.statusCode)));
  });
  ws.j = (o) => ws.send(JSON.stringify(o));
  ws.wait = async (pred, ms = 3000) => {
    const t = Date.now();
    while (Date.now() - t < ms) {
      const m = msgs.find(pred);
      if (m) return m;
      await new Promise((r) => setTimeout(r, 30));
    }
    return null;
  };
  return ws;
}
export function social(pl) {
  const ws = new WS(`ws://localhost:8787/api/social/ws?token=${encodeURIComponent(pl.token)}`, {
    headers: { cookie: pl.cookie },
  });
  const msgs = [];
  ws.msgs = msgs;
  ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
  ws.opened = new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
    ws.on('unexpected-response', (q, r) => rej(new Error('http ' + r.statusCode)));
  });
  ws.j = (o) => ws.send(JSON.stringify(o));
  ws.wait = async (pred, ms = 3000) => {
    const t = Date.now();
    while (Date.now() - t < ms) {
      const m = msgs.find(pred);
      if (m) return m;
      await new Promise((r) => setTimeout(r, 30));
    }
    return null;
  };
  return ws;
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function enter(pl, area, look = { character: 0 }) {
  const ws = connect(pl, area);
  await ws.opened;
  ws.j({ t: 'hello', look });
  await ws.wait((m) => m.t === 'welcome');
  return ws;
}
