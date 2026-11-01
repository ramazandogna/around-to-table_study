import { describe, expect, it } from 'vitest';
import { chance, inShift, onDuty } from '../src';

describe('staff shifts', () => {
  it('puts the day librarian on from 9 to 15 and the evening one until 22', () => {
    expect(onDuty('library', 9)).toBe('librarianDay');
    expect(onDuty('library', 14.99)).toBe('librarianDay');
    expect(onDuty('library', 15)).toBe('librarianEvening');
    expect(onDuty('library', 21.5)).toBe('librarianEvening');
  });

  it('leaves the library desk empty at night, but never the reception', () => {
    expect(onDuty('library', 23)).toBeNull();
    expect(onDuty('library', 3)).toBeNull();
    expect(onDuty('library', 8.9)).toBeNull();
    for (let hour = 0; hour < 24; hour += 0.5) expect(onDuty('hall', hour)).not.toBeNull();
    expect(onDuty('hall', 2)).toBe('receptionNight');
    expect(onDuty('hall', 12)).toBe('receptionDay');
  });

  it('has nobody working in the smoking room', () => {
    expect(onDuty('smoking', 12)).toBeNull();
  });

  it('reads shifts that run past midnight', () => {
    expect(inShift({ from: 19, to: 7 }, 23)).toBe(true);
    expect(inShift({ from: 19, to: 7 }, 6.5)).toBe(true);
    expect(inShift({ from: 19, to: 7 }, 7)).toBe(false);
  });

  it('gives the same random for the same seed, spread over [0, 1)', () => {
    expect(chance(42)).toBe(chance(42));
    const values = Array.from({ length: 200 }, (_, i) => chance(i));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    expect(new Set(values.map((v) => Math.floor(v * 4))).size).toBe(4);
  });
});
