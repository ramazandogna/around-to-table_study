import { describe, expect, it } from 'vitest';
import {
  dartScore,
  DARTS_PER_TURN,
  PIG_GOAL,
  tableAction,
  TURN_MS,
  type TableAction,
  type TableKind,
  type TableRecord,
} from '../src';

/** Plays actions in order, each by a person, with a fixed list of random numbers. */
function play(
  kind: TableKind,
  steps: [string, TableAction][],
  rolls: number[] = [],
  start: TableRecord | null = null,
  now = 1000,
) {
  let record = start;
  const errors: (string | undefined)[] = [];
  for (const [id, action] of steps) {
    const result = tableAction(kind, record, action, {
      id,
      name: id.toUpperCase(),
      now,
      random: () => rolls.shift() ?? 0.5,
    });
    record = result.record;
    errors.push(result.error);
  }
  return { record, errors };
}

const seated = (kind: TableKind, rolls: number[] = []) =>
  play(
    kind,
    [
      ['ann', { a: 'open' }],
      ['bob', { a: 'join' }],
      ['ann', { a: 'start' }],
    ],
    rolls,
  ).record;

describe('dart scores', () => {
  it('scores the bull, the rings and the numbers', () => {
    expect(dartScore(0, 0)).toBe(50);
    expect(dartScore(0, 0.07)).toBe(25);
    expect(dartScore(0, 0.3)).toBe(20);
    expect(dartScore(0, 0.6)).toBe(60);
    expect(dartScore(0, 0.97)).toBe(40);
    expect(dartScore(0, -0.3)).toBe(3);
    expect(dartScore(0.3, 0)).toBe(6);
    expect(dartScore(-0.3, 0)).toBe(11);
    expect(dartScore(0, 1.2)).toBe(0);
  });
});

describe('table games', () => {
  it('lets darts be played alone, needs two for the others, and seats at most four', () => {
    const solo = play('darts', [
      ['ann', { a: 'open' }],
      ['ann', { a: 'start' }],
      ['ann', { a: 'throw', x: 0, y: 0 }],
      ['ann', { a: 'throw', x: 0, y: 0.3 }],
      ['ann', { a: 'throw', x: 0, y: 2 }],
    ]);
    expect(solo.errors[1]).toBeUndefined();
    expect(solo.record?.table.phase).toBe('over');
    expect(solo.record?.table.scores).toEqual([70]);
    const alone = play('pig', [
      ['ann', { a: 'open' }],
      ['ann', { a: 'start' }],
    ]);
    expect(alone.errors[1]).toBe('too_few');
    const crowd = play('darts', [
      ['a', { a: 'open' }],
      ['b', { a: 'join' }],
      ['c', { a: 'join' }],
      ['d', { a: 'join' }],
      ['e', { a: 'join' }],
    ]);
    expect(crowd.record?.table.players).toHaveLength(4);
    expect(crowd.errors[4]).toBe('full');
  });

  it('plays darts: three each, the best total wins', () => {
    const start = seated('darts');
    const bull: TableAction = { a: 'throw', x: 0, y: 0 };
    const twenty: TableAction = { a: 'throw', x: 0, y: 0.3 };
    const out = play(
      'darts',
      [
        ['bob', bull],
        ['ann', bull],
        ['ann', bull],
        ['ann', twenty],
        ['bob', twenty],
        ['bob', twenty],
        ['bob', twenty],
      ],
      [],
      start,
    );
    expect(out.errors[0]).toBe('not_your_turn');
    expect(out.record?.table.scores).toEqual([120, 60]);
    expect(out.record?.table.darts).toHaveLength(DARTS_PER_TURN * 2);
    expect(out.record?.table.phase).toBe('over');
    expect(out.record?.table.winners).toEqual(['ann']);
  });

  it('plays pig: a 1 loses the pot, holding banks it, the goal wins', () => {
    // 0.9 rolls a 6, 0 rolls a 1.
    const start = seated('pig');
    const out = play(
      'pig',
      [
        ['ann', { a: 'roll' }],
        ['ann', { a: 'roll' }],
        ['bob', { a: 'roll' }],
        ['bob', { a: 'hold' }],
      ],
      [0.9, 0, 0.9],
      start,
    );
    expect(out.record?.table.scores).toEqual([0, 6]);
    expect(out.record?.table.turn).toBe(0);
    const near = JSON.parse(JSON.stringify(out.record)) as TableRecord;
    near.table.scores = [PIG_GOAL - 3, 6];
    const win = play('pig', [['ann', { a: 'roll' }]], [0.9], near);
    expect(win.record?.table.phase).toBe('over');
    expect(win.record?.table.winners).toEqual(['ann']);
  });

  it('plays guess: hints narrow the range until someone finds it', () => {
    // 0.41 picks 42 as the secret.
    const start = seated('guess', [0.41]);
    expect(start?.secret).toBe(42);
    expect(JSON.stringify(start?.table)).not.toContain('secret');
    const out = play(
      'guess',
      [
        ['ann', { a: 'guess', n: 50 }],
        ['bob', { a: 'guess', n: 20 }],
        ['ann', { a: 'guess', n: 10 }],
        ['ann', { a: 'guess', n: 42 }],
      ],
      [],
      start,
    );
    expect(out.errors[2]).toBe('bad');
    expect(out.record?.table.low).toBe(21);
    expect(out.record?.table.high).toBe(49);
    expect(out.record?.table.winners).toEqual(['ann']);
  });

  it('plays a turn left too long, and ends when one player is left', () => {
    const start = seated('pig');
    const early = play('pig', [['bob', { a: 'nudge' }]], [], start, 1000 + TURN_MS - 1);
    expect(early.record?.table.turn).toBe(0);
    const late = play('pig', [['bob', { a: 'nudge' }]], [], start, 1000 + TURN_MS);
    expect(late.record?.table.turn).toBe(1);
    const left = play('pig', [['ann', { a: 'leave' }]], [], start);
    expect(left.record?.table.phase).toBe('over');
    expect(left.record?.table.winners).toEqual(['bob']);
    expect(play('pig', [['bob', { a: 'leave' }]], [], left.record).record).toBeNull();
  });
});
