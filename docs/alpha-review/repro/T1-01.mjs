// T1-01: a private room for 3 lets 6 people in (size is never enforced on the server).
// Exits 1 while the bug exists (more people inside than the room's size), 0 when fixed.
import { chromium, BASE, uniq } from './helpers.mjs';

const PEOPLE = 6;
const browser = await chromium.launch();
let inside = 0;
let size = 0;
try {
  // Each person: own browser context, local sign-in, a character, a game token.
  const people = [];
  for (let i = 0; i < PEOPLE; i++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${BASE}/api/auth/dev?email=t1room${i}${uniq()}@example.com`);
    const token = await page.evaluate(async (name) => {
      const post = (url, body) =>
        fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }).then((r) => r.json());
      const made = await post('/api/characters', { name, look: { character: 0 } });
      return (await post('/api/play', { id: made.id })).token;
    }, `Rm${i}${uniq()}`);
    people.push({ page, token });
  }
  // The first one opens a room for 3.
  const owner = people[0];
  const room = await owner.page.evaluate(async (token) => {
    const r = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, name: 'Tiny', size: 3 }),
    });
    return (await r.json()).room;
  }, owner.token);
  size = room.size;
  console.log(`room ${room.code}, size ${room.size}`);
  // Everyone comes in by code, as "Join by code" in the reception does.
  const seen = await Promise.all(
    people.map(({ page, token }) =>
      page.evaluate(
        async ({ token, code }) => {
          const r = await fetch(`/api/rooms/${code}/enter`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token }),
          });
          if (!r.ok) return { refused: r.status };
          const { pass } = await r.json();
          const ws = new WebSocket(
            `${location.origin.replace('http', 'ws')}/api/areas/room3/ws?token=${encodeURIComponent(token)}&room=${code}&pass=${encodeURIComponent(pass)}`,
          );
          const ids = new Set();
          let refused = null;
          ws.onmessage = (e) => {
            const m = JSON.parse(e.data);
            if (m.t === 'welcome') {
              ids.add(m.self);
              m.players.forEach((p) => ids.add(p.id));
            }
            if (m.t === 'joined') ids.add(m.player.id);
            if (m.t === 'left') ids.delete(m.id);
            if (m.t === 'error') refused = m.code;
          };
          await new Promise((res) => (ws.onopen = res));
          ws.send(JSON.stringify({ t: 'hello', look: { character: 0 } }));
          await new Promise((res) => setTimeout(res, 3000));
          return { ids: [...ids], refused };
        },
        { token, code: room.code },
      ),
    ),
  );
  inside = Math.max(...seen.map((s) => (s.ids ? s.ids.length : 0)));
  console.log(
    'each person counts inside:',
    seen.map((s) => (s.ids ? s.ids.length : `refused ${s.refused}`)).join(', '),
  );
} catch (e) {
  console.error(e);
  await browser.close();
  process.exit(2);
}
await browser.close();
const bug = inside > size;
console.log(
  bug ? `FAIL: ${inside} people inside a room for ${size}` : `PASS: at most ${size} inside`,
);
process.exit(bug ? 1 : 0);
