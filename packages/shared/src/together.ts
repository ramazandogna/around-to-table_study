import { eventNow, upcoming, type Occurrence, type WeeklyEvent } from './events';
import type { Profile } from './profile';
import { dayPhase, type DayPhase } from './time';
import { AREAS, AreaGrid, TILE, type AreaId, type Point } from './world';

/**
 * Studying together, made visible: which chairs share a table, the log of who
 * focused where (kept by each room), the candle that burns while two or more
 * people at one table run a timer, the "shared block" a finished block earns
 * when a table-mate focused through most of it, the books finished blocks
 * leave on the table, and the two daily table hours.
 */

/* ---------- Tables ---------- */

/** One table (a run of `T` tiles that touch) and the chairs facing it. */
export type TableGroup = {
  /** Its place in the room's list, the same on every screen. */
  index: number;
  tables: readonly Point[];
  seats: readonly Point[];
};

const SIDES: readonly Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const key = (p: Point) => `${p.x},${p.y}`;

/**
 * The tables in a layout: table tiles that touch are one table (a long
 * library table, a table for four, a desk for two), and each chair belongs to
 * the table it faces. Read from top-left, so the order never changes.
 */
export function tableGroups(layout: readonly string[]): TableGroup[] {
  const grid = new AreaGrid({
    id: 'hall',
    layout,
    doors: {},
    spawn: { x: 0, y: 0 },
    renovation: null,
    rugs: [],
  });
  const owner = new Map<string, number>();
  const groups: { tables: Point[]; seats: Point[] }[] = [];
  layout.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c !== TILE.table || owner.has(key({ x, y }))) return;
      const index = groups.length;
      const tables: Point[] = [];
      const queue: Point[] = [{ x, y }];
      owner.set(key({ x, y }), index);
      while (queue.length > 0) {
        const tile = queue.shift() as Point;
        tables.push(tile);
        for (const d of SIDES) {
          const next = { x: tile.x + d.x, y: tile.y + d.y };
          if (grid.tileAt(next) !== TILE.table || owner.has(key(next))) continue;
          owner.set(key(next), index);
          queue.push(next);
        }
      }
      groups.push({ tables, seats: [] });
    }),
  );
  layout.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c !== TILE.seat) return;
      const facing = grid.seatFacing({ x, y });
      const index = facing ? owner.get(key({ x: x + facing.x, y: y + facing.y })) : undefined;
      if (index !== undefined) groups[index]?.seats.push({ x, y });
    }),
  );
  return groups.map((group, index) => ({ index, ...group }));
}

const groupCache = new Map<AreaId, TableGroup[]>();

/** The tables of one area (worked out once). */
export function tablesOf(area: AreaId): TableGroup[] {
  let groups = groupCache.get(area);
  if (!groups) {
    groups = tableGroups(AREAS[area].layout);
    groupCache.set(area, groups);
  }
  return groups;
}

/** Which table a chair belongs to, or null for anything else. */
export function tableOfSeat(area: AreaId, seat: Point): number | null {
  return (
    tablesOf(area).find((g) => g.seats.some((s) => s.x === seat.x && s.y === seat.y))?.index ?? null
  );
}

/* ---------- The focus log ---------- */

/**
 * A stretch of focus at one chair: someone sat there with a timer running.
 * `end` is null while it goes on; it can last no longer than `until`, the
 * timer's own end, in case the person vanishes without a word.
 */
export type FocusSpan = {
  seat: Point;
  table: number;
  /** The account behind the character: two characters of one person never count as a pair. */
  acct: string;
  /** The character, its name and top colour (for the reward card and a pair of books, after they left). */
  id: string;
  name: string;
  top: number;
  start: number;
  end: number | null;
  until: number;
};

export const FOCUS_LOG = {
  /** As long as the longest timer, and a little more for the break around it. */
  keepMs: 3.5 * 60 * 60 * 1000,
  /** A room never keeps more than this many spans; the oldest go first. */
  max: 400,
} as const;

/** Where a span really ended, or ends by now. */
export function spanEnd(span: FocusSpan, now: number): number {
  return Math.min(span.end ?? now, span.until, now);
}

/** How long, in all, some spans cover between `from` and `to` (overlaps counted once). */
export function coveredMs(
  spans: readonly FocusSpan[],
  from: number,
  to: number,
  now: number,
): number {
  const pieces = spans
    .map((s) => [Math.max(s.start, from), Math.min(spanEnd(s, now), to)] as const)
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let reached = -Infinity;
  for (const [a, b] of pieces) {
    const start = Math.max(a, reached);
    if (b > start) total += b - start;
    reached = Math.max(reached, b);
  }
  return total;
}

/** Old spans out, and no more than `FOCUS_LOG.max` kept. */
export function pruneLog(log: readonly FocusSpan[], now: number): FocusSpan[] {
  const kept = log.filter((s) => spanEnd(s, now) >= now - FOCUS_LOG.keepMs);
  return kept.slice(Math.max(0, kept.length - FOCUS_LOG.max));
}

/** A finished block counts as shared when a table-mate focused through this much of it. */
export const SHARED_SHARE = 0.8;
/** Someone who focused through this much of it "studied beside you". */
export const BESIDE_SHARE = 0.25;

export type BlockCredit = {
  /** The room saw the finisher focus at a table through most of the block. */
  seen: boolean;
  /** Table-mates (characters of other accounts) who focused through 80% of it. */
  shared: string[];
  /** Table-mates who focused through at least a quarter of it, the shared ones too. */
  beside: string[];
  /** The chair the finisher sat at last, for the book. */
  seat: Point | null;
};

const NO_CREDIT: BlockCredit = { seen: false, shared: [], beside: [], seat: null };

/**
 * What a finished block earns, from the room's log alone. The block is the
 * `totalMs` before `now`. A timer the room did not see running at a table
 * (forged, or started elsewhere) earns nothing here. Whoever finishes first,
 * each finisher is weighed against the others' focus over their own block,
 * so two people sitting through the same hour both get it.
 */
export function blockCredit(
  log: readonly FocusSpan[],
  finisher: { id: string; acct: string },
  totalMs: number,
  now: number,
): BlockCredit {
  if (!(totalMs > 0)) return NO_CREDIT;
  const from = now - totalMs;
  const own = log.filter((s) => s.id === finisher.id && spanEnd(s, now) > from);
  if (coveredMs(own, from, now, now) < SHARED_SHARE * totalMs) return NO_CREDIT;
  const last = own.reduce((a, b) => (spanEnd(b, now) >= spanEnd(a, now) ? b : a));
  // Only the tables the finisher sat at during the block, and only other people.
  const tables = new Set(own.map((s) => s.table));
  const byMate = new Map<string, FocusSpan[]>();
  for (const span of log) {
    if (span.acct === finisher.acct || span.id === finisher.id || !tables.has(span.table)) continue;
    byMate.set(span.id, [...(byMate.get(span.id) ?? []), span]);
  }
  const shared: string[] = [];
  const beside: string[] = [];
  for (const [id, spans] of byMate) {
    const share = coveredMs(spans, from, now, now) / totalMs;
    if (share >= SHARED_SHARE) shared.push(id);
    if (share >= BESIDE_SHARE) beside.push(id);
  }
  return { seen: true, shared, beside, seat: last.seat };
}

/* ---------- Candles ---------- */

/**
 * A table's candle as the room sends it: when each person focusing there
 * stops at the latest. Screens count the ones still ahead of the server's
 * clock, so a timer that runs out puts its part of the flame out without a message.
 */
export type Candle = { table: number; ends: number[] };

/** Two people focusing at one table light its candle. */
export const CANDLE_LIT_AT = 2;

/** Every table where someone focuses now (one entry per account, its latest end). */
export function candles(log: readonly FocusSpan[], now: number): Candle[] {
  const byTable = new Map<number, Map<string, number>>();
  for (const span of log) {
    if (span.end !== null || span.until <= now) continue;
    const people = byTable.get(span.table) ?? new Map<string, number>();
    people.set(span.acct, Math.max(people.get(span.acct) ?? 0, span.until));
    byTable.set(span.table, people);
  }
  return [...byTable]
    .map(([table, people]) => ({ table, ends: [...people.values()].sort((a, b) => a - b) }))
    .sort((a, b) => a.table - b.table);
}

/** How many still focus at a candle's table now. */
export function candleCount(candle: Candle, now: number): number {
  return candle.ends.filter((end) => end > now).length;
}

/* ---------- Books left behind ---------- */

/** A closed book left on the table where a block was finished. */
export type Book = {
  id: string;
  seat: Point;
  /** The finisher's top colour (an index into the top palette; -1 for the look as drawn). */
  top: number;
  /** A shared block leaves two: the table-mate's top colour. */
  pair: number | null;
  minutes: number;
  at: number;
  /** Who left it; never sent to anyone else. */
  by: string;
  name: string;
};

/** A book as one viewer gets it: the name only for the finisher's friends (and the finisher). */
export type BookView = Omit<Book, 'by' | 'name'> & { name: string | null; mine: boolean };

export const BOOKS = {
  /** Shorter blocks leave nothing. */
  minMinutes: 15,
  /** One book per chair per hour. */
  perSeatMs: 60 * 60 * 1000,
  /** A room never holds more than this many in a day. */
  perRoom: 80,
  /** They stay for a day's worth of hours, the same for every time zone. */
  keepMs: 16 * 60 * 60 * 1000,
} as const;

export function pruneBooks(books: readonly Book[], now: number): Book[] {
  return books.filter((b) => now - b.at < BOOKS.keepMs);
}

/** Whether a finished block of `minutes` at `seat` may leave a book now. */
export function mayLeaveBook(
  books: readonly Book[],
  seat: Point,
  minutes: number,
  now: number,
): boolean {
  if (minutes < BOOKS.minMinutes) return false;
  const live = pruneBooks(books, now);
  if (live.filter((b) => now - b.at < 24 * 60 * 60 * 1000).length >= BOOKS.perRoom) return false;
  return !live.some(
    (b) => b.seat.x === seat.x && b.seat.y === seat.y && now - b.at < BOOKS.perSeatMs,
  );
}

/**
 * What one viewer sees of a book: nothing when either blocked the other, the
 * name only when they are friends (or it is their own); others see "someone".
 */
export function viewBook(
  book: Book,
  viewer: { id: string; friends: ReadonlySet<string>; blocked: ReadonlySet<string> },
): BookView | null {
  if (viewer.blocked.has(book.by)) return null;
  const mine = book.by === viewer.id;
  return {
    id: book.id,
    seat: book.seat,
    top: book.top,
    pair: book.pair,
    minutes: book.minutes,
    at: book.at,
    mine,
    name: mine || viewer.friends.has(book.by) ? book.name : null,
  };
}

/**
 * When a book was left, in words that need no clock: this morning, last
 * night, yesterday afternoon. `offset` is the viewer's minutes ahead of UTC.
 */
export function whenLeft(
  at: number,
  now: number,
  offset: number,
): { day: 'today' | 'yesterday'; part: DayPhase } {
  const local = (t: number) => t + offset * 60_000;
  const DAY = 24 * 60 * 60 * 1000;
  const day = Math.floor(local(at) / DAY) === Math.floor(local(now) / DAY) ? 'today' : 'yesterday';
  const hour = (((local(at) % DAY) + DAY) % DAY) / 3_600_000;
  return { day, part: dayPhase(hour) };
}

/* ---------- The reward for a finished block ---------- */

/** What the finisher is told when a block ends: kept by the room until seen. */
export type Reward = {
  minutes: number;
  /** A table-mate focused through most of it: the candle was shared. */
  shared: boolean;
  /** Who studied beside them; names only of friends (null otherwise). */
  mates: { id: string; name: string | null }[];
  at: number;
  /** The profile before and after this block, to tell what it just earned. */
  before: Profile | null;
  after: Profile | null;
};

/* ---------- Table hours ---------- */

/**
 * Two fixed hours a day when people are asked to come and study together:
 * lunchtime in Tokyo and the evening in Istanbul. They run on the clock alone,
 * like the weekly meetup, so every screen agrees.
 */
export const TABLE_HOURS = [
  { id: 'table-hour-tokyo', hour: 10, utcOffset: 9 * 60 },
  { id: 'table-hour-istanbul', hour: 21, utcOffset: 3 * 60 },
] as const;

export const TABLE_HOUR_MINUTES = 60;

/** The table hours as weekly events, one for each day, for the calendar's arithmetic. */
export const TABLE_HOUR_EVENTS: readonly WeeklyEvent[] = TABLE_HOURS.flatMap((slot) =>
  [0, 1, 2, 3, 4, 5, 6].map((weekday): WeeklyEvent => ({
    id: slot.id,
    area: 'library',
    theme: 'meetup',
    weekday,
    hour: slot.hour,
    minute: 0,
    minutes: TABLE_HOUR_MINUTES,
    utcOffset: slot.utcOffset,
  })),
);

/** The table hour on now, if any. */
export function tableHourNow(now: number): Occurrence | null {
  return eventNow('library', now, TABLE_HOUR_EVENTS);
}

/** The next table hour to start (not the one on now). */
export function nextTableHour(now: number): Occurrence | null {
  return upcoming(now, 2, TABLE_HOUR_EVENTS).find((o) => o.start > now) ?? null;
}
