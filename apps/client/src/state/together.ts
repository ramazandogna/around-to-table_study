import { earnedBadges, type Candle, type Profile, type Reward } from '@att/shared';
import { create } from 'zustand';
import { useGameStore } from './store';

/**
 * Studying together, on this screen: the room's candles, how many sit at the
 * library's tables during a table hour, the reward card for the block just
 * done, and a walk to study beside someone. Kept apart from the main store so
 * it stays small.
 */
type TogetherState = {
  candles: Candle[];
  /** During a table hour: how many focus at the library's tables (null when not told). */
  focusing: number | null;
  reward: Reward | null;
  /** Wardrobe items the last reward earned (see `onItemsEarned`). */
  itemsEarned: string[];
  /** Someone to go and study beside (their id), until the walk there is done. */
  studyBeside: string | null;
  /** People in this room sitting at a table now (their ids), for "Study beside". */
  atTables: string[];
  setAtTables: (ids: string[]) => void;
  setCandles: (candles: Candle[]) => void;
  setFocusing: (focusing: number | null) => void;
  setReward: (reward: Reward | null) => void;
  /** Closes the card; the room forgets it, so it does not come back on a reconnect. */
  dismissReward: () => void;
  /**
   * HOOK for the wardrobe (Eng-Character, K1): called with the wearable ids a
   * finished block just earned. When `@att/shared` exports an earned-items
   * function, `earnedItems` below uses it; the wardrobe's new-item dot is set
   * through the main store's `setWardrobeNew`, if it has one.
   */
  onItemsEarned: (ids: string[]) => void;
  setStudyBeside: (id: string | null) => void;
};

export const useTogether = create<TogetherState>((set) => ({
  candles: [],
  focusing: null,
  reward: null,
  itemsEarned: [],
  studyBeside: null,
  atTables: [],
  setAtTables: (atTables) => set({ atTables }),
  setCandles: (candles) => set({ candles }),
  setFocusing: (focusing) => set({ focusing }),
  setReward: (reward) => {
    set({ reward });
    if (reward) useTogether.getState().onItemsEarned(earnedItems(reward.before, reward.after));
  },
  dismissReward: () => {
    useGameStore.getState().connection?.rewardSeen();
    set({ reward: null });
  },
  onItemsEarned: (ids) => {
    set({ itemsEarned: ids });
    if (ids.length === 0) return;
    // The wardrobe's dot lives in the main store once the wardrobe has items.
    (useGameStore.getState() as { setWardrobeNew?: (on: boolean) => void }).setWardrobeNew?.(true);
  },
  setStudyBeside: (studyBeside) => set({ studyBeside }),
}));

// Development only (dropped from the production build): a handle for browser tests.
if (import.meta.env.DEV) Object.assign(window, { __together: useTogether });

/** Badges a block just earned (shown on the reward card). */
export function newBadges(before: Profile | null, after: Profile | null): string[] {
  if (!before || !after) return [];
  const had = new Set(earnedBadges(before).map((b) => b.id));
  return earnedBadges(after)
    .map((b) => b.id)
    .filter((id) => !had.has(id));
}

/**
 * Wardrobe items a block just earned. MERGE (K1): once `@att/shared` exports
 * the wearables and their earned rule, return the ids earned by `after` and
 * not by `before`. Until then nothing is earned this way.
 */
export function earnedItems(before: Profile | null, after: Profile | null): string[] {
  if (!before || !after) return [];
  return [];
}
