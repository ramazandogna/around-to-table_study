import { maskProfanity } from './profanity';

/**
 * Quick games for the smoking room's round table, no board needed: each is a
 * match of short rounds, and the scoreboard is kept until someone reaches the
 * target (then "another round" starts a new match). The server is the only
 * one that flips, rolls, deals a riddle or sees hidden picks; everyone gets
 * the same table. These are the rules only; `tables.ts` seats the players.
 *
 * - rps: everyone picks rock, paper or scissors in secret; the picks show together
 * - coin: on your turn call heads or tails; a right call scores
 * - duel: everyone rolls two dice; the highest roll scores
 * - ttt: tic-tac-toe for two; a won board scores, a full board is replayed
 * - chain: say a word that starts with the last letter of the one before
 * - math: a sum appears; the first right answer scores
 * - emoji: a few emoji stand for a word or a film; the first right guess scores
 */

export const PARLOR_GAMES = ['rps', 'coin', 'duel', 'ttt', 'chain', 'math', 'emoji'] as const;
export type ParlorKind = (typeof PARLOR_GAMES)[number];

export const isParlor = (kind: string): kind is ParlorKind =>
  (PARLOR_GAMES as readonly string[]).includes(kind);

/** Points that win the match: best of three (2) or five (3) where a match is set by rounds. */
export const BEST_OF = [3, 5] as const;
export type BestOf = (typeof BEST_OF)[number];
const TARGET: Record<ParlorKind, (bestOf: BestOf) => number> = {
  rps: (b) => Math.ceil(b / 2),
  coin: () => 3,
  duel: () => 3,
  ttt: (b) => Math.ceil(b / 2),
  chain: () => 8,
  math: () => 5,
  emoji: () => 3,
};
export const parlorTarget = (kind: ParlorKind, bestOf: BestOf) => TARGET[kind](bestOf);

/** Most players at a table; tic-tac-toe is for two. */
export const parlorMax = (kind: ParlorKind) => (kind === 'ttt' ? 2 : 4);

export const RPS = ['rock', 'paper', 'scissors'] as const;
export type RpsPick = (typeof RPS)[number];
const BEATS: Record<RpsPick, RpsPick> = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
export const COIN = ['heads', 'tails'] as const;
export type CoinSide = (typeof COIN)[number];

/** Longest word in the word chain. */
export const CHAIN_MAX = 20;
export const ANSWER_MAX = 40;

/** What everyone sees of a match in progress (the table's `parlor`). */
export type ParlorState = {
  bestOf: BestOf;
  round: number;
  /** rps and duel: who has already picked or rolled this round (not what). */
  ready: boolean[];
  /** The last round as it came out, shown until the next one. */
  last: ParlorReveal | null;
  /** ttt: nine cells, '' empty, 'x' (first player) or 'o'; who starts alternates. */
  board: string[];
  starter: number;
  /** chain: the words said so far this match, the newest last. */
  words: string[];
  /** math: the sum asked; emoji: the riddle. */
  prompt: string;
};

export type ParlorReveal =
  | { kind: 'rps'; picks: (RpsPick | null)[]; winners: number[] }
  | { kind: 'coin'; player: number; call: CoinSide; side: CoinSide }
  | { kind: 'duel'; rolls: [number, number][]; winners: number[] }
  | { kind: 'ttt'; winner: number | null; line: number[] }
  | { kind: 'chain'; player: number; word: string }
  | { kind: 'chainMiss'; player: number; reason: 'letter' | 'used' | 'time' }
  | { kind: 'answer'; player: number; answer: string }
  | { kind: 'skip'; answer: string };

/** What only the server knows: hidden picks and rolls, and the answer to the prompt. */
export type ParlorHidden = {
  picks: (RpsPick | null)[];
  rolls: ([number, number] | null)[];
  answers: string[];
  /** Riddles already asked this match. */
  asked: number[];
};

export type ParlorMove =
  | { a: 'pick'; choice: string }
  | { a: 'roll' }
  | { a: 'cell'; i: number }
  | { a: 'word'; text: string }
  | { a: 'answer'; text: string };

/** The seats as the rules need them: how many, and whose turn. */
export type ParlorSeats = { count: number; turn: number };

export type ParlorOutcome = {
  state: ParlorState;
  hidden: ParlorHidden;
  /** Points to add, per seat. */
  points: number[];
  /** The turn passes to the next seat. */
  passTurn: boolean;
  error?: 'bad' | 'not_your_turn';
};

export function newParlor(
  kind: ParlorKind,
  bestOf: BestOf,
  players: number,
  random: () => number,
): { state: ParlorState; hidden: ParlorHidden } {
  const state: ParlorState = {
    bestOf,
    round: 1,
    ready: Array.from({ length: players }, () => false),
    last: null,
    board: Array.from({ length: 9 }, () => ''),
    starter: 0,
    words: [],
    prompt: '',
  };
  const hidden: ParlorHidden = {
    picks: Array.from({ length: players }, () => null),
    rolls: Array.from({ length: players }, () => null),
    answers: [],
    asked: [],
  };
  if (kind === 'math') Object.assign(hidden, dealSum(state, random));
  if (kind === 'emoji') dealRiddle(state, hidden, random);
  return { state, hidden };
}

/** Whose turn it is at the start of a match: everyone at once, or the first seat. */
export const parlorTurns = (kind: ParlorKind) =>
  kind === 'coin' || kind === 'ttt' || kind === 'chain';

/** One move at the table, by the player in `seat`. */
export function parlorMove(
  kind: ParlorKind,
  state: ParlorState,
  hidden: ParlorHidden,
  seats: ParlorSeats,
  seat: number,
  move: ParlorMove,
  random: () => number,
): ParlorOutcome {
  const next: ParlorOutcome = {
    state: copy(state),
    hidden: copy(hidden),
    points: Array.from({ length: seats.count }, () => 0),
    passTurn: false,
  };
  const bad = (error: 'bad' | 'not_your_turn' = 'bad') => ({ ...next, error });
  const s = next.state;
  const h = next.hidden;
  if (parlorTurns(kind) && seat !== seats.turn) return bad('not_your_turn');

  switch (kind) {
    case 'rps': {
      if (move.a !== 'pick' || !(RPS as readonly string[]).includes(move.choice)) return bad();
      if (h.picks[seat]) return bad();
      h.picks[seat] = move.choice as RpsPick;
      s.ready[seat] = true;
      if (h.picks.some((p) => !p)) return next;
      // Everyone picked: show them all. Exactly two kinds of pick means one beats the other.
      const picks = h.picks as RpsPick[];
      const kinds = [...new Set(picks)];
      let winners: number[] = [];
      if (kinds.length === 2) {
        const [a, b] = kinds as [RpsPick, RpsPick];
        const top = BEATS[a] === b ? a : b;
        winners = picks.flatMap((p, i) => (p === top ? [i] : []));
      }
      for (const i of winners) next.points[i] = 1;
      s.last = { kind: 'rps', picks: [...picks], winners };
      h.picks = h.picks.map(() => null);
      s.ready = s.ready.map(() => false);
      s.round += 1;
      return next;
    }
    case 'coin': {
      if (move.a !== 'pick' || !(COIN as readonly string[]).includes(move.choice)) return bad();
      const side: CoinSide = random() < 0.5 ? 'heads' : 'tails';
      const call = move.choice as CoinSide;
      if (call === side) next.points[seat] = 1;
      s.last = { kind: 'coin', player: seat, call, side };
      s.round += 1;
      next.passTurn = true;
      return next;
    }
    case 'duel': {
      if (move.a !== 'roll' || h.rolls[seat]) return bad();
      const die = () => 1 + Math.floor(random() * 6);
      h.rolls[seat] = [die(), die()];
      s.ready[seat] = true;
      if (h.rolls.some((r) => !r)) return next;
      const rolls = h.rolls as [number, number][];
      const sums = rolls.map(([a, b]) => a + b);
      const best = Math.max(...sums);
      const winners = sums.flatMap((sum, i) => (sum === best ? [i] : []));
      // A shared top roll scores nothing: roll again.
      if (winners.length === 1) next.points[winners[0] as number] = 1;
      s.last = { kind: 'duel', rolls, winners: winners.length === 1 ? winners : [] };
      h.rolls = h.rolls.map(() => null);
      s.ready = s.ready.map(() => false);
      s.round += 1;
      return next;
    }
    case 'ttt': {
      if (move.a !== 'cell' || !Number.isInteger(move.i) || move.i < 0 || move.i > 8) return bad();
      if (s.board[move.i]) return bad();
      // The starter of the board plays x.
      s.board[move.i] = seat === s.starter ? 'x' : 'o';
      const line = winningLine(s.board);
      if (line) {
        next.points[seat] = 1;
        s.last = { kind: 'ttt', winner: seat, line };
      } else if (s.board.every(Boolean)) {
        s.last = { kind: 'ttt', winner: null, line: [] };
      } else {
        next.passTurn = true;
        return next;
      }
      // A new board, started by the other player.
      s.board = s.board.map(() => '');
      s.starter = (s.starter + 1) % seats.count;
      s.round += 1;
      next.passTurn = seats.turn !== s.starter;
      return next;
    }
    case 'chain': {
      if (move.a !== 'word') return bad();
      const word = cleanWord(move.text);
      if (!word) return bad();
      const previous = s.words[s.words.length - 1];
      if (previous && !chains(previous, word)) {
        s.last = { kind: 'chainMiss', player: seat, reason: 'letter' };
        return next;
      }
      if (s.words.includes(word)) {
        s.last = { kind: 'chainMiss', player: seat, reason: 'used' };
        return next;
      }
      s.words = [...s.words, word].slice(-30);
      next.points[seat] = 1;
      s.last = { kind: 'chain', player: seat, word };
      next.passTurn = true;
      return next;
    }
    case 'math':
    case 'emoji': {
      if (move.a !== 'answer') return bad();
      const answer = foldAnswer(move.text);
      if (!answer || !h.answers.some((a) => foldAnswer(a) === answer)) return next;
      next.points[seat] = 1;
      s.last = { kind: 'answer', player: seat, answer: move.text.trim().slice(0, ANSWER_MAX) };
      s.round += 1;
      if (kind === 'math') Object.assign(h, dealSum(s, random));
      else dealRiddle(s, h, random);
      return next;
    }
  }
}

/**
 * A turn or round left too long: the coin and the chain pass the turn on
 * (a missed word), tic-tac-toe plays nothing and passes, a riddle or a sum
 * is shown and replaced, and missing picks and rolls are made at random.
 */
export function parlorTimeout(
  kind: ParlorKind,
  state: ParlorState,
  hidden: ParlorHidden,
  seats: ParlorSeats,
  random: () => number,
): ParlorOutcome {
  const base: ParlorOutcome = {
    state: copy(state),
    hidden: copy(hidden),
    points: Array.from({ length: seats.count }, () => 0),
    passTurn: false,
  };
  switch (kind) {
    case 'rps': {
      let out = base;
      for (let i = 0; i < seats.count; i++) {
        if (out.hidden.picks[i]) continue;
        const pick = RPS[Math.floor(random() * 3)] as RpsPick;
        const step = parlorMove(
          kind,
          out.state,
          out.hidden,
          seats,
          i,
          { a: 'pick', choice: pick },
          random,
        );
        out = { ...step, points: out.points.map((p, j) => p + (step.points[j] ?? 0)) };
      }
      return out;
    }
    case 'duel': {
      let out = base;
      for (let i = 0; i < seats.count; i++) {
        if (out.hidden.rolls[i]) continue;
        const step = parlorMove(kind, out.state, out.hidden, seats, i, { a: 'roll' }, random);
        out = { ...step, points: out.points.map((p, j) => p + (step.points[j] ?? 0)) };
      }
      return out;
    }
    case 'chain':
      base.state.last = { kind: 'chainMiss', player: seats.turn, reason: 'time' };
      return { ...base, passTurn: true };
    case 'coin':
    case 'ttt':
      return { ...base, passTurn: true };
    case 'math':
    case 'emoji': {
      base.state.last = { kind: 'skip', answer: base.hidden.answers[0] ?? '' };
      base.state.round += 1;
      if (kind === 'math') Object.assign(base.hidden, dealSum(base.state, random));
      else dealRiddle(base.state, base.hidden, random);
      return base;
    }
  }
}

/** A seat left the table: the hidden picks follow the seats. */
export function parlorLeave(state: ParlorState, hidden: ParlorHidden, seat: number): void {
  state.ready.splice(seat, 1);
  hidden.picks.splice(seat, 1);
  hidden.rolls.splice(seat, 1);
}

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function winningLine(board: readonly string[]): number[] | null {
  return (
    LINES.find(([a, b, c]) => {
      const mark = board[a as number];
      return !!mark && mark === board[b as number] && mark === board[c as number];
    }) ?? null
  );
}

/** A word for the chain: letters only, lower-case (Turkish-aware), and no swear. */
export function cleanWord(text: string): string | null {
  const word = text.trim().toLocaleLowerCase('tr');
  if (!/^\p{L}{2,}$/u.test(word) || word.length > CHAIN_MAX) return null;
  return maskProfanity(word).masked ? null : word;
}

/** Whether `next` starts with the last letter of `previous` (a soft ğ also allows g). */
export function chains(previous: string, next: string): boolean {
  const last = previous[previous.length - 1] ?? '';
  const first = next[0] ?? '';
  return first === last || (last === 'ğ' && first === 'g');
}

/** An answer as compared: lower-case plain letters and digits, Turkish letters folded. */
export function foldAnswer(text: string): string {
  const fold: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a' };
  return [...text.trim().toLocaleLowerCase('tr').normalize('NFC')]
    .map((ch) => fold[ch] ?? ch)
    .join('')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9-]/g, '');
}

/** A new sum, harder as the match goes on: answers are whole numbers. */
function dealSum(state: ParlorState, random: () => number): Pick<ParlorHidden, 'answers'> {
  const pick = (low: number, high: number) => low + Math.floor(random() * (high - low + 1));
  const hard = state.round > 3;
  const op = ['+', '−', '×'][Math.floor(random() * 3)];
  let a: number;
  let b: number;
  let answer: number;
  if (op === '×') {
    a = pick(2, hard ? 15 : 9);
    b = pick(2, hard ? 12 : 9);
    answer = a * b;
  } else if (op === '−') {
    a = pick(20, hard ? 150 : 99);
    b = pick(2, a);
    answer = a - b;
  } else {
    a = pick(10, hard ? 250 : 99);
    b = pick(10, hard ? 250 : 99);
    answer = a + b;
  }
  state.prompt = `${a} ${op} ${b} = ?`;
  return { answers: [String(answer)] };
}

/** Emoji riddles; any of the answers counts, in English or Turkish. */
export const RIDDLES: readonly { emoji: string; answers: readonly string[] }[] = [
  { emoji: '☀️🕶️', answers: ['sunglasses', 'güneş gözlüğü', 'gunes gozlugu'] },
  { emoji: '⭐🐟', answers: ['starfish', 'denizyıldızı', 'deniz yıldızı'] },
  { emoji: '⛄', answers: ['snowman', 'kardan adam'] },
  { emoji: '📚🐛', answers: ['bookworm', 'kitap kurdu'] },
  { emoji: '🧈🪰', answers: ['butterfly', 'kelebek'] },
  { emoji: '☕⏸️', answers: ['coffee break', 'kahve molası'] },
  { emoji: '🎂🕯️', answers: ['birthday', 'doğum günü', 'birthday cake', 'doğum günü pastası'] },
  { emoji: '🌍🔥', answers: ['global warming', 'küresel ısınma'] },
  { emoji: '💡🧠', answers: ['idea', 'fikir', 'brainstorm', 'beyin fırtınası'] },
  { emoji: '🦷🪥', answers: ['toothbrush', 'diş fırçası'] },
  { emoji: '🌧️☂️', answers: ['umbrella', 'şemsiye'] },
  { emoji: '👑🦁', answers: ['the lion king', 'lion king', 'aslan kral'] },
  { emoji: '🕷️🧑', answers: ['spiderman', 'spider-man', 'örümcek adam'] },
  { emoji: '❄️👸', answers: ['frozen', 'karlar ülkesi'] },
  { emoji: '🧙💍', answers: ['lord of the rings', 'the lord of the rings', 'yüzüklerin efendisi'] },
  { emoji: '🚢🧊', answers: ['titanic'] },
  { emoji: '🦇🧑', answers: ['batman', 'yarasa adam'] },
  { emoji: '🐝🏠', answers: ['beehive', 'hive', 'arı kovanı', 'kovan'] },
  { emoji: '🍿🎬', answers: ['movie', 'cinema', 'film', 'sinema'] },
  { emoji: '🔥🚒', answers: ['fire truck', 'fire engine', 'itfaiye', 'itfaiye aracı'] },
  { emoji: '🌙🚶', answers: ['moonwalk', 'ay yürüyüşü'] },
  { emoji: '🏠🔑', answers: ['house key', 'key', 'ev anahtarı', 'anahtar'] },
  { emoji: '🎓📜', answers: ['diploma', 'graduation', 'mezuniyet'] },
  { emoji: '🌊🏄', answers: ['surfing', 'surf', 'sörf'] },
  { emoji: '🐓🥚', answers: ['chicken and egg', 'tavuk yumurta', 'tavuk ve yumurta'] },
  { emoji: '🍎👨‍🔬⬇️', answers: ['gravity', 'newton', 'yerçekimi', 'yer çekimi'] },
  { emoji: '🐼🥋', answers: ['kung fu panda'] },
  { emoji: '🧛🩸', answers: ['dracula', 'vampire', 'vampir', 'drakula'] },
  { emoji: '🏰👸🐸', answers: ['the frog prince', 'frog prince', 'kurbağa prens'] },
  { emoji: '🌹🐻', answers: ['beauty and the beast', 'güzel ve çirkin'] },
  { emoji: '⏰🔁', answers: ['groundhog day', 'alarm', 'snooze', 'erteleme'] },
  { emoji: '🍕🇮🇹', answers: ['pizza'] },
  { emoji: '🥶🏔️', answers: ['ice age', 'buz devri'] },
  { emoji: '🐠🔍', answers: ['finding nemo', 'kayıp balık nemo', 'nemo'] },
];

function dealRiddle(state: ParlorState, hidden: ParlorHidden, random: () => number): void {
  let left = RIDDLES.map((_, i) => i).filter((i) => !hidden.asked.includes(i));
  if (left.length === 0) {
    hidden.asked = [];
    left = RIDDLES.map((_, i) => i);
  }
  const index = left[Math.floor(random() * left.length)] ?? 0;
  const riddle = RIDDLES[index];
  hidden.asked.push(index);
  hidden.answers = [...(riddle?.answers ?? [])];
  state.prompt = riddle?.emoji ?? '❓';
}

/** A deep copy of plain data (shared code runs where structuredClone may be missing). */
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
