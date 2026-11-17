import { player, enter, social, api, signIn, makeChar, sleep, uniq } from './T1-r2-lib.mjs';
const h1 = await player('rh');
const h2 = await player('ri');
const s1 = social(h1),
  s2 = social(h2);
await Promise.all([s1.opened, s2.opened]);
s1.j({ t: 'where', area: 'hall' });
s2.j({ t: 'where', area: 'hall' });
const w1 = await enter(h1, 'hall');
await enter(h2, 'hall');
await sleep(300);
w1.j({ t: 'say', text: 'rude line for evidence' });
s1.j({ t: 'shout', text: 'shout evidence' });
await sleep(500);
s2.j({ t: 'report', id: h1.id, reason: 'harassment', note: '<script>x</script>' });
await sleep(800);
console.log(
  'reporter got',
  JSON.stringify(s2.msgs.filter((m) => ['reported', 'error'].includes(m.t))),
);
for (let i = 0; i < 12; i++) s2.j({ t: 'report', id: h1.id, reason: 'spam' });
await sleep(800);
console.log(
  'burst: reported',
  s2.msgs.filter((m) => m.t === 'reported').length,
  'rate_limited',
  s2.msgs.filter((m) => m.code === 'rate_limited').length,
);
s2.msgs.length = 0;
s2.j({ t: 'reports' });
await sleep(400);
console.log('non-admin:', JSON.stringify(s2.msgs.filter((m) => m.t !== 'world')));
const adm = await signIn('qa-admin@example.com');
const list = (await api(adm, '/api/characters')).body;
const aid = (list.characters ?? list)[0]?.id ?? (await makeChar(adm, 'Admin' + uniq())).body.id;
const atok = (await api(adm, '/api/play', 'POST', { id: aid })).body.token;
const sa = social({ token: atok, cookie: adm });
await sa.opened;
sa.j({ t: 'where', area: 'hall' });
await sleep(300);
const get = async () => {
  sa.msgs.length = 0;
  sa.j({ t: 'reports' });
  return (await sa.wait((m) => m.t === 'reports' || m.t === 'error'))?.reports?.filter(
    (r) => r.target.id === h1.id,
  );
};
const r = await get();
console.log('admin sees', r?.length, JSON.stringify(r?.[r.length - 1]).slice(0, 400));
const del = await api(h1.cookie, '/api/account/delete', 'POST', { confirm: true });
console.log('delete', del.status);
const noConfirm = await api(h2.cookie, '/api/account/delete', 'POST', {});
console.log('delete without confirm', noConfirm.status);
const r2 = await get();
console.log('after delete admin sees', r2?.length, JSON.stringify(r2?.[0]?.target));
const ck = await signIn(h1.email);
console.log(
  're-signin characters',
  JSON.stringify((await api(ck, '/api/characters')).body).slice(0, 100),
);
s2.msgs.length = 0;
s2.j({ t: 'find', q: h1.name });
await sleep(500);
console.log(
  'find deleted name',
  JSON.stringify(s2.msgs.filter((m) => m.t === 'found')).slice(0, 200),
);
console.log('old socket closed?', s1.readyState, w1.readyState);
process.exit(0);
