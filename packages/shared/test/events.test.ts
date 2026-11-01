import { describe, expect, it } from 'vitest';
import { EVENTS, eventNow, upcoming } from '../src';

// Thursday 2026-11-05, 21:00 in Japan is 12:00 UTC.
const start = Date.UTC(2026, 10, 5, 12, 0);
const minute = 60_000;

describe('the Thursday meetup', () => {
  it('is on in the smoking room from 21:00 to 23:00 Japan time', () => {
    expect(eventNow('smoking', start - minute)).toBeNull();
    expect(eventNow('smoking', start)?.event.id).toBe('thursday-meetup');
    expect(eventNow('smoking', start + 119 * minute)?.start).toBe(start);
    expect(eventNow('smoking', start + 120 * minute)).toBeNull();
  });

  it('is only in the smoking room', () => {
    expect(eventNow('hall', start + minute)).toBeNull();
    expect(eventNow('library', start + minute)).toBeNull();
  });

  it('comes back every week', () => {
    expect(eventNow('smoking', start + 7 * 24 * 60 * minute + 5 * minute)?.start).toBe(
      start + 7 * 24 * 60 * minute,
    );
    expect(eventNow('smoking', start + 24 * 60 * minute)).toBeNull();
  });

  it('lists what is coming, soonest first, including one under way', () => {
    const now = start + 30 * minute;
    const next = upcoming(now, 10);
    expect(next.map((o) => o.start)).toEqual([start, start + 7 * 24 * 60 * minute]);
    expect(upcoming(start - 3 * 24 * 60 * minute, 2)).toEqual([]);
  });

  it('has no special days yet', () => {
    expect(EVENTS).toHaveLength(1);
  });
});
