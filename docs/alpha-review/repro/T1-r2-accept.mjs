import {
  player,
  enter,
  connect,
  social,
  api,
  signIn,
  makeChar,
  sleep,
  uniq,
} from './T1-r2-lib.mjs';
const out = (id, bug, d) => console.log(`${bug ? 'BUG ' : 'ok  '} ${id}: ${d}`);
const profile = async (s, id) => {
  s.msgs.length = 0;
  s.j({ t: 'profile', id });
  return (await s.wait((m) => m.t === 'profile'))?.profile;
};
// J01 forged credit, in library
const a = await player('ra');
const sa = social(a);
await sa.opened;
sa.j({ t: 'where', area: 'library' });
const wl = connect(a, 'library');
await wl.opened;
wl.j({
  t: 'hello',
  look: { character: 0 },
  status: { activity: 'focus', timer: { remainingMs: 0, totalMs: 10800000 }, dnd: false },
});
await wl.wait((m) => m.t === 'welcome');
wl.j({ t: 'finished' });
await sleep(300);
wl.j({
  t: 'status',
  status: { activity: 'focus', timer: { remainingMs: 0, totalMs: 10800000 }, dnd: false },
});
await sleep(300);
wl.j({ t: 'finished' });
await sleep(800);
let pr = await profile(sa, a.id);
out(
  'J01',
  (pr?.focusMs ?? 0) > 60000,
  `forged 3h blocks -> focusMs ${pr?.focusMs}, blocks ${JSON.stringify(pr?.blocks ?? pr?.focusBlocks)}`,
);
// J02 sequential 4th
const o = await player('ro');
const room = (await api(o.cookie, '/api/rooms', 'POST', { token: o.token, name: 'Seq', size: 3 }))
  .body.room;
const ps = [o, await player('rp'), await player('rq'), await player('rr')];
const codes = [];
for (const p of ps) {
  const e = await api(p.cookie, `/api/rooms/${room.code}/enter`, 'POST', { token: p.token });
  codes.push(e.status + (e.body?.error ? ':' + e.body.error : ''));
  if (e.body?.pass) {
    const s = social(p);
    await s.opened;
    s.j({ t: 'where', area: 'room3', room: room.code });
    const w = connect(p, 'room3', `&room=${room.code}&pass=${encodeURIComponent(e.body.pass)}`);
    await w.opened.catch(() => {});
    w.j?.({ t: 'hello', look: { character: 0 } });
    await sleep(500);
  }
}
out('J02', !codes[3].startsWith('4'), `enter statuses ${codes.join(', ')}`);
// J04 password tries across 2 characters
const pw = (
  await api(o.cookie, '/api/rooms', 'POST', {
    token: o.token,
    name: 'Lock',
    size: 5,
    password: 'right-pass-1',
  })
).body.room;
const email = `rx${uniq()}@t1.test`;
const ck = await signIn(email);
const c1 = (await makeChar(ck, 'Pw' + uniq())).body.id,
  c2 = (await makeChar(ck, 'Pv' + uniq())).body.id;
const tries = [];
for (const cid of [c1, c2]) {
  const tok = (await api(ck, '/api/play', 'POST', { id: cid })).body.token;
  for (let i = 0; i < 8; i++)
    tries.push(
      (await api(ck, `/api/rooms/${pw.code}/enter`, 'POST', { token: tok, password: 'wrong' + i }))
        .status,
    );
}
out('J04', !tries.includes(429), `16 wrong tries over 2 chars: ${tries.join(',')}`);
// J06 shout after reopening phone socket; burst say
const b = await player('rb');
await enter(b, 'library');
let sb = social(b);
await sb.opened;
sb.j({ t: 'where', area: 'library' });
await sleep(300);
sb.close();
await sleep(300);
sb = social(b);
await sb.opened;
sb.j({ t: 'where', area: 'hall' });
await sleep(300);
const lis = await player('rl');
const sl = social(lis);
await sl.opened;
sl.j({ t: 'where', area: 'hall' });
await sleep(300);
sb.j({ t: 'shout', text: 'lib shout after reopen' });
await sleep(800);
out(
  'J06a',
  sl.msgs.some((m) => m.t === 'shouted'),
  `library shout after reopening phone socket heard: ${sl.msgs.some((m) => m.t === 'shouted')}; err ${JSON.stringify(sb.msgs.filter((m) => m.t === 'error'))}`,
);
const h1 = await player('rh');
const h2 = await player('ri');
const wh1 = await enter(h1, 'hall'),
  wh2 = await enter(h2, 'hall');
for (let i = 0; i < 6; i++) wh1.j({ t: 'say', text: 'burst ' + i });
await sleep(800);
const n = wh2.msgs.filter((m) => m.t === 'said').length;
out('J06b', n > 1, `6 says in a burst -> ${n} delivered`);
for (const t of ['go to evil.ru', 'evil．com', 'shop.example.store']) {
  wh1.msgs.length = 0;
  await sleep(3100);
  wh1.j({ t: 'say', text: t });
  await sleep(300);
}
out(
  'J06c',
  wh2.msgs.some((m) => m.t === 'said' && /evil|store/.test(m.text)),
  'link variants in hall',
);
// J07 report + admin view
const sh2 = social(h2);
await sh2.opened;
sh2.j({ t: 'where', area: 'hall' });
await sleep(200);
sh2.j({ t: 'report', id: h1.id, reason: 'spam', note: '<b>x</b>' });
await sleep(500);
const adm = await signIn('qa-admin@example.com');
let chars = (await api(adm, '/api/characters')).body;
let aid =
  (chars?.characters ?? chars ?? [])[0]?.id ?? (await makeChar(adm, 'Admin' + uniq())).body.id;
const atok = (await api(adm, '/api/play', 'POST', { id: aid })).body.token;
const sad = social({ token: atok, cookie: adm });
await sad.opened;
sad.j({ t: 'where', area: 'hall' });
await sleep(300);
sad.j({ t: 'reports' });
const rep = await sad.wait((m) => m.t === 'reports');
const mine = rep?.reports.find((r) => r.target.id === h1.id);
out(
  'J07',
  !mine,
  `admin sees report: ${!!mine} lines ${JSON.stringify(mine?.lines?.slice(-2))} area ${mine?.area}`,
);
// non-admin asks
sh2.msgs.length = 0;
sh2.j({ t: 'reports' });
await sleep(400);
out(
  'J07b',
  sh2.msgs.some((m) => m.t === 'reports'),
  `non-admin reports reply: ${JSON.stringify(sh2.msgs.slice(-1))}`,
);
// J08 delete h1's account
const del = await api(h1.cookie, '/api/account/delete', 'POST', { confirm: true });
const me = await api(h1.cookie, '/api/me');
const ck2 = await signIn(h1.email);
const ch = await api(ck2, '/api/characters');
const reName = await makeChar(ck2, h1.name);
sad.msgs.length = 0;
sad.j({ t: 'reports' });
const rep2 = await sad.wait((m) => m.t === 'reports');
const still = rep2?.reports.some((r) => r.target.id === h1.id);
const fr = await profile(sad, h1.id);
out(
  'J08',
  del.status !== 200 || (ch.body?.characters ?? ch.body ?? []).length > 0 || !still,
  `delete ${del.status}; old cookie /api/me ${me.status} ${JSON.stringify(me.body).slice(0, 60)}; re-signin chars ${JSON.stringify(ch.body).slice(0, 60)}; name reusable ${reName.status}; report kept ${still}; profile of deleted ${JSON.stringify(fr)?.slice(0, 60)}`,
);
process.exit(0);
