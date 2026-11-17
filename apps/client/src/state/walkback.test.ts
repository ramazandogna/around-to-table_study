import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from './store';

const RHYTHM = { workMinutes: 25, breakMinutes: 5, rounds: 4 };

function inBreakOver() {
  useGameStore.getState().startSession('pomodoro', RHYTHM, false);
  useGameStore.getState().beginBreak(5);
  useGameStore.getState().breakOver();
}

describe('"Let\'s go" after a break', () => {
  beforeEach(() => {
    useGameStore.setState({ seated: false, walkBack: false, timer: null, study: null });
  });

  it('does not start the block while the player is on the way', () => {
    inBreakOver();
    useGameStore.getState().returnToSeat();
    const state = useGameStore.getState();
    expect(state.walkBack).toBe(true);
    expect(state.timer).toBeNull();
    expect(state.study?.phase).toBe('between');
  });

  it('starts the next round when the player sits, and only then', () => {
    inBreakOver();
    useGameStore.getState().returnToSeat();
    useGameStore.getState().setSeated(true);
    const state = useGameStore.getState();
    expect(state.walkBack).toBe(false);
    expect(state.study?.phase).toBe('work');
    expect(state.study?.round).toBe(2);
    expect(state.timer?.totalMs).toBe(25 * 60_000);
    expect(state.sitStep).toBeNull();
  });

  it('finishing on the way cancels the walk', () => {
    inBreakOver();
    useGameStore.getState().returnToSeat();
    useGameStore.getState().stopTimer();
    expect(useGameStore.getState().walkBack).toBe(false);
    useGameStore.getState().setSeated(true);
    expect(useGameStore.getState().timer).toBeNull();
  });

  it('sitting without having said it does not start a round', () => {
    inBreakOver();
    useGameStore.getState().setSeated(true);
    expect(useGameStore.getState().timer).toBeNull();
  });
});
