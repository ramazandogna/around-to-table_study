import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { areaRig, fakeHub, type Client } from './support/rigs';

const MIN = 60_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-17T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const timer = (remainingMs: number, totalMs: number) => ({
  activity: 'focus',
  timer: { remainingMs, totalMs },
  dnd: false,
});
/** Two chairs of the library's first table for four, and one of another table. */
const SEAT_A = { x: 3, y: 6 };
const SEAT_B = { x: 4, y: 6 };
const OTHER_TABLE = { x: 8, y: 6 };

/** Lets the room's awaited calls to the hub (the reward, the book) run. */
const settle = () => vi.advanceTimersByTimeAsync(0);

async function sitAndFocus(
  rig: ReturnType<typeof areaRig>,
  who: Client,
  seat: { x: number; y: number },
  minutes: number,
) {
  await rig.send(who, { t: 'move', to: seat });
  await rig.send(who, { t: 'status', status: timer(minutes * MIN, minutes * MIN) });
}

describe('the table candle and shared blocks', () => {
  it('lights for two at one table, and both get a shared block whoever finishes first', async () => {
    const hub = fakeHub();
    const rig = areaRig('library', hub);
    const a = await rig.join('a');
    const b = await rig.join('b');
    await sitAndFocus(rig, a, SEAT_A, 25);
    vi.advanceTimersByTime(2 * MIN);
    await sitAndFocus(rig, b, SEAT_B, 25);
    const candles = a.ws.of('candles').at(-1)?.['candles'] as { table: number; ends: number[] }[];
    expect(candles).toHaveLength(1);
    expect(candles[0]?.ends).toHaveLength(2);

    vi.advanceTimersByTime(23 * MIN);
    await rig.send(a, { t: 'finished' });
    await settle();
    vi.advanceTimersByTime(2 * MIN);
    await rig.send(b, { t: 'finished' });
    await settle();
    expect(hub.shared).toEqual({ a: [true], b: [true] });
    const reward = a.ws.of('reward')[0]?.['reward'] as { shared: boolean; mates: unknown[] };
    expect(reward.shared).toBe(true);
    // Not friends: counted, not named.
    expect(reward.mates).toEqual([{ id: 'b', name: null }]);
  });

  it('never pairs two characters of one account', async () => {
    const hub = fakeHub();
    const rig = areaRig('library', hub);
    const a = await rig.join('a', {}, 'acct');
    const b = await rig.join('b', {}, 'acct');
    await sitAndFocus(rig, a, SEAT_A, 25);
    await sitAndFocus(rig, b, SEAT_B, 25);
    vi.advanceTimersByTime(25 * MIN);
    await rig.send(a, { t: 'finished' });
    await settle();
    expect(hub.shared['a']).toEqual([false]);
  });

  it('does not count someone at another table', async () => {
    const hub = fakeHub();
    const rig = areaRig('library', hub);
    const a = await rig.join('a');
    const b = await rig.join('b');
    await sitAndFocus(rig, a, SEAT_A, 25);
    await sitAndFocus(rig, b, OTHER_TABLE, 25);
    vi.advanceTimersByTime(25 * MIN);
    await rig.send(a, { t: 'finished' });
    await settle();
    expect(hub.shared['a']).toEqual([false]);
  });

  it('gives a forged timer no shared block and no book', async () => {
    const hub = fakeHub();
    const rig = areaRig('library', hub);
    const a = await rig.join('a');
    const b = await rig.join('b');
    await sitAndFocus(rig, b, SEAT_B, 60);
    await rig.send(a, { t: 'move', to: SEAT_A });
    // Claims a 50-minute block that is all but over.
    await rig.send(a, { t: 'status', status: timer(1000, 50 * MIN) });
    vi.advanceTimersByTime(2000);
    await rig.send(a, { t: 'finished' });
    await settle();
    expect(hub.shared['a'] ?? []).toEqual([]);
    expect(b.ws.of('book')).toEqual([]);
  });
});

describe('books left behind', () => {
  it('a block of 15 minutes leaves a book, named only for friends', async () => {
    const hub = fakeHub({
      circleOf: async (id: string) => ({ friends: id === 'b' ? ['a'] : [], blocked: [] }),
    });
    const rig = areaRig('library', hub);
    const a = await rig.join('a');
    const b = await rig.join('b');
    const c = await rig.join('c');
    await sitAndFocus(rig, a, SEAT_A, 15);
    vi.advanceTimersByTime(15 * MIN);
    await rig.send(a, { t: 'finished' });
    await settle();
    const seen = (who: Client) => who.ws.of('book')[0]?.['book'] as Record<string, unknown>;
    expect(seen(a)).toMatchObject({ seat: SEAT_A, minutes: 15, name: 'a', mine: true });
    expect(seen(b)).toMatchObject({ name: 'a', mine: false });
    expect(seen(c)).toMatchObject({ name: null, mine: false });
    expect(seen(c)).not.toHaveProperty('by');
    // And it is there for someone coming in later, in the welcome.
    const d = await rig.join('d');
    const welcome = d.ws.of('welcome')[0] as { books: unknown[] };
    expect(welcome.books).toHaveLength(1);
  });

  it('a short block leaves none, and one chair gets one book an hour', async () => {
    const rig = areaRig('library', fakeHub());
    const a = await rig.join('a');
    await sitAndFocus(rig, a, SEAT_A, 10);
    vi.advanceTimersByTime(10 * MIN);
    await rig.send(a, { t: 'finished' });
    await settle();
    expect(a.ws.of('book')).toHaveLength(0);
    await rig.send(a, { t: 'status', status: timer(20 * MIN, 20 * MIN) });
    vi.advanceTimersByTime(20 * MIN);
    await rig.send(a, { t: 'finished' });
    await settle();
    await rig.send(a, { t: 'status', status: timer(20 * MIN, 20 * MIN) });
    vi.advanceTimersByTime(20 * MIN);
    await rig.send(a, { t: 'finished' });
    await settle();
    expect(a.ws.of('book')).toHaveLength(1);
  });
});

describe('the reward card', () => {
  it('comes again after a reconnect until it is seen', async () => {
    const rig = areaRig('library', fakeHub());
    const a = await rig.join('a');
    await sitAndFocus(rig, a, SEAT_A, 25);
    vi.advanceTimersByTime(25 * MIN);
    await rig.send(a, { t: 'finished' });
    await settle();
    expect(a.ws.of('reward')).toHaveLength(1);
    const again = await rig.join('a');
    await settle();
    expect(again.ws.of('reward')).toHaveLength(1);
    await rig.send(again, { t: 'rewardSeen' });
    await settle();
    const third = await rig.join('a');
    await settle();
    expect(third.ws.of('reward')).toHaveLength(0);
  });
});
