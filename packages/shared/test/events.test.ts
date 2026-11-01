import { describe, expect, it } from 'vitest';
import { checkProposal, EVENTS, eventNow, upcoming, type ProposedEvent } from '../src';

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

describe('proposed events', () => {
  const now = Date.UTC(2026, 10, 1, 12);
  const proposal = {
    title: 'Exam marathon',
    description: '',
    area: 'library' as const,
    start: now + 60 * 60 * 1000,
    minutes: 120,
  };

  it('checks a proposal', () => {
    expect(checkProposal(proposal, now)).toBeNull();
    expect(checkProposal({ ...proposal, title: 'x' }, now)).toBe('title');
    expect(checkProposal({ ...proposal, start: now - 1 }, now)).toBe('time');
    expect(checkProposal({ ...proposal, start: now + 90 * 24 * 60 * 60 * 1000 }, now)).toBe('time');
    expect(checkProposal({ ...proposal, minutes: 5 }, now)).toBe('length');
    expect(checkProposal({ ...proposal, area: 'room3' as never }, now)).toBe('area');
  });

  it('puts only approved ones on the calendar and in the room', () => {
    const base: ProposedEvent = { ...proposal, id: 'e1', by: 'a', byName: 'A', status: 'approved' };
    const pending: ProposedEvent = { ...base, id: 'e2', status: 'pending' };
    const list = upcoming(now, 3, EVENTS, [base, pending]);
    expect(list.some((o) => o.event === base)).toBe(true);
    expect(list.some((o) => o.event === pending)).toBe(false);
    expect(eventNow('library', base.start + 1000, EVENTS, [base])?.event).toBe(base);
    expect(eventNow('library', base.start + 121 * 60 * 1000, EVENTS, [base])).toBeNull();
  });
});
