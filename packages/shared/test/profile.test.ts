import { describe, expect, it } from 'vitest';
import {
  BADGES,
  blockKind,
  cleanOffset,
  earnedBadges,
  longestStreak,
  periodStarts,
  type Profile,
} from '../src';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('profile numbers', () => {
  it('sorts blocks by their length', () => {
    expect(blockKind(25)).toBe('pomodoro');
    expect(blockKind(50)).toBe('deep');
    expect(blockKind(90)).toBe('marathon');
    expect(blockKind(40)).toBe('custom');
  });

  it('starts today, the week (Monday), the month and the year on the person’s own clock', () => {
    // Wednesday 2026-11-04 01:30 in Istanbul (UTC+3) is Tuesday 22:30 UTC.
    const now = Date.UTC(2026, 10, 3, 22, 30);
    const starts = periodStarts(now, 180);
    expect(starts.today).toBe(Date.UTC(2026, 10, 3, 21, 0));
    expect(starts.week).toBe(Date.UTC(2026, 10, 1, 21, 0));
    expect(starts.month).toBe(Date.UTC(2026, 9, 31, 21, 0));
    expect(starts.year).toBe(Date.UTC(2025, 11, 31, 21, 0));
    // The same moment in UTC is still Tuesday.
    expect(periodStarts(now, 0).today).toBe(Date.UTC(2026, 10, 3));
  });

  it('finds the longest run of days', () => {
    const start = Date.UTC(2026, 0, 1, 12);
    const times = [0, 1, 2, 4, 5, 6, 7, 9].map((d) => start + d * DAY);
    expect(longestStreak([...times, start + 2 * DAY + HOUR], 0)).toBe(4);
    expect(longestStreak([], 0)).toBe(0);
  });

  it('gives badges by the numbers', () => {
    const profile: Profile = {
      id: 'a',
      name: 'A',
      role: 'user',
      joinedAt: 0,
      online: true,
      blocks: { today: 1, week: 1, month: 1, year: 1, total: 12 },
      kinds: { pomodoro: 10, deep: 0, marathon: 0, custom: 2 },
      focusMs: 0,
      timeMs: 0,
      friends: 0,
      messages: 0,
      bestStreak: 1,
    };
    expect(earnedBadges(profile).map((b) => b.id)).toEqual(['first-block', 'ten-tomatoes']);
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
  });

  it('only takes real time zone offsets', () => {
    expect(cleanOffset(180)).toBe(180);
    expect(cleanOffset(-300)).toBe(-300);
    expect(cleanOffset(9999)).toBe(0);
    expect(cleanOffset('180')).toBe(0);
  });
});
