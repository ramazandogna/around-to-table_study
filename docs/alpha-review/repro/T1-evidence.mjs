/* global console, process, fetch, WebSocket, setTimeout, location */
// T1 evidence for the S3/S4 findings (protocol level, real local server, separate contexts).
// Prints one line per check; exits 1 when any listed bug still reproduces.
import { chromium, BASE, uniq } from './helpers.mjs';

const browser = await chromium.launch();
const results = [];
const note = (id, bug, detail) => {
  results.push(bug);
  console.log(`${bug ? 'BUG ' : 'ok  '} ${id}: ${detail}`);
};

/** A signed-in person in their own context; `call` runs code in the page (same origin, cookies). */
async function person(name) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}/api/auth/dev?email=t1ev${uniq()}@example.com`);
  const made = await page.evaluate(async (name) => {
    const post = (u, b) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
    const r = await post('/api/characters', { name, look: { character: 0 } });
    if (!r.ok) return { status: r.status };
    const { id } = await r.json();
    const { token } = await (await post('/api/play', { id })).json();
    return { id, token, status: r.status };
  }, name);
  return { page, ...made, name };
}
/** Opens a socket in the page; messages collect in window.__m[key]. */
const open = (p, key, path) =>
  p.page.evaluate(
    ({ key, path, token }) =>
      new Promise((res) => {
        window.__m ??= {};
        window.__m[key] = [];
        const ws = new WebSocket(`${location.origin.replace('http', 'ws')}${path}?token=${encodeURIComponent(token)}`);
        window.__ws ??= {};
        window.__ws[key] = ws;
        ws.onmessage = (e) => window.__m[key].push(JSON.parse(e.data));
        ws.onopen = res;
      }),
    { key, path, token: p.token },
  );
const send = (p, key, msg) => p.page.evaluate(({ key, msg }) => window.__ws[key].send(JSON.stringify(msg)), { key, msg });
const msgs = (p, key) => p.page.evaluate((key) => window.__m[key], key);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const u = uniq();
  // T1-05 names: case-insensitive uniqueness breaks on Latin capital I; fullwidth look-alikes pass.
  const n1 = await person('Iris' + u);
  const n2 = await person('iris' + u);
  const n3 = await person([...('Iris' + u)].map((c) => String.fromCodePoint(c.codePointAt(0) + 0xfee0)).join(''));
  note('T1-05', n2.status === 200 || n3.status === 200, `"Iris${u}" ${n1.status}, "iris${u}" ${n2.status}, fullwidth "Ｉｒｉｓ…" ${n3.status} (expected 400 name_taken)`);

  const a = n1;
  const b = n2.status === 200 ? n2 : await person('Bee' + u);
  await open(a, 'hall', '/api/areas/hall/ws');
  await open(b, 'lib', '/api/areas/library/ws');
  await send(a, 'hall', { t: 'hello', look: { character: 0 } });
  await send(b, 'lib', { t: 'hello', look: { character: 0 } });

  // T1-04 links in the hall (links not allowed) with TLDs outside the list.
  const c = await person('Cee' + u);
  await open(c, 'hall', '/api/areas/hall/ws');
  await send(c, 'hall', { t: 'hello', look: { character: 0 } });
  await wait(500);
  const passed = [];
  for (const text of ['free stuff at evil.ru/x', 'see example.info', 'evil．com']) {
    await send(a, 'hall', { t: 'say', text });
    await wait(3200);
    if ((await msgs(c, 'hall')).some((m) => m.t === 'said' && m.text === text)) passed.push(text);
  }
  note('T1-04', passed.length > 0, `links shown in the hall: ${JSON.stringify(passed)}`);

  // T1-10 invisible / bidi-only messages are accepted.
  await send(a, 'hall', { t: 'say', text: '​​' });
  await wait(3200);
  const blank = (await msgs(c, 'hall')).some((m) => m.t === 'said' && m.text === '​​');
  note('T1-10', blank, `zero-width-only message ${blank ? 'broadcast as an empty bubble' : 'refused'}`);

  // T1-03 the friend-phone note skips the status-line filter (link, swear, 80 chars).
  await open(a, 'soc', '/api/social/ws');
  await open(b, 'soc', '/api/social/ws');
  await send(b, 'soc', { t: 'where', area: 'library' });
  const NOTE = 'visit evil.com you fucking idiot ' + 'x'.repeat(40);
  await send(a, 'soc', { t: 'where', area: 'hall', note: NOTE });
  await send(a, 'soc', { t: 'befriend', to: b.id });
  await wait(400);
  await send(b, 'soc', { t: 'befriend', to: a.id });
  await wait(400);
  await send(a, 'soc', { t: 'where', area: 'hall', note: NOTE });
  await wait(800);
  const fr = (await msgs(b, 'soc')).filter((m) => m.t === 'friends').pop();
  const shown = fr?.friends.find((f) => f.id === a.id)?.note ?? '';
  note('T1-03', shown.includes('evil.com'), `friend sees note "${shown}"`);

  // T1-06 the social socket trusts the claimed area: someone in the library shouts by saying "hall".
  await send(b, 'soc', { t: 'where', area: 'library' });
  await send(b, 'soc', { t: 'shout', text: 'from the library 1' });
  await wait(300);
  await send(b, 'soc', { t: 'where', area: 'hall' });
  for (let i = 0; i < 8; i++) await send(b, 'soc', { t: 'shout', text: `from the library ${i + 2}` });
  await wait(800);
  const heard = (await msgs(a, 'soc')).filter((m) => m.t === 'shouted' && m.line.text.startsWith('from the library')).length;
  note('T1-06', heard > 0, `${heard} building-wide shouts from a player whose area socket is in the library (8 in under a second)`);

  // T1-08 refresh mid table game: the reconnecting player forfeits at once.
  const d = await person('Dee' + u);
  const e = await person('Eee' + u);
  for (const p of [d, e]) {
    await open(p, 'sm', '/api/areas/smoking/ws');
    await send(p, 'sm', { t: 'hello', look: { character: 0 } });
  }
  await wait(400);
  for (const p of [d, e]) await send(p, 'sm', { t: 'table', kind: 'coin', action: { a: 'leave' } });
  await wait(300);
  await send(d, 'sm', { t: 'table', kind: 'coin', action: { a: 'open' } });
  await wait(300);
  await send(e, 'sm', { t: 'table', kind: 'coin', action: { a: 'open' } });
  await wait(300);
  await send(d, 'sm', { t: 'table', kind: 'coin', action: { a: 'start' } });
  await wait(300);
  await e.page.evaluate(() => window.__ws.sm.close());
  await open(e, 'sm', '/api/areas/smoking/ws');
  await send(e, 'sm', { t: 'hello', look: { character: 0 } });
  await wait(800);
  const tables = (await msgs(d, 'sm')).filter((m) => m.t === 'table' && m.kind === 'coin');
  const t = tables.pop()?.table;
  note('T1-08', t?.phase === 'over' && t.winners.includes(d.id), `after the opponent reconnects: phase ${t?.phase}, winners ${t?.winners?.length}`);
  for (const p of [d, e]) await send(p, 'sm', { t: 'table', kind: 'coin', action: { a: 'leave' } });

  // T1-12 darts: the client picks where the dart lands.
  for (const p of [d, e]) await send(p, 'sm', { t: 'table', kind: 'darts', action: { a: 'leave' } });
  await wait(300);
  await send(d, 'sm', { t: 'table', kind: 'darts', action: { a: 'open' } });
  await wait(300);
  await send(e, 'sm', { t: 'table', kind: 'darts', action: { a: 'open' } });
  await wait(300);
  await send(d, 'sm', { t: 'table', kind: 'darts', action: { a: 'start' } });
  await wait(300);
  let dt = (await msgs(d, 'sm')).filter((m) => m.t === 'table' && m.kind === 'darts').pop()?.table;
  const shooter = dt?.players[dt.turn]?.id === d.id ? d : e;
  for (let i = 0; i < 3; i++) {
    await send(shooter, 'sm', { t: 'table', kind: 'darts', action: { a: 'throw', x: 0, y: 0 } });
    await wait(200);
  }
  dt = (await msgs(d, 'sm')).filter((m) => m.t === 'table' && m.kind === 'darts').pop()?.table;
  note('T1-12', Math.max(...(dt?.scores ?? [0])) === 150, `three crafted throws score ${JSON.stringify(dt?.scores)}`);
  for (const p of [d, e]) await send(p, 'sm', { t: 'table', kind: 'darts', action: { a: 'leave' } });
  await wait(300);

  // T1-07 one character stands in several areas at once (no cross-area replace).
  const f = await person('Eff' + u);
  for (const area of ['hall', 'library', 'smoking']) {
    await open(f, `x${area}`, `/api/areas/${area}/ws`);
    await send(f, `x${area}`, { t: 'hello', look: { character: 0 } });
  }
  await wait(800);
  const inHall = (await msgs(a, 'hall')).some((m) => m.t === 'joined' && m.player.id === f.id);
  const inSmoking = (await msgs(d, 'sm')).some((m) => m.t === 'joined' && m.player.id === f.id);
  const libOpen = (await msgs(f, 'xlibrary')).some((m) => m.t === 'welcome');
  note('T1-07', inHall && inSmoking && libOpen, `same character joined hall ${inHall}, smoking ${inSmoking}, library ${libOpen} at once`);
} catch (err) {
  console.error(err);
  await browser.close();
  process.exit(2);
}
await browser.close();
process.exit(results.some(Boolean) ? 1 : 0);
