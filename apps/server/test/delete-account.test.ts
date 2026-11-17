import { describe, expect, it } from 'vitest';
import { hubRig } from './support/rigs';

const LOOK = { character: 0 };

/** Two accounts with two characters each, with a row about them in every table there is. */
async function seeded() {
  const rig = hubRig();
  const { hub, sql } = rig;
  const accountA = (await hub.signIn({ sub: 'g-a', email: 'a@example.com', name: 'Ann' })) ?? '';
  const accountB = (await hub.signIn({ sub: 'g-b', email: 'b@example.com', name: 'Bob' })) ?? '';
  await hub.createSession(accountA, 'session-a1', 'ua', 60_000);
  await hub.createSession(accountA, 'session-a2', 'ua', 60_000);
  await hub.createSession(accountB, 'session-b1', 'ua', 60_000);
  const a1 = (await hub.createCharacter(accountA, 'Ann One', LOOK)) as { id: string };
  const a2 = (await hub.createCharacter(accountA, 'Ann Two', LOOK)) as { id: string };
  const b1 = (await hub.createCharacter(accountB, 'Bob One', LOOK)) as { id: string };
  const room = await hub.createRoom(a1.id, 'Ann room', 5, null);
  const bobsRoom = await hub.createRoom(b1.id, 'Bob room', 5, null);
  const now = Date.now();
  for (const [id, name] of [
    [a1.id, 'Ann One'],
    [a2.id, 'Ann Two'],
    [b1.id, 'Bob One'],
  ] as const) {
    sql.exec(
      'INSERT OR IGNORE INTO users (id, name, seen_at, created_at) VALUES (?, ?, ?, ?)',
      id,
      name,
      now,
      now,
    );
  }
  sql.exec(
    'INSERT INTO friends (a, b, accepted, requested_by, created_at) VALUES (?, ?, 1, ?, ?)',
    a1.id,
    b1.id,
    a1.id,
    now,
  );
  sql.exec(
    'INSERT INTO messages (a, b, sender, text, at) VALUES (?, ?, ?, ?, ?)',
    a1.id,
    b1.id,
    b1.id,
    'hi Ann',
    now,
  );
  sql.exec(
    'INSERT INTO messages (a, b, sender, text, at) VALUES (?, ?, ?, ?, ?)',
    a1.id,
    b1.id,
    a1.id,
    'hi Bob',
    now,
  );
  sql.exec('INSERT INTO blocks (blocker, blocked, at) VALUES (?, ?, ?)', a2.id, b1.id, now);
  sql.exec('INSERT INTO blocks (blocker, blocked, at) VALUES (?, ?, ?)', b1.id, a1.id, now);
  sql.exec('INSERT INTO focus_blocks (user, minutes, at) VALUES (?, 25, ?)', a1.id, now);
  sql.exec('INSERT INTO focus_blocks (user, minutes, at) VALUES (?, 25, ?)', b1.id, now);
  sql.exec("INSERT INTO admins (id, granted_by, at) VALUES (?, 'owner', ?)", a2.id, now);
  sql.exec(
    "INSERT INTO events (id, title, description, area, start, minutes, by, by_name, status) VALUES ('e1', 'Quiet hour', '', 'library', ?, 60, ?, 'Ann One', 'approved')",
    now,
    a1.id,
  );
  sql.exec(
    'INSERT INTO shouts (sender, name, text, at) VALUES (?, ?, ?, ?)',
    a1.id,
    'Ann One',
    'hello all',
    now,
  );
  sql.exec(
    'INSERT INTO shouts (sender, name, text, at) VALUES (?, ?, ?, ?)',
    b1.id,
    'Bob One',
    'hello too',
    now,
  );
  sql.exec('INSERT INTO room_bans (code, user) VALUES (?, ?)', bobsRoom?.code, a1.id);
  sql.exec('INSERT INTO room_bans (code, user) VALUES (?, ?)', room?.code, b1.id);
  sql.exec('INSERT INTO places (id, area, at) VALUES (?, ?, ?)', a1.id, 'hall', now);
  sql.exec('INSERT INTO places (id, area, at) VALUES (?, ?, ?)', b1.id, 'hall', now);
  const report =
    'INSERT INTO reports (reporter, target, reason, note, area, lines, at, target_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
  // Ann filed one about Bob, Bob filed one about Ann, and Bob filed one about a third person.
  sql.exec(report, a1.id, b1.id, 'spam', 'ann says', null, '[]', now, 'Bob One');
  sql.exec(
    report,
    b1.id,
    a2.id,
    'spam',
    'evidence',
    null,
    '[{"kind":"say","text":"rude words","at":1}]',
    now,
    'Ann Two',
  );
  sql.exec(report, b1.id, 'third', 'spam', 'kept', null, '[]', now, 'Third');
  sql.exec(
    'INSERT INTO tries (key, until, count) VALUES (?, ?, 3)',
    `acct:${accountA}`,
    now + 60_000,
  );
  sql.exec(
    'INSERT INTO tries (key, until, count) VALUES (?, ?, 3)',
    `report:${a1.id}`,
    now + 60_000,
  );
  sql.exec(
    'INSERT INTO tries (key, until, count) VALUES (?, ?, 3)',
    `room:${bobsRoom?.code}:${accountA}`,
    now + 60_000,
  );
  sql.exec(
    'INSERT INTO tries (key, until, count) VALUES (?, ?, 3)',
    `acct:${accountB}`,
    now + 60_000,
  );
  await hub.takePresence(accountA, a1.id);
  await hub.takePresence(accountB, b1.id);
  return { rig, accountA, accountB, a1: a1.id, a2: a2.id, b1: b1.id };
}

/** Every table with its rows, found from the database itself so a new table cannot be forgotten. */
function dump(rig: Awaited<ReturnType<typeof seeded>>['rig']): Map<string, string> {
  const tables = rig.sql
    .all('sqlite_master')
    .filter((t) => t['type'] === 'table' && !String(t['name']).startsWith('sqlite_'))
    .map((t) => String(t['name']));
  return new Map(tables.map((name) => [name, JSON.stringify(rig.sql.all(name))]));
}

describe('delete my account', () => {
  it('leaves nothing of the account or its characters in any table', async () => {
    const { rig, accountA, a1, a2 } = await seeded();
    const ids = await rig.hub.deleteAccount(accountA);
    expect([...(ids ?? [])].sort()).toEqual([a1, a2].sort());
    for (const [table, rows] of dump(rig)) {
      // Reports about the account stay as evidence, with the name and lines as they were.
      if (table === 'reports') continue;
      for (const secret of [
        accountA,
        a1,
        a2,
        'g-a',
        'a@example.com',
        'Ann One',
        'Ann Two',
        'session-a1',
        'session-a2',
      ]) {
        expect(rows, `${table} still holds ${secret}`).not.toContain(secret);
      }
    }
  });

  it('keeps everyone else, and rows of others that never named the account', async () => {
    const { rig, accountB, a2, b1 } = await seeded();
    const accountA = String(rig.sql.all('accounts').find((r) => r['google_sub'] === 'g-a')?.['id']);
    await rig.hub.deleteAccount(accountA);
    const rows = dump(rig);
    expect(rows.get('accounts')).toContain(accountB);
    expect(rows.get('accounts')).toContain('g-b');
    expect(rows.get('sessions')).toContain('session-b1');
    expect(rows.get('characters')).toContain(b1);
    expect(rows.get('shouts')).toContain('hello too');
    expect(rows.get('focus_blocks')).toContain(b1);
    expect(rows.get('presence')).toContain(accountB);
    expect(rows.get('tries')).toContain(`acct:${accountB}`);
    // Bob's report about himself names nobody of Ann's.
    expect(rows.get('reports')).toContain('kept');
    // The reports about Ann stay for moderation, with her name and what was said; the report she
    // filed stays too, without the link to her.
    const reports = rig.sql.all('reports');
    expect(reports.map((r) => r['reporter']).sort()).toEqual(['', b1, b1]);
    expect(reports.find((r) => r['note'] === 'evidence')).toMatchObject({
      target: a2,
      target_name: 'Ann Two',
    });
    expect(String(reports.find((r) => r['note'] === 'evidence')?.['lines'])).toContain(
      'rude words',
    );
    expect(JSON.stringify(reports)).not.toContain(accountA);
    // Bob's own room survives; its ban list loses Ann.
    expect(rows.get('rooms')).toContain('Bob room');
    expect(rows.get('room_bans')).not.toContain(accountA);
  });

  it('ends the sessions: the cookie finds no account any more', async () => {
    const { rig, accountA } = await seeded();
    expect(await rig.hub.sessionAccount('session-a1', 60_000)).not.toBeNull();
    await rig.hub.deleteAccount(accountA);
    expect(await rig.hub.sessionAccount('session-a1', 60_000)).toBeNull();
    expect(await rig.hub.sessionAccount('session-a2', 60_000)).toBeNull();
    expect(await rig.hub.sessionAccount('session-b1', 60_000)).not.toBeNull();
  });

  it('sends the characters out of the building and tells their friends the friendship is gone', async () => {
    const { rig, accountA, a1, b1 } = await seeded();
    const ann = await rig.connect(a1, 'Ann One');
    const bob = await rig.connect(b1, 'Bob One');
    await rig.send(bob, { t: 'where', area: 'hall' });
    bob.ws.sent.length = 0;
    await rig.hub.deleteAccount(accountA);
    expect(ann.ws.closed).toBe(true);
    const lists = bob.ws.of('friends') as { friends: { id: string }[] }[];
    expect(lists.length).toBeGreaterThan(0);
    expect(lists.at(-1)?.friends.map((f) => f.id)).not.toContain(a1);
  });

  it('does nothing for an account that is not there', async () => {
    const { rig } = await seeded();
    const before = dump(rig);
    expect(await rig.hub.deleteAccount('no-such-account')).toBeNull();
    expect(dump(rig)).toEqual(before);
  });
});
