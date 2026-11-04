import { describe, expect, it } from 'vitest';
import {
  chains,
  cleanWord,
  foldAnswer,
  RIDDLES,
  tableAction,
  winningLine,
  type TableAction,
  type TableKind,
  type TableRecord,
} from '../src';

/** A random that returns the given numbers in turn, then 0 (starting a table draws one first). */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++] ?? 0;
};

/** Opens a table for `ids`, starts it and returns a function to play moves as anyone. */
function match(kind: TableKind, ids: string[], random = sequence(), bestOf?: number) {
  let now = 1000;
  let record: TableRecord | null = null;
  const act = (id: string, action: TableAction) => {
    now += 10;
    const result = tableAction(kind, record, action, { id, name: id, now, random });
    record = result.record;
    return result.error;
  };
  ids.forEach((id, i) => act(id, { a: i === 0 ? 'open' : 'join' }));
  if (bestOf) act(ids[0] as string, { a: 'bestOf', n: bestOf });
  act(ids[0] as string, { a: 'start' });
  return {
    act,
    get table() {
      return (record as TableRecord | null)?.table;
    },
    get record() {
      return record;
    },
    advance: (ms: number) => (now += ms),
  };
}

describe('rock, paper, scissors', () => {
  it('shows the picks only when both picked, and keeps score to best of three', () => {
    const game = match('rps', ['a', 'b']);
    game.act('a', { a: 'pick', choice: 'rock' });
    // The table shows that a picked, never what.
    expect(game.table?.parlor?.ready).toEqual([true, false]);
    expect(JSON.stringify(game.table)).not.toContain('rock');
    game.act('b', { a: 'pick', choice: 'scissors' });
    expect(game.table?.parlor?.last).toEqual({
      kind: 'rps',
      picks: ['rock', 'scissors'],
      winners: [0],
    });
    expect(game.table?.scores).toEqual([1, 0]);
    // A draw scores nothing.
    game.act('a', { a: 'pick', choice: 'paper' });
    game.act('b', { a: 'pick', choice: 'paper' });
    expect(game.table?.scores).toEqual([1, 0]);
    game.act('a', { a: 'pick', choice: 'paper' });
    game.act('b', { a: 'pick', choice: 'rock' });
    expect(game.table?.phase).toBe('over');
    expect(game.table?.winners).toEqual(['a']);
  });

  it('plays best of five when the table chose it, and refuses odd picks', () => {
    const game = match('rps', ['a', 'b'], sequence(), 5);
    expect(game.table?.bestOf).toBe(5);
    expect(game.act('a', { a: 'pick', choice: 'lizard' })).toBe('bad');
    for (let i = 0; i < 2; i++) {
      game.act('a', { a: 'pick', choice: 'rock' });
      game.act('b', { a: 'pick', choice: 'scissors' });
    }
    expect(game.table?.phase).toBe('playing');
    game.act('a', { a: 'pick', choice: 'rock' });
    game.act('b', { a: 'pick', choice: 'scissors' });
    expect(game.table?.phase).toBe('over');
  });

  it('with three players, two kinds of pick decide; all three is a draw', () => {
    const game = match('rps', ['a', 'b', 'c']);
    game.act('a', { a: 'pick', choice: 'rock' });
    game.act('b', { a: 'pick', choice: 'paper' });
    game.act('c', { a: 'pick', choice: 'scissors' });
    expect(game.table?.scores).toEqual([0, 0, 0]);
    game.act('a', { a: 'pick', choice: 'paper' });
    game.act('b', { a: 'pick', choice: 'paper' });
    game.act('c', { a: 'pick', choice: 'rock' });
    expect(game.table?.scores).toEqual([1, 1, 0]);
  });
});

describe('coin toss and dice duel', () => {
  it('scores a right call, on your own turn only', () => {
    const game = match('coin', ['a', 'b'], sequence(0, 0.1, 0.9));
    expect(game.act('b', { a: 'pick', choice: 'heads' })).toBe('not_your_turn');
    game.act('a', { a: 'pick', choice: 'heads' });
    expect(game.table?.scores).toEqual([1, 0]);
    expect(game.table?.turn).toBe(1);
    game.act('b', { a: 'pick', choice: 'heads' });
    expect(game.table?.parlor?.last).toEqual({
      kind: 'coin',
      player: 1,
      call: 'heads',
      side: 'tails',
    });
    expect(game.table?.scores).toEqual([1, 0]);
  });

  it('gives the round to the highest roll, and nothing on a tie', () => {
    // a rolls 6+6, b rolls 1+1.
    const game = match('duel', ['a', 'b'], sequence(0, 0.99, 0.99, 0, 0, 0.5, 0.5, 0.5, 0.5));
    game.act('a', { a: 'roll' });
    expect(game.act('a', { a: 'roll' })).toBe('bad');
    game.act('b', { a: 'roll' });
    expect(game.table?.scores).toEqual([1, 0]);
    game.act('a', { a: 'roll' });
    game.act('b', { a: 'roll' });
    expect(game.table?.scores).toEqual([1, 0]);
  });
});

describe('tic-tac-toe', () => {
  it('scores a line, starts a new board with the other player, and is for two', () => {
    const game = match('ttt', ['a', 'b']);
    expect(
      tableAction(
        'ttt',
        game.record,
        { a: 'join' },
        { id: 'c', name: 'c', now: 0, random: Math.random },
      ).error,
    ).toBe('started');
    for (const [id, i] of [
      ['a', 0],
      ['b', 3],
      ['a', 1],
      ['b', 4],
      ['a', 2],
    ] as const) {
      expect(game.act(id, { a: 'cell', i })).toBeUndefined();
    }
    expect(game.table?.scores).toEqual([1, 0]);
    expect(game.table?.parlor?.board.every((c) => c === '')).toBe(true);
    // b starts the next board.
    expect(game.table?.turn).toBe(1);
    expect(game.act('a', { a: 'cell', i: 0 })).toBe('not_your_turn');
    game.act('b', { a: 'cell', i: 4 });
    expect(game.act('a', { a: 'cell', i: 4 })).toBe('bad');
  });

  it('finds lines', () => {
    expect(winningLine(['x', '', '', '', 'x', '', '', '', 'x'])).toEqual([0, 4, 8]);
    expect(winningLine(['x', 'o', 'x', '', '', '', '', '', ''])).toBeNull();
  });
});

describe('word chain', () => {
  it('takes words that start with the last letter, once each', () => {
    const game = match('chain', ['a', 'b']);
    game.act('a', { a: 'word', text: 'Kitap' });
    expect(game.table?.parlor?.words).toEqual(['kitap']);
    game.act('b', { a: 'word', text: 'elma' });
    expect(game.table?.parlor?.last).toMatchObject({ kind: 'chainMiss', reason: 'letter' });
    expect(game.table?.turn).toBe(1);
    game.act('b', { a: 'word', text: 'pencere' });
    game.act('a', { a: 'word', text: 'elma' });
    game.act('b', { a: 'word', text: 'armut' });
    expect(game.table?.scores).toEqual([2, 2]);
  });

  it('cleans words and links a soft ğ to g', () => {
    expect(cleanWord(' Ağaç ')).toBe('ağaç');
    expect(cleanWord('two words')).toBeNull();
    expect(cleanWord('fuck')).toBeNull();
    expect(chains('dağ', 'gemi')).toBe(true);
    expect(chains('kitap', 'elma')).toBe(false);
  });
});

describe('quick math and emoji riddles', () => {
  it('scores the first right answer and deals a new sum', () => {
    const game = match('math', ['a', 'b'], sequence(0, 0, 0));
    const prompt = game.table?.parlor?.prompt ?? '';
    const [x, , y] = prompt.split(' ');
    const answer = String(Number(x) + Number(y));
    expect(prompt).toContain('+');
    game.act('b', { a: 'answer', text: '0' });
    expect(game.table?.scores).toEqual([0, 0]);
    game.act('b', { a: 'answer', text: answer });
    expect(game.table?.scores).toEqual([0, 1]);
    // The answer was never on the table before it was found.
    expect(game.record?.hidden?.answers.length).toBe(1);
  });

  it('takes an emoji riddle in English or Turkish, whatever the case and letters', () => {
    const game = match('emoji', ['a', 'b'], sequence(0));
    const riddle = RIDDLES[0];
    expect(game.table?.parlor?.prompt).toBe(riddle?.emoji);
    game.act('a', { a: 'answer', text: 'GÜNEŞ GÖZLÜĞÜ' });
    expect(game.table?.scores).toEqual([1, 0]);
    expect(foldAnswer('Örümcek Adam!')).toBe(foldAnswer('orumcek adam'));
  });

  it('skips a riddle nobody solves once the time is up', () => {
    const game = match('emoji', ['a', 'b'], sequence(0));
    const before = game.table?.parlor?.prompt;
    game.advance(60_000);
    game.act('a', { a: 'nudge' });
    expect(game.table?.parlor?.last).toMatchObject({ kind: 'skip' });
    expect(game.table?.parlor?.round).toBe(2);
    expect(game.table?.parlor?.prompt).not.toBe(before);
  });
});

describe('leaving a quick game', () => {
  it('ends the match for the one who stays', () => {
    const game = match('rps', ['a', 'b']);
    game.act('a', { a: 'pick', choice: 'rock' });
    game.act('a', { a: 'leave' });
    expect(game.table?.phase).toBe('over');
    expect(game.table?.winners).toEqual(['b']);
  });
});
