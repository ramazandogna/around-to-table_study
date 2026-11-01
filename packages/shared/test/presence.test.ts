import { describe, expect, it } from 'vitest';
import {
  clampRhythm,
  FINISH_GRACE_MS,
  isStale,
  MAX_TIMER_MS,
  parseClientMessage,
  PLAN_RHYTHMS,
  quartersDone,
  STALE_MS,
} from '../src';

describe('presence', () => {
  it('keeps a socket that answers its heartbeat', () => {
    expect(isStale(1_000_000, 0, 1_000_000 - 30_000)).toBe(false);
  });

  it('drops a socket that went quiet', () => {
    expect(isStale(1_000_000, 0, 1_000_000 - STALE_MS - 1)).toBe(true);
  });

  it('gives a new socket time for its first heartbeat', () => {
    expect(isStale(1_000_000, 1_000_000 - 5_000, null)).toBe(false);
    expect(isStale(1_000_000, 1_000_000 - STALE_MS - 1, null)).toBe(true);
  });
});

describe('study quarters', () => {
  const total = 40 * 60_000;
  it.each([
    [total, 0],
    [total * 0.76, 0],
    [total * 0.75, 1],
    [total * 0.5, 2],
    [total * 0.25, 3],
    [1, 3],
    [0, 4],
  ])('with %s ms left, %s quarters are done', (remainingMs, quarters) => {
    expect(quartersDone({ totalMs: total, remainingMs })).toBe(quarters);
  });

  it('lets a finish be claimed with a moment of grace', () => {
    expect(FINISH_GRACE_MS).toBeGreaterThan(0);
    expect(parseClientMessage(JSON.stringify({ t: 'finished' }))).toEqual({ t: 'finished' });
  });
});

describe('study rhythms', () => {
  it('keeps a custom rhythm on whole steps inside the limits', () => {
    expect(clampRhythm({ workMinutes: 2, breakMinutes: 7, rounds: 20 })).toEqual({
      workMinutes: 5,
      breakMinutes: 5,
      rounds: 8,
    });
    expect(clampRhythm({ workMinutes: 999, breakMinutes: -3, rounds: 0 })).toEqual({
      workMinutes: 180,
      breakMinutes: 0,
      rounds: 1,
    });
  });

  it('fits every preset inside the longest timer', () => {
    for (const rhythm of Object.values(PLAN_RHYTHMS)) {
      expect(rhythm.workMinutes * 60_000).toBeLessThanOrEqual(MAX_TIMER_MS);
    }
  });
});
