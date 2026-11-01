/**
 * Table games in the smoking room, for two to four people: darts, a dice game
 * and a guessing game. The server keeps each table and is the only one that
 * rolls or knows the secret number; everyone at the table (and around it) is
 * sent the same state. One table of each game per room.
 *
 * - darts: three darts each, the aim sways across the board; most points wins
 * - pig: roll as often as you dare, a 1 loses the turn's points; first to 50
 * - guess: a number from 1 to 100, "higher" or "lower" after each try
 */

export const TABLE_GAMES = ['darts', 'pig', 'guess'] as const;
export type TableKind = (typeof TABLE_GAMES)[number];

export const TABLE_PLAYERS = { min: 2, max: 4 } as const;
/** A turn left alone this long is played for the absent player (a miss, a hold, a pass). */
export const TURN_MS = 40_000;
export const DARTS_PER_TURN = 3;
export const PIG_GOAL = 50;
export const GUESS_RANGE = { low: 1, high: 100 } as const;

export type TableSeat = { id: string; name: string };
export type Dart = { player: number; x: number; y: number; score: number };
export type Guess = { player: number; n: number; hint: 'higher' | 'lower' | 'right' };

/** A table as everyone sees it; the secret number is never in it. */
export type Table = {
  kind: TableKind;
  phase: 'lobby' | 'playing' | 'over';
  host: string;
  players: TableSeat[];
  /** Whose turn it is, as an index into `players`. */
  turn: number;
  turnStartedAt: number;
  /** Points per player, in the order of `players`. */
  scores: number[];
  /** Darts: every dart thrown this game. */
  darts: Dart[];
  /** Pig: points gathered this turn, and the last roll (1 ends the turn). */
  pot: number;
  roll: number | null;
  /** Guess: the range still open, and the last try. */
  low: number;
  high: number;
  guess: Guess | null;
  /** Ids of the winners once the game is over (several on a tie). */
  winners: string[];
};

/** What the server keeps: the table plus what only it may know. */
export type TableRecord = { table: Table; secret: number };

export type TableAction =
  | { a: 'open' }
  | { a: 'join' }
  | { a: 'leave' }
  | { a: 'start' }
  | { a: 'throw'; x: number; y: number }
  | { a: 'roll' }
  | { a: 'hold' }
  | { a: 'guess'; n: number }
  /** Plays a turn that ran out of time; anyone at the table may ask. */
  | { a: 'nudge' };

export type TableError = 'full' | 'started' | 'not_seated' | 'not_your_turn' | 'too_few' | 'bad';

export type TableContext = {
  id: string;
  name: string;
  now: number;
  /** A random number in [0, 1); the server passes Math.random. */
  random: () => number;
};

export type TableResult = { record: TableRecord | null; error?: TableError };

/** Board numbers clockwise from the top, as on every dartboard. */
const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
/** Rings as parts of the board's radius, after a regulation board (170 mm to the double's edge). */
export const DART_RINGS = {
  bull: 0.037,
  outerBull: 0.094,
  trebleIn: 0.582,
  trebleOut: 0.629,
  doubleIn: 0.953,
} as const;

/** Points for a dart at (x, y) on a board of radius 1, y up; off the board is 0. */
export function dartScore(x: number, y: number): number {
  const r = Math.hypot(x, y);
  if (r > 1) return 0;
  if (r <= DART_RINGS.bull) return 50;
  if (r <= DART_RINGS.outerBull) return 25;
  const angle = (Math.atan2(x, y) + Math.PI / 20 + Math.PI * 2) % (Math.PI * 2);
  const number = SECTORS[Math.floor(angle / (Math.PI / 10)) % 20] ?? 0;
  if (r >= DART_RINGS.trebleIn && r <= DART_RINGS.trebleOut) return number * 3;
  if (r >= DART_RINGS.doubleIn) return number * 2;
  return number;
}

function lobby(host: TableSeat, kind: TableKind, now: number): Table {
  return {
    kind,
    phase: 'lobby',
    host: host.id,
    players: [host],
    turn: 0,
    turnStartedAt: now,
    scores: [0],
    darts: [],
    pot: 0,
    roll: null,
    low: GUESS_RANGE.low,
    high: GUESS_RANGE.high,
    guess: null,
    winners: [],
  };
}

/** Applies one person's action to a table (null when nobody has opened it yet). */
export function tableAction(
  kind: TableKind,
  record: TableRecord | null,
  action: TableAction,
  ctx: TableContext,
): TableResult {
  const me: TableSeat = { id: ctx.id, name: ctx.name };
  if (action.a === 'open') {
    if (record && record.table.phase !== 'over') {
      // Opening a table that is already set up just sits down at it.
      return tableAction(kind, record, { a: 'join' }, ctx);
    }
    return { record: { table: lobby(me, kind, ctx.now), secret: 0 } };
  }
  if (!record) return { record, error: 'bad' };
  const table = JSON.parse(JSON.stringify(record.table)) as Table;
  const next: TableRecord = { table, secret: record.secret };
  const seat = table.players.findIndex((p) => p.id === ctx.id);

  switch (action.a) {
    case 'join': {
      if (seat >= 0) return { record };
      if (table.phase !== 'lobby') return { record, error: 'started' };
      if (table.players.length >= TABLE_PLAYERS.max) return { record, error: 'full' };
      table.players.push(me);
      table.scores.push(0);
      return { record: next };
    }
    case 'leave': {
      if (seat < 0) return { record };
      table.players.splice(seat, 1);
      table.scores.splice(seat, 1);
      table.darts = table.darts
        .filter((d) => d.player !== seat)
        .map((d) => (d.player > seat ? { ...d, player: d.player - 1 } : d));
      if (table.players.length === 0) return { record: null };
      if (table.host === ctx.id) table.host = table.players[0]?.id ?? '';
      if (table.phase === 'playing') {
        if (table.players.length < TABLE_PLAYERS.min) {
          // Left alone at the table: the one who stayed wins.
          table.phase = 'over';
          table.winners = table.players.map((p) => p.id);
          return { record: next };
        }
        if (seat < table.turn) table.turn -= 1;
        if (table.turn >= table.players.length) table.turn = 0;
        table.turnStartedAt = ctx.now;
        table.pot = 0;
        table.roll = null;
      }
      return { record: next };
    }
    case 'start': {
      if (table.phase !== 'lobby') return { record, error: 'started' };
      if (seat < 0) return { record, error: 'not_seated' };
      if (table.players.length < TABLE_PLAYERS.min) return { record, error: 'too_few' };
      table.phase = 'playing';
      table.turn = 0;
      table.turnStartedAt = ctx.now;
      table.scores = table.players.map(() => 0);
      next.secret =
        GUESS_RANGE.low + Math.floor(ctx.random() * (GUESS_RANGE.high - GUESS_RANGE.low + 1));
      return { record: next };
    }
    case 'nudge': {
      if (table.phase !== 'playing') return { record };
      if (ctx.now - table.turnStartedAt < TURN_MS) return { record };
      // The turn is played for whoever wandered off.
      if (table.kind === 'darts') {
        const thrown = table.darts.filter((d) => d.player === table.turn).length;
        for (let i = thrown; i < DARTS_PER_TURN; i++) {
          table.darts.push({ player: table.turn, x: 2, y: 2, score: 0 });
        }
        endDartsTurn(table, ctx.now);
      } else if (table.kind === 'pig') {
        bankPig(table, ctx.now);
      } else {
        passTurn(table, ctx.now);
      }
      return { record: next };
    }
  }

  // Moves of the game itself.
  if (table.phase !== 'playing') return { record, error: 'bad' };
  if (seat < 0) return { record, error: 'not_seated' };
  if (seat !== table.turn) return { record, error: 'not_your_turn' };

  if (action.a === 'throw' && table.kind === 'darts') {
    const x = clamp(action.x, -2, 2);
    const y = clamp(action.y, -2, 2);
    const score = dartScore(x, y);
    table.darts.push({ player: seat, x, y, score });
    table.scores[seat] = (table.scores[seat] ?? 0) + score;
    if (table.darts.filter((d) => d.player === seat).length >= DARTS_PER_TURN) {
      endDartsTurn(table, ctx.now);
    }
    return { record: next };
  }
  if (action.a === 'roll' && table.kind === 'pig') {
    const roll = 1 + Math.floor(ctx.random() * 6);
    table.roll = roll;
    if (roll === 1) {
      table.pot = 0;
      passTurn(table, ctx.now, true);
    } else {
      table.pot += roll;
      // Reaching the goal wins at once; no need to hold.
      if ((table.scores[seat] ?? 0) + table.pot >= PIG_GOAL) bankPig(table, ctx.now);
    }
    return { record: next };
  }
  if (action.a === 'hold' && table.kind === 'pig') {
    if (table.pot === 0) return { record, error: 'bad' };
    bankPig(table, ctx.now);
    return { record: next };
  }
  if (action.a === 'guess' && table.kind === 'guess') {
    const n = Math.round(action.n);
    if (!Number.isFinite(n) || n < table.low || n > table.high) return { record, error: 'bad' };
    const secret = next.secret;
    const hint = n === secret ? 'right' : n < secret ? 'higher' : 'lower';
    table.guess = { player: seat, n, hint };
    if (hint === 'right') {
      table.scores[seat] = 1;
      table.phase = 'over';
      table.winners = [ctx.id];
      return { record: next };
    }
    if (hint === 'higher') table.low = n + 1;
    else table.high = n - 1;
    passTurn(table, ctx.now);
    return { record: next };
  }
  return { record, error: 'bad' };
}

function clamp(n: number, low: number, high: number): number {
  return Number.isFinite(n) ? Math.min(high, Math.max(low, n)) : high;
}

/** Hands the turn on; a pig roll of 1 keeps the shown roll so everyone sees why. */
function passTurn(table: Table, now: number, keepRoll = false): void {
  table.turn = (table.turn + 1) % table.players.length;
  table.turnStartedAt = now;
  table.pot = 0;
  if (!keepRoll) table.roll = null;
}

function bankPig(table: Table, now: number): void {
  const seat = table.turn;
  table.scores[seat] = (table.scores[seat] ?? 0) + table.pot;
  if ((table.scores[seat] ?? 0) >= PIG_GOAL) {
    table.phase = 'over';
    table.winners = [table.players[seat]?.id ?? ''];
    table.pot = 0;
    return;
  }
  passTurn(table, now);
}

/** After the last player's three darts, the best total wins (ties share it). */
function endDartsTurn(table: Table, now: number): void {
  if (table.turn < table.players.length - 1) {
    passTurn(table, now);
    return;
  }
  const best = Math.max(...table.scores);
  table.phase = 'over';
  table.winners = table.players.filter((_, i) => table.scores[i] === best).map((p) => p.id);
}
