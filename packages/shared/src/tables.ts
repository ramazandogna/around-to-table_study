import {
  BEST_OF,
  isParlor,
  newParlor,
  parlorLeave,
  parlorMax,
  parlorMove,
  parlorTarget,
  parlorTimeout,
  parlorTurns,
  PARLOR_GAMES,
  type BestOf,
  type ParlorHidden,
  type ParlorOutcome,
  type ParlorKind,
  type ParlorState,
} from './parlor';

/**
 * Table games in the smoking room, for two to four people: darts, a dice game
 * and a guessing game. The server keeps each table and is the only one that
 * rolls or knows the secret number; everyone at the table (and around it) is
 * sent the same state. One table of each game per room.
 *
 * - darts: three darts each, the aim sways across the board; most points wins
 *   (or, alone, a practice round for a score)
 * - pig: roll as often as you dare, a 1 loses the turn's points; first to 50
 * - guess: a number from 1 to 100, "higher" or "lower" after each try
 * - and the quick games of `parlor.ts` (rock-paper-scissors, coin, dice duel,
 *   tic-tac-toe, word chain, quick math, emoji riddles), scored to a target
 */

export const TABLE_GAMES = ['darts', 'pig', 'guess', ...PARLOR_GAMES] as const;
export type TableKind = (typeof TABLE_GAMES)[number];

export const TABLE_PLAYERS = { min: 2, max: 4 } as const;

/** Darts can be played alone, for practice; the other games need company. */
export function minPlayers(kind: TableKind): number {
  return kind === 'darts' ? 1 : TABLE_PLAYERS.min;
}

/** Most players at one table: four, or two for tic-tac-toe. */
export function maxPlayers(kind: TableKind): number {
  return isParlor(kind) ? parlorMax(kind) : TABLE_PLAYERS.max;
}
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
  /** The quick games: the match as everyone sees it (null for darts, pig and guess). */
  parlor?: ParlorState | null;
  /** The quick games set by rounds: best of three or five (picked in the lobby). */
  bestOf?: BestOf;
};

/** What the server keeps: the table plus what only it may know. */
export type TableRecord = { table: Table; secret: number; hidden?: ParlorHidden };

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
  | { a: 'nudge' }
  /** In the lobby: how long the match runs, best of three or five. */
  | { a: 'bestOf'; n: number }
  | { a: 'pick'; choice: string }
  | { a: 'cell'; i: number }
  | { a: 'word'; text: string }
  | { a: 'answer'; text: string };

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
    parlor: null,
    bestOf: 3,
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
  if (record.hidden) next.hidden = JSON.parse(JSON.stringify(record.hidden)) as ParlorHidden;
  const seat = table.players.findIndex((p) => p.id === ctx.id);

  switch (action.a) {
    case 'join': {
      if (seat >= 0) return { record };
      if (table.phase !== 'lobby') return { record, error: 'started' };
      if (table.players.length >= maxPlayers(kind)) return { record, error: 'full' };
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
      if (table.parlor && next.hidden) parlorLeave(table.parlor, next.hidden, seat);
      if (table.phase === 'playing') {
        if (table.players.length < minPlayers(table.kind)) {
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
      if (table.players.length < minPlayers(kind)) return { record, error: 'too_few' };
      table.phase = 'playing';
      table.turn = 0;
      table.turnStartedAt = ctx.now;
      table.scores = table.players.map(() => 0);
      next.secret =
        GUESS_RANGE.low + Math.floor(ctx.random() * (GUESS_RANGE.high - GUESS_RANGE.low + 1));
      if (isParlor(kind)) {
        const match = newParlor(kind, table.bestOf ?? 3, table.players.length, ctx.random);
        table.parlor = match.state;
        next.hidden = match.hidden;
        table.winners = [];
      }
      return { record: next };
    }
    case 'bestOf': {
      if (table.phase !== 'lobby' || seat < 0) return { record, error: 'bad' };
      if (!(BEST_OF as readonly number[]).includes(action.n)) return { record, error: 'bad' };
      table.bestOf = action.n as BestOf;
      return { record: next };
    }
    case 'nudge': {
      if (table.phase !== 'playing') return { record };
      if (ctx.now - table.turnStartedAt < TURN_MS) return { record };
      // The turn is played for whoever wandered off.
      if (isParlor(kind) && table.parlor && next.hidden) {
        const seats = { count: table.players.length, turn: table.turn };
        applyParlor(
          kind,
          next,
          parlorTimeout(kind, table.parlor, next.hidden, seats, ctx.random),
          ctx.now,
        );
      } else if (table.kind === 'darts') {
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
  if (isParlor(kind)) {
    if (!table.parlor || !next.hidden) return { record, error: 'bad' };
    if (
      action.a !== 'pick' &&
      action.a !== 'roll' &&
      action.a !== 'cell' &&
      action.a !== 'word' &&
      action.a !== 'answer'
    )
      return { record, error: 'bad' };
    const seats = { count: table.players.length, turn: table.turn };
    const outcome = parlorMove(kind, table.parlor, next.hidden, seats, seat, action, ctx.random);
    if (outcome.error) return { record, error: outcome.error };
    applyParlor(kind, next, outcome, ctx.now);
    return { record: next };
  }
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

/**
 * A quick game's move or timeout on the table: points onto the scoreboard,
 * the turn passed on (or the round clock restarted), and the match over once
 * someone reaches the target.
 */
function applyParlor(
  kind: ParlorKind,
  record: TableRecord,
  outcome: ParlorOutcome,
  now: number,
): void {
  const table = record.table;
  const round = table.parlor?.round;
  table.parlor = outcome.state;
  record.hidden = outcome.hidden;
  outcome.points.forEach((p, i) => (table.scores[i] = (table.scores[i] ?? 0) + p));
  if (outcome.passTurn) {
    table.turn = (table.turn + 1) % table.players.length;
    table.turnStartedAt = now;
  } else if (!parlorTurns(kind) && outcome.state.round !== round) {
    table.turnStartedAt = now;
  } else if (kind === 'ttt' && outcome.state.round !== round) {
    // A finished board: whoever starts the new one plays.
    table.turn = outcome.state.starter;
    table.turnStartedAt = now;
  }
  const target = parlorTarget(kind, table.bestOf ?? 3);
  const best = Math.max(...table.scores);
  if (best >= target) {
    table.phase = 'over';
    table.winners = table.players.filter((_, i) => table.scores[i] === best).map((p) => p.id);
  }
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
