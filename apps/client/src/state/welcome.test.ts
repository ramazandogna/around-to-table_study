import { describe, expect, it } from 'vitest';
import { mergeSeen } from '../net/account';
import type { Stats } from './stats';
import { welcomeLine } from './welcome';

const NOW = new Date(2026, 10, 17, 12).getTime();
const stats = (over: Partial<Stats> = {}): Stats => ({
  day: '2026-11-17',
  focusMs: 0,
  blocks: 0,
  streak: 0,
  lastDay: null,
  ...over,
});

describe('welcomeLine', () => {
  it('says nothing on a first visit', () => {
    expect(welcomeLine(stats(), false, NOW)).toBeNull();
  });

  it('recaps yesterday and the streak in one line', () => {
    const line = welcomeLine(
      stats({ streak: 3, prev: { day: '2026-11-16', focusMs: 25 * 60_000 } }),
      true,
      NOW,
    );
    expect(line).toBe('Welcome back · 25m yesterday · streak 3');
  });

  it('names an older day as the last time, and drops what is missing', () => {
    expect(
      welcomeLine(stats({ prev: { day: '2026-11-10', focusMs: 40 * 60_000 } }), true, NOW),
    ).toBe('Welcome back · 40m last time');
    expect(welcomeLine(stats(), true, NOW)).toBe('Welcome back');
  });

  it('counts today when the player studied and came back', () => {
    expect(welcomeLine(stats({ focusMs: 30 * 60_000, streak: 1 }), true, NOW)).toBe(
      'Welcome back · 30m today · streak 1',
    );
  });
});

describe('mergeSeen', () => {
  it('keeps every room tip seen on either side', () => {
    const merged = JSON.parse(
      mergeSeen('att.coach', '{"hall":true}', '{"library":true}'),
    ) as object;
    expect(merged).toEqual({ hall: true, library: true });
  });

  it('keeps the intro flag', () => {
    expect(mergeSeen('att.intro', null, 'true')).toBe('true');
  });
});
