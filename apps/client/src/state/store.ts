import type { AreaId } from '@att/shared';
import { create } from 'zustand';

/** State shared between the Phaser world and the React UI. */
type GameState = {
  area: AreaId;
  setArea: (area: AreaId) => void;
};

export const useGameStore = create<GameState>((set) => ({
  area: 'hall',
  setArea: (area) => set({ area }),
}));
