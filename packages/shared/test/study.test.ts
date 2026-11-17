import { describe, expect, it } from 'vitest';
import { blockStart, countsForFocus, focusMinutes } from '../src';

const MIN = 60_000;

describe('block start', () => {
  it('starts now for a first timer', () => {
    expect(blockStart(null, { endsAt: 1000 + 25 * MIN, totalMs: 25 * MIN }, 1000)).toBe(1000);
  });
  it('keeps the start of the same block sent again', () => {
    const kept = { endsAt: 25 * MIN, totalMs: 25 * MIN, startedAt: 0 };
    expect(blockStart(kept, { endsAt: 25 * MIN + 2000, totalMs: 25 * MIN }, 10 * MIN)).toBe(0);
  });
  it('restarts when the end is moved or the length changes', () => {
    const kept = { endsAt: 180 * MIN, totalMs: 180 * MIN, startedAt: 0 };
    expect(blockStart(kept, { endsAt: 2 * MIN, totalMs: 180 * MIN }, 2 * MIN)).toBe(2 * MIN);
    expect(blockStart(kept, { endsAt: 180 * MIN, totalMs: 60 * MIN }, 2 * MIN)).toBe(2 * MIN);
  });
});

describe('focus minutes', () => {
  it('is the measured time, capped at the plan', () => {
    expect(focusMinutes({ totalMs: 25 * MIN, startedAt: 0 }, 25 * MIN - 3000)).toBe(25);
    expect(focusMinutes({ totalMs: 25 * MIN, startedAt: 0 }, 90 * MIN)).toBe(25);
    expect(focusMinutes({ totalMs: 180 * MIN, startedAt: 0 }, 1000)).toBe(0);
  });
  it('is nothing for a block the server did not see start', () => {
    expect(focusMinutes({ totalMs: 25 * MIN }, 90 * MIN)).toBe(0);
  });
  it('counts only in the library and private rooms', () => {
    expect(['library', 'room3', 'room5', 'room9'].every(countsForFocus)).toBe(true);
    expect(['hall', 'smoking', 'conference'].some(countsForFocus)).toBe(false);
  });
});
