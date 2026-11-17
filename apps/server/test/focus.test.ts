import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { areaRig, fakeHub } from './support/rigs';

const MIN = 60_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-17T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const timer = (remainingMs: number, totalMs: number) => ({
  activity: 'focus',
  timer: { remainingMs, totalMs },
  dnd: false,
});

describe('focus time is measured by the server', () => {
  it('credits nothing for a forged finished timer', async () => {
    const hub = fakeHub();
    const rig = areaRig('library', hub);
    const a = await rig.join('a');
    await rig.send(a, { t: 'status', status: timer(0, 180 * MIN) });
    await rig.send(a, { t: 'finished' });
    expect(hub.recorded.filter((m) => m > 0)).toEqual([]);
  });

  it('credits nothing when the forged claim comes after some waiting', async () => {
    const hub = fakeHub();
    const rig = areaRig('library', hub);
    const a = await rig.join('a');
    await rig.send(a, { t: 'status', status: timer(180 * MIN, 180 * MIN) });
    vi.advanceTimersByTime(2 * MIN);
    await rig.send(a, { t: 'status', status: timer(0, 180 * MIN) });
    await rig.send(a, { t: 'finished' });
    expect(hub.recorded.filter((m) => m > 0)).toEqual([]);
  });

  it('credits a block that really ran', async () => {
    const hub = fakeHub();
    const rig = areaRig('library', hub);
    const a = await rig.join('a');
    await rig.send(a, { t: 'status', status: timer(25 * MIN, 25 * MIN) });
    vi.advanceTimersByTime(10 * MIN);
    // Re-sending the same timer (a status change) does not restart the clock.
    await rig.send(a, { t: 'status', status: timer(15 * MIN, 25 * MIN) });
    vi.advanceTimersByTime(15 * MIN);
    await rig.send(a, { t: 'finished' });
    expect(hub.recorded).toEqual([25]);
  });

  it('credits at most the planned length', async () => {
    const hub = fakeHub();
    const rig = areaRig('library', hub);
    const a = await rig.join('a');
    await rig.send(a, { t: 'status', status: timer(25 * MIN, 25 * MIN) });
    vi.advanceTimersByTime(25 * MIN);
    // Claims a bigger plan than it ran: the time it ran is the most that can count.
    await rig.send(a, { t: 'status', status: timer(0, 25 * MIN) });
    vi.advanceTimersByTime(40 * MIN);
    await rig.send(a, { t: 'finished' });
    expect(hub.recorded.every((m) => m <= 25)).toBe(true);
  });

  it('credits a private room but not the hall', async () => {
    for (const [area, expected] of [
      ['room3', [25]],
      ['hall', []],
      ['smoking', []],
    ] as const) {
      const hub = fakeHub();
      const rig = areaRig(area, hub);
      const a = await rig.join('a', { status: timer(25 * MIN, 25 * MIN) });
      // Timers are kept anywhere, so there must be a seat; standing still is fine for the test.
      await rig.send(a, { t: 'status', status: timer(25 * MIN, 25 * MIN) });
      vi.advanceTimersByTime(25 * MIN);
      await rig.send(a, { t: 'finished' });
      expect(
        hub.recorded.filter((m) => m > 0),
        area,
      ).toEqual(expected);
    }
  });
});
