import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REPORTS_PER_HOUR } from '@att/shared';
import { areaRig, fakeHub, hubRig } from './support/rigs';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-17T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

async function rigWithPeople() {
  const rig = hubRig();
  const reporter = await rig.connect('rep', 'Reporter');
  const target = await rig.connect('tgt', 'Target');
  const admin = await rig.connect('adm', 'Admin');
  rig.sql.exec("INSERT INTO admins (id, granted_by, at) VALUES ('adm', 'owner', 0)");
  return { rig, reporter, target, admin };
}

describe('reporting a player', () => {
  it('stores reporter, target, reason, area, time and the target lines', async () => {
    const { rig, reporter } = await rigWithPeople();
    await rig.hub.placed('tgt', 'smoking');
    rig.areas.set('smoking', {
      recentLines: async (id: string) => (id === 'tgt' ? [{ text: 'you are awful', at: 5 }] : []),
    });
    // The target also shouted, and wrote to the reporter.
    rig.sql.exec(
      "INSERT INTO shouts (sender, name, text, at) VALUES ('tgt', 'Target', 'buy my stuff', 6)",
    );
    rig.sql.exec(
      "INSERT INTO messages (a, b, sender, text, at) VALUES ('rep', 'tgt', 'tgt', 'hey you', 7)",
    );
    rig.sql.exec(
      "INSERT INTO messages (a, b, sender, text, at) VALUES ('rep', 'tgt', 'rep', 'leave me alone', 8)",
    );
    await rig.send(reporter, { t: 'report', id: 'tgt', reason: 'harassment', note: 'it goes on' });
    expect(reporter.ws.of('reported')).toEqual([{ t: 'reported', id: 'tgt' }]);
    const rows = rig.sql.all('reports');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      reporter: 'rep',
      target: 'tgt',
      reason: 'harassment',
      note: 'it goes on',
      area: 'smoking',
      at: Date.now(),
    });
    const lines = JSON.parse(String(rows[0]?.['lines'])) as { kind: string; text: string }[];
    expect(lines.map((l) => [l.kind, l.text]).sort()).toEqual([
      ['dm', 'hey you'],
      ['say', 'you are awful'],
      ['shout', 'buy my stuff'],
    ]);
  });

  it('refuses a report of oneself or of someone unknown', async () => {
    const { rig, reporter } = await rigWithPeople();
    await rig.send(reporter, { t: 'report', id: 'rep', reason: 'spam' });
    await rig.send(reporter, { t: 'report', id: 'nobody', reason: 'spam' });
    expect(reporter.ws.of('error').map((e) => e['code'])).toEqual(['unknown_user', 'unknown_user']);
    expect(rig.sql.all('reports')).toEqual([]);
  });

  it('is rate-limited per reporter', async () => {
    const { rig, reporter } = await rigWithPeople();
    for (let i = 0; i < REPORTS_PER_HOUR + 2; i++) {
      await rig.send(reporter, { t: 'report', id: 'tgt', reason: 'spam' });
    }
    expect(rig.sql.all('reports')).toHaveLength(REPORTS_PER_HOUR);
    expect(reporter.ws.of('error').map((e) => e['code'])).toEqual(['rate_limited', 'rate_limited']);
    vi.advanceTimersByTime(61 * 60_000);
    await rig.send(reporter, { t: 'report', id: 'tgt', reason: 'spam' });
    expect(rig.sql.all('reports')).toHaveLength(REPORTS_PER_HOUR + 1);
  });

  it('lets only admins list the reports, newest first', async () => {
    const { rig, reporter, admin } = await rigWithPeople();
    await rig.send(reporter, { t: 'report', id: 'tgt', reason: 'spam' });
    vi.advanceTimersByTime(1000);
    await rig.send(reporter, { t: 'report', id: 'tgt', reason: 'cheating', note: 'forged hours' });
    await rig.send(reporter, { t: 'reports' });
    expect(reporter.ws.of('reports')).toEqual([]);
    expect(reporter.ws.of('error').at(-1)).toEqual({ t: 'error', code: 'forbidden' });
    await rig.send(admin, { t: 'reports' });
    const [listing] = admin.ws.of('reports') as { reports: Record<string, unknown>[] }[];
    expect(listing?.reports.map((r) => r['reason'])).toEqual(['cheating', 'spam']);
    expect(listing?.reports[0]).toMatchObject({
      reporter: { id: 'rep', name: 'Reporter' },
      target: { id: 'tgt', name: 'Target' },
      note: 'forged hours',
    });
  });

  it('the area room keeps what each person said lately', async () => {
    const rig = areaRig('smoking', fakeHub());
    const a = await rig.join('a');
    await rig.join('b');
    await rig.send(a, { t: 'say', text: 'hello there' });
    expect(await rig.room.recentLines('a')).toEqual([{ text: 'hello there', at: Date.now() }]);
    expect(await rig.room.recentLines('b')).toEqual([]);
  });
});
