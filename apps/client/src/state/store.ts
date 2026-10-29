import type { AreaId } from '@att/shared';
import { create } from 'zustand';
import type { AreaConnection } from '../net/AreaConnection';
import { loadSession, type GuestSession } from '../net/session';

export type Notice = 'rate_limited' | 'replaced' | 'offline';

/** State shared between the Phaser world and the React UI. */
type GameState = {
  session: GuestSession | null;
  area: AreaId;
  connection: AreaConnection | null;
  connected: boolean;
  playersHere: number;
  /** True while the chat input has focus, so the keyboard does not walk the character. */
  typing: boolean;
  notice: Notice | null;
  setSession: (session: GuestSession | null) => void;
  setArea: (area: AreaId) => void;
  setConnection: (connection: AreaConnection | null) => void;
  setConnected: (connected: boolean) => void;
  setPlayersHere: (count: number) => void;
  setTyping: (typing: boolean) => void;
  setNotice: (notice: Notice | null) => void;
};

export const useGameStore = create<GameState>((set) => ({
  session: loadSession(),
  area: 'hall',
  connection: null,
  connected: false,
  playersHere: 1,
  typing: false,
  notice: null,
  setSession: (session) => set({ session }),
  setArea: (area) => set({ area }),
  setConnection: (connection) => set({ connection }),
  setConnected: (connected) => set({ connected }),
  setPlayersHere: (playersHere) => set({ playersHere }),
  setTyping: (typing) => set({ typing }),
  setNotice: (notice) => set({ notice }),
}));
