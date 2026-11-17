import { describe, expect, it } from 'vitest';
import { liveStreak, streakAfterStudying, todayStats, type Stats } from './stats';

const at = (day: string) => new Date(`${day}T12:00:00`).getTime();
const saved = (over: Partial<Stats>): Stats => ({
  day: '2026-11-10',
  focusMs: 30 * 60_000,
  blocks: 1,
  streak: 2,
  lastDay: '2026-11-10',
  ...over,
});

describe('gentle streaks', () => {
  it('a day in a row adds one, as before', () => {
    expect(streakAfterStudying(saved({}), '2026-11-11')).toEqual({ streak: 3, rest: [] });
  });

  it('survives two missed days', () => {
    expect(streakAfterStudying(saved({}), '2026-11-13')).toEqual({
      streak: 3,
      rest: ['2026-11-11', '2026-11-12'],
    });
  });

  it('three missed days in a row end it', () => {
    expect(streakAfterStudying(saved({}), '2026-11-14')).toEqual({ streak: 1, rest: [] });
  });

  it('counts rest days over a rolling week, not per gap', () => {
    // Two rest days (11th, 12th), studied on the 13th, then one more missed day inside the same week.
    const afterGap = streakAfterStudying(saved({}), '2026-11-13');
    const next = saved({
      streak: afterGap.streak,
      rest: afterGap.rest,
      lastDay: '2026-11-13',
      day: '2026-11-13',
    });
    expect(streakAfterStudying(next, '2026-11-15')).toEqual({ streak: 1, rest: [] });
    // Rest days older than a week no longer count against the streak.
    const later = saved({ streak: 7, rest: ['2026-11-11', '2026-11-12'], lastDay: '2026-11-17' });
    expect(streakAfterStudying(later, '2026-11-20').streak).toBe(8);
  });

  it('shows the streak while it can still be kept, and 0 once it cannot', () => {
    expect(liveStreak(saved({}), '2026-11-10')).toBe(2);
    expect(liveStreak(saved({}), '2026-11-12')).toBe(2);
    expect(liveStreak(saved({}), '2026-11-13')).toBe(2);
    expect(liveStreak(saved({}), '2026-11-14')).toBe(0);
    expect(liveStreak(null, '2026-11-14')).toBe(0);
  });

  it('todayStats follows the same rule on a new day', () => {
    expect(todayStats(at('2026-11-12'), saved({})).streak).toBe(2);
    expect(todayStats(at('2026-11-20'), saved({})).streak).toBe(0);
  });
});
