import { describe, expect, it } from 'vitest';
import {
  blockCredit,
  BOOKS,
  candleCount,
  candles,
  coveredMs,
  FOCUS_LOG,
  mayLeaveBook,
  nextTableHour,
  pruneBooks,
  pruneLog,
  tableGroups,
  tableHourNow,
  tableOfSeat,
  tablesOf,
  viewBook,
  whenLeft,
  type Book,
  type FocusSpan,
} from '../src';

const MIN = 60_000;

/** A span at table 0 for character `id` of account `acct`, minutes from 0. */
function span(id: string, acct: string, from: number, to: number | null, table = 0): FocusSpan {
  return {
    seat: { x: 0, y: 0 },
    table,
    acct,
    id,
    name: id.toUpperCase(),
    top: 0,
    start: from * MIN,
    end: to === null ? null : to * MIN,
    until: (to ?? 1000) * MIN,
  };
}

describe('tables', () => {
  it('groups the library into its tables for four and desks for two', () => {
    const groups = tablesOf('library');
    expect(groups.length).toBe(7);
    const sizes = groups.map((g) => g.seats.length);
    expect(sizes).toEqual([4, 2, 4, 4, 2, 2, 2]);
    // Each chair belongs to exactly one table.
    const seats = groups.flatMap((g) => g.seats.map((s) => `${s.x},${s.y}`));
    expect(new Set(seats).size).toBe(seats.length);
  });

  it('knows the table of a chair, and nothing else', () => {
    expect(tableOfSeat('library', { x: 3, y: 6 })).toBe(tableOfSeat('library', { x: 4, y: 8 }));
    expect(tableOfSeat('library', { x: 8, y: 6 })).not.toBe(tableOfSeat('library', { x: 3, y: 6 }));
    expect(tableOfSeat('library', { x: 5, y: 5 })).toBeNull();
  });

  it('makes one table of a long run of table tiles', () => {
    const groups = tableGroups(['#######', '#SSSSS#', '#TTTTT#', '#SSSSS#', '#######']);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.seats).toHaveLength(10);
  });

  it('finds the private rooms their tables', () => {
    expect(tablesOf('room3').map((g) => g.seats.length)).toEqual([3]);
    expect(tablesOf('room9').map((g) => g.seats.length)).toEqual([5, 4]);
  });
});

describe('overlap maths', () => {
  it('counts overlapping spans once and clips to the window', () => {
    const spans = [span('a', 'A', 0, 30), span('a', 'A', 20, 40), span('a', 'A', 60, 70)];
    expect(coveredMs(spans, 10 * MIN, 65 * MIN, 100 * MIN)).toBe(35 * MIN);
  });

  it('ends an open span now, or at its timer', () => {
    const open = span('a', 'A', 0, null);
    expect(coveredMs([open], 0, 50 * MIN, 20 * MIN)).toBe(20 * MIN);
    expect(coveredMs([{ ...open, until: 10 * MIN }], 0, 50 * MIN, 20 * MIN)).toBe(10 * MIN);
  });
});

describe('shared blocks', () => {
  const who = { id: 'a', acct: 'A' };

  it('credits a table-mate who sat through 80% of the block', () => {
    const log = [span('a', 'A', 0, 50), span('b', 'B', 10, null)];
    const credit = blockCredit(log, who, 50 * MIN, 50 * MIN);
    expect(credit.seen).toBe(true);
    expect(credit.shared).toEqual(['b']);
    expect(credit.beside).toEqual(['b']);
  });

  it('does not credit one who sat through less, but still lists them beside', () => {
    const log = [span('a', 'A', 0, 50), span('b', 'B', 20, null)];
    const credit = blockCredit(log, who, 50 * MIN, 50 * MIN);
    expect(credit.shared).toEqual([]);
    expect(credit.beside).toEqual(['b']);
  });

  it('is the same whoever finishes first', () => {
    // A runs 0–50, B runs 5–55.
    const aFirst = [span('a', 'A', 0, 50), span('b', 'B', 5, null)];
    expect(blockCredit(aFirst, who, 50 * MIN, 50 * MIN).shared).toEqual(['b']);
    const bLater = [span('a', 'A', 0, 50), span('b', 'B', 5, 55)];
    expect(blockCredit(bLater, { id: 'b', acct: 'B' }, 50 * MIN, 55 * MIN).shared).toEqual(['a']);
  });

  it('counts 25 + 25 with a break against a 50', () => {
    const log = [span('a', 'A', 0, 25), span('a', 'A', 30, 55), span('b', 'B', 0, 50)];
    expect(blockCredit(log, { id: 'b', acct: 'B' }, 50 * MIN, 50 * MIN).shared).toEqual(['a']);
    // And the first 25 of the pomodoro against the running 50.
    expect(blockCredit(log, who, 25 * MIN, 25 * MIN).shared).toEqual(['b']);
  });

  it('never pairs two characters of one account', () => {
    const log = [span('a', 'A', 0, 50), span('a2', 'A', 0, null)];
    const credit = blockCredit(log, who, 50 * MIN, 50 * MIN);
    expect(credit.shared).toEqual([]);
    expect(credit.beside).toEqual([]);
  });

  it('only counts people at the same table', () => {
    const log = [span('a', 'A', 0, 50), span('b', 'B', 0, null, 1)];
    expect(blockCredit(log, who, 50 * MIN, 50 * MIN).shared).toEqual([]);
  });

  it('gives a forged timer nothing', () => {
    // The room saw only 5 of the 50 claimed minutes at a table.
    const log = [span('a', 'A', 45, 50), span('b', 'B', 0, null)];
    const credit = blockCredit(log, who, 50 * MIN, 50 * MIN);
    expect(credit).toEqual({ seen: false, shared: [], beside: [], seat: null });
    expect(blockCredit([], who, 50 * MIN, 50 * MIN).seen).toBe(false);
    expect(blockCredit(log, who, 0, 50 * MIN).seen).toBe(false);
  });
});

describe('the log and the candles', () => {
  it('drops old spans and keeps the log bounded', () => {
    const now = 10 * 60 * MIN;
    const log = [span('a', 'A', 0, 30), span('b', 'B', 580, null)];
    expect(pruneLog(log, now).map((s) => s.id)).toEqual(['b']);
    const many = Array.from({ length: FOCUS_LOG.max + 50 }, (_, i) =>
      span(`p${i}`, `P${i}`, 590, 595),
    );
    expect(pruneLog(many, now)).toHaveLength(FOCUS_LOG.max);
  });

  it('burns where people focus now, once per account', () => {
    const log = [
      span('a', 'A', 0, null),
      span('b', 'B', 0, null),
      span('c', 'C', 0, 10),
      span('d', 'D', 0, null, 1),
    ];
    const lit = candles(log, 20 * MIN);
    expect(lit.map((c) => [c.table, c.ends.length])).toEqual([
      [0, 2],
      [1, 1],
    ]);
    const first = lit[0];
    expect(first && candleCount(first, 20 * MIN)).toBe(2);
    expect(first && candleCount(first, 2000 * MIN)).toBe(0);
  });
});

describe('books left behind', () => {
  const book = (seat: { x: number; y: number }, at: number): Book => ({
    id: `${seat.x}-${at}`,
    seat,
    top: 1,
    pair: null,
    minutes: 50,
    at,
    by: 'a',
    name: 'Mia',
  });

  it('come from blocks of 15 minutes or more, one per chair per hour', () => {
    const now = 100 * MIN;
    expect(mayLeaveBook([], { x: 1, y: 1 }, 10, now)).toBe(false);
    expect(mayLeaveBook([], { x: 1, y: 1 }, 15, now)).toBe(true);
    const books = [book({ x: 1, y: 1 }, now - 30 * MIN)];
    expect(mayLeaveBook(books, { x: 1, y: 1 }, 50, now)).toBe(false);
    expect(mayLeaveBook(books, { x: 2, y: 1 }, 50, now)).toBe(true);
    expect(mayLeaveBook(books, { x: 1, y: 1 }, 50, now + 31 * MIN)).toBe(true);
  });

  it('stop at the room limit and go after 16 hours', () => {
    const now = 1000 * MIN;
    const full = Array.from({ length: BOOKS.perRoom }, (_, i) => book({ x: i, y: 0 }, now - MIN));
    expect(mayLeaveBook(full, { x: 99, y: 9 }, 50, now)).toBe(false);
    expect(pruneBooks([book({ x: 0, y: 0 }, now - BOOKS.keepMs)], now)).toEqual([]);
  });

  it('name the finisher only to friends, and hide from the blocked', () => {
    const b = book({ x: 0, y: 0 }, 0);
    const none = new Set<string>();
    expect(viewBook(b, { id: 'x', friends: none, blocked: none })?.name).toBeNull();
    expect(viewBook(b, { id: 'x', friends: new Set(['a']), blocked: none })?.name).toBe('Mia');
    expect(viewBook(b, { id: 'a', friends: none, blocked: none })).toMatchObject({
      name: 'Mia',
      mine: true,
    });
    expect(viewBook(b, { id: 'x', friends: new Set(['a']), blocked: new Set(['a']) })).toBeNull();
    expect(viewBook(b, { id: 'x', friends: none, blocked: none })).not.toHaveProperty('by');
  });

  it('say when in words, on the viewer clock', () => {
    // 01:00 UTC is 10:00 in Tokyo: this morning there, still last night in Istanbul.
    const at = Date.UTC(2026, 10, 18, 1);
    const later = Date.UTC(2026, 10, 18, 5);
    expect(whenLeft(at, later, 540)).toEqual({ day: 'today', part: 'day' });
    expect(whenLeft(at, later, 180)).toEqual({ day: 'today', part: 'night' });
    expect(whenLeft(at, Date.UTC(2026, 10, 19, 5), 540).day).toBe('yesterday');
  });
});

describe('table hours', () => {
  it('are 10:00 in Tokyo and 21:00 in Istanbul, an hour each', () => {
    const tokyo = Date.UTC(2026, 10, 18, 1);
    const istanbul = Date.UTC(2026, 10, 18, 18);
    expect(tableHourNow(tokyo)?.event.id).toBe('table-hour-tokyo');
    expect(tableHourNow(tokyo + 59 * MIN)?.start).toBe(tokyo);
    expect(tableHourNow(tokyo + 60 * MIN)).toBeNull();
    expect(tableHourNow(istanbul + 30 * MIN)?.event.id).toBe('table-hour-istanbul');
    expect(nextTableHour(tokyo + 30 * MIN)?.start).toBe(istanbul);
    expect(nextTableHour(istanbul + 30 * MIN)?.start).toBe(tokyo + 24 * 60 * MIN);
  });
});
