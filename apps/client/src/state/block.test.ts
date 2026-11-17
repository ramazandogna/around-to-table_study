import { describe, expect, it } from 'vitest';
import { restoredBlock, type SavedBlock } from './block';
import type { StudySession } from './store';

const NOW = 1_000_000_000_000;
const study = (over: Partial<StudySession> = {}): StudySession => ({
  plan: 'pomodoro',
  rhythm: { workMinutes: 25, breakMinutes: 5, rounds: 4 },
  round: 2,
  phase: 'work',
  breakEndsAt: null,
  startedAt: NOW - 60_000,
  ...over,
});
const saved = (over: Partial<SavedBlock> = {}): SavedBlock => ({
  id: 'ada',
  at: NOW - 5_000,
  timer: { endsAt: NOW + 600_000, totalMs: 1_500_000 },
  study: study(),
  dnd: true,
  ...over,
});

describe('restoredBlock', () => {
  it('brings a running block back with its plan and round', () => {
    const back = restoredBlock(saved(), 'ada', NOW);
    expect(back?.timer?.endsAt).toBe(NOW + 600_000);
    expect(back?.study?.round).toBe(2);
    expect(back?.dnd).toBe(true);
  });

  it('forgets a block of another character, an old one, or one that ran out unseen', () => {
    expect(restoredBlock(saved(), 'bob', NOW)).toBeNull();
    expect(restoredBlock(saved({ at: NOW - 7 * 3_600_000 }), 'ada', NOW)).toBeNull();
    expect(
      restoredBlock(saved({ timer: { endsAt: NOW - 1, totalMs: 1_500_000 } }), 'ada', NOW),
    ).toBeNull();
    expect(restoredBlock(null, 'ada', NOW)).toBeNull();
  });

  it('turns a break that ended while away into the wait for the next round', () => {
    const back = restoredBlock(
      saved({ timer: null, study: study({ phase: 'break', breakEndsAt: NOW - 1 }) }),
      'ada',
      NOW,
    );
    expect(back?.study?.phase).toBe('between');
    expect(back?.timer).toBeNull();
  });

  it('keeps a break that is still running, and the free stopwatch', () => {
    const during = restoredBlock(
      saved({ timer: null, study: study({ phase: 'break', breakEndsAt: NOW + 1000 }) }),
      'ada',
      NOW,
    );
    expect(during?.study?.phase).toBe('break');
    const free = restoredBlock(
      saved({ timer: null, study: study({ phase: 'free', rhythm: null }) }),
      'ada',
      NOW,
    );
    expect(free?.study?.phase).toBe('free');
    expect(restoredBlock(saved({ study: study({ phase: 'done' }) }), 'ada', NOW)).toBeNull();
  });
});
