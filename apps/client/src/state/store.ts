import type { Activity, AreaId, StudyStatus } from '@att/shared';
import { create } from 'zustand';
import type { AreaConnection } from '../net/AreaConnection';
import { loadSession, type GuestSession } from '../net/session';

export type Notice = 'rate_limited' | 'replaced' | 'offline';

/** A running timer on this device's clock. */
export type LocalTimer = { endsAt: number; totalMs: number };

/** The questions asked after sitting down, in order. */
export type SitStep = 'activity' | 'timer';

/** State shared between the three.js world and the React UI. */
type GameState = {
  session: GuestSession | null;
  area: AreaId;
  connection: AreaConnection | null;
  connected: boolean;
  playersHere: number;
  /** True while the chat input has focus, so the keyboard does not walk the character. */
  typing: boolean;
  notice: Notice | null;
  /** True while the player sits at a table. */
  seated: boolean;
  sitStep: SitStep | null;
  activity: Activity | null;
  timer: LocalTimer | null;
  dnd: boolean;
  setSession: (session: GuestSession | null) => void;
  setArea: (area: AreaId) => void;
  setConnection: (connection: AreaConnection | null) => void;
  setConnected: (connected: boolean) => void;
  setPlayersHere: (count: number) => void;
  setTyping: (typing: boolean) => void;
  setNotice: (notice: Notice | null) => void;
  setSeated: (seated: boolean) => void;
  setSitStep: (step: SitStep | null) => void;
  setActivity: (activity: Activity | null) => void;
  startTimer: (minutes: number, dnd: boolean) => void;
  stopTimer: () => void;
  setDnd: (dnd: boolean) => void;
  /** Back to the name screen with nothing carried over. */
  startOver: () => void;
};

export const useGameStore = create<GameState>((set) => ({
  session: loadSession(),
  area: 'hall',
  connection: null,
  connected: false,
  playersHere: 1,
  typing: false,
  notice: null,
  seated: false,
  sitStep: null,
  activity: null,
  timer: null,
  dnd: false,
  setSession: (session) => set({ session }),
  setArea: (area) => set({ area }),
  setConnection: (connection) => set({ connection }),
  setConnected: (connected) => set({ connected }),
  setPlayersHere: (playersHere) => set({ playersHere }),
  setTyping: (typing) => set({ typing }),
  setNotice: (notice) => set({ notice }),
  // Sitting down asks what you will work on; standing up clears the table.
  setSeated: (seated) =>
    set(seated ? { seated, sitStep: 'activity' } : { seated, sitStep: null, activity: null }),
  setSitStep: (sitStep) => set({ sitStep }),
  setActivity: (activity) => set({ activity }),
  startTimer: (minutes, dnd) =>
    set({ timer: { endsAt: Date.now() + minutes * 60_000, totalMs: minutes * 60_000 }, dnd }),
  // Do not disturb belongs to the timer, so it ends with it.
  stopTimer: () => set({ timer: null, dnd: false }),
  setDnd: (dnd) => set({ dnd }),
  startOver: () =>
    set({ session: null, seated: false, sitStep: null, activity: null, timer: null, dnd: false }),
}));

/** The player's study status as the server expects it. */
export function studyStatus(state: GameState = useGameStore.getState()): StudyStatus {
  const { activity, timer, dnd } = state;
  return {
    activity,
    timer: timer
      ? { remainingMs: Math.max(0, Math.round(timer.endsAt - Date.now())), totalMs: timer.totalMs }
      : null,
    dnd,
  };
}
