import { describe, expect, it } from 'vitest';
import {
  ACCENTS,
  allowedLook,
  BUILT_IN,
  CHARACTERS,
  earnedWearables,
  earnProgress,
  freeLook,
  isEarned,
  isFree,
  isValidAppearance,
  parseClientMessage,
  randomWear,
  WEAR_ITEMS,
  WEAR_SLOTS,
  WEARABLES,
  wearable,
  wearsEarned,
  type Appearance,
  type WearableId,
  type WearProfile,
} from '../src';

const HOUR = 60 * 60 * 1000;

function profile(change: Partial<WearProfile> = {}): WearProfile {
  return {
    id: 'p',
    name: 'Mia',
    role: 'user',
    joinedAt: 0,
    online: true,
    blocks: { today: 0, week: 0, month: 0, year: 0, total: 0 },
    kinds: { pomodoro: 0, deep: 0, marathon: 0, custom: 0 },
    focusMs: 0,
    timeMs: 0,
    friends: 0,
    messages: 0,
    bestStreak: 0,
    ...change,
  };
}

const FREE: WearableId[] = ['beanie', 'cap', 'bucket', 'round', 'square', 'scarf', 'tote'];

describe('wearables', () => {
  it('lists every item once, in its own slot', () => {
    const all = WEAR_SLOTS.flatMap((slot) => [...WEAR_ITEMS[slot]]);
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual(Object.keys(WEARABLES).sort());
    for (const slot of WEAR_SLOTS) {
      for (const id of WEAR_ITEMS[slot]) expect(WEARABLES[id].slot).toBe(slot);
    }
  });

  it('gives seven things from the start', () => {
    expect((Object.keys(WEARABLES) as WearableId[]).filter(isFree).sort()).toEqual(
      [...FREE].sort(),
    );
    expect(earnedWearables(null).sort()).toEqual([...FREE].sort());
  });

  it('earns things by focus and friends, counted from the profile', () => {
    const none = profile();
    expect(isEarned('headphones', none)).toBe(false);
    expect(isEarned('headphones', profile({ blocks: { ...none.blocks, total: 5 } }))).toBe(true);
    expect(isEarned('beret', profile({ kinds: { ...none.kinds, deep: 1 } }))).toBe(true);
    expect(isEarned('backpack', profile({ focusMs: 10 * HOUR - 1 }))).toBe(false);
    expect(isEarned('backpack', profile({ focusMs: 10 * HOUR }))).toBe(true);
    expect(isEarned('flowers', profile({ friends: 1 }))).toBe(true);
    expect(isEarned('earmuffs', profile({ kinds: { ...none.kinds, pomodoro: 10 } }))).toBe(true);
    expect(isEarned('sunhat', profile({ focusMs: 25 * HOUR }))).toBe(true);
    expect(isEarned('bowtie', profile({ blocks: { ...none.blocks, total: 50 } }))).toBe(true);
  });

  it('never counts time in the building or streaks', () => {
    const idle = profile({ timeMs: 1000 * HOUR, bestStreak: 365, messages: 10_000 });
    expect(earnedWearables(idle).sort()).toEqual([...FREE].sort());
  });

  it('reads shared blocks when the profile has them, and none when it does not', () => {
    expect(isEarned('sunglasses', profile())).toBe(false);
    expect(isEarned('sunglasses', profile({ sharedBlocks: 2 }))).toBe(false);
    expect(isEarned('sunglasses', profile({ sharedBlocks: 3 }))).toBe(true);
    expect(earnProgress('sunglasses', profile({ sharedBlocks: 2 }))).toEqual({ have: 2, need: 3 });
  });

  it('shows progress towards an item, capped at what it needs', () => {
    const p = profile({ blocks: { today: 0, week: 0, month: 0, year: 0, total: 2 } });
    expect(earnProgress('headphones', p)).toEqual({ have: 2, need: 5 });
    expect(earnProgress('headphones', profile({ blocks: { ...p.blocks, total: 9 } }))).toEqual({
      have: 5,
      need: 5,
    });
    expect(earnProgress('headphones', null)).toEqual({ have: 0, need: 5 });
    expect(earnProgress('beanie', p)).toBeNull();
  });

  it('knows nothing of ids it was not built with', () => {
    expect(wearable('crown')).toBeUndefined();
    expect(wearable('toString')).toBeUndefined();
    expect(wearable(3)).toBeUndefined();
    expect(wearable('cap')?.slot).toBe('hat');
  });

  it('takes off what is not earned, with its colour, and keeps the rest', () => {
    const look: Appearance = {
      character: 3,
      top: 2,
      hat: 'headphones',
      hatColor: 1,
      face: 'round',
      faceColor: 4,
      back: 'backpack',
    };
    expect(wearsEarned(look)).toBe(true);
    expect(allowedLook(look, profile())).toEqual({
      character: 3,
      top: 2,
      face: 'round',
      faceColor: 4,
    });
    expect(freeLook(look)).toEqual(allowedLook(look, null));
    const earned = profile({ focusMs: 10 * HOUR, blocks: { ...profile().blocks, total: 5 } });
    expect(allowedLook(look, earned)).toEqual(look);
    expect(wearsEarned({ character: 0, hat: 'cap', neck: 'scarf' })).toBe(false);
  });

  it('drops ids it does not know from a look sent by another build', () => {
    const odd = { character: 1, hat: 'crown', neck: 'scarf' } as unknown as Appearance;
    expect(freeLook(odd)).toEqual({ character: 1, neck: 'scarf' });
  });

  it('marks the faces that already wear glasses or a cap', () => {
    expect(BUILT_IN['male-a']).toContain('face');
    expect(BUILT_IN['male-e']).toContain('face');
    expect(BUILT_IN['male-c']).toContain('hat');
    for (const id of Object.keys(BUILT_IN)) expect(CHARACTERS).toContain(id);
  });

  it('rolls only free items, in valid looks', () => {
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 200; i++) {
      const wear = randomWear(random);
      for (const slot of WEAR_SLOTS) {
        const id = wear[slot];
        if (id) expect(isFree(id)).toBe(true);
      }
      expect(isValidAppearance({ character: 0, ...wear })).toBe(true);
    }
  });
});

describe('looks with things to wear', () => {
  it('still takes every look from before', () => {
    expect(isValidAppearance({ character: 4, skin: 1, pet: 'cat', petAccessory: 'bow' })).toBe(
      true,
    );
  });

  it('checks the head, the items by slot and their colours', () => {
    const look = {
      character: 0,
      head: 9,
      hat: 'beanie',
      hatColor: ACCENTS.length - 1,
      face: 'sunglasses',
      neck: 'bowtie',
      back: 'tote',
      backColor: 0,
    };
    expect(isValidAppearance(look)).toBe(true);
    expect(isValidAppearance({ ...look, head: CHARACTERS.length })).toBe(false);
    expect(isValidAppearance({ ...look, head: 1.5 })).toBe(false);
    expect(isValidAppearance({ ...look, hat: 'scarf' })).toBe(false);
    expect(isValidAppearance({ ...look, face: 'crown' })).toBe(false);
    expect(isValidAppearance({ ...look, hatColor: ACCENTS.length })).toBe(false);
    expect(isValidAppearance({ ...look, neckColor: -1 })).toBe(false);
    expect(parseClientMessage(JSON.stringify({ t: 'look', look }))).toEqual({ t: 'look', look });
    expect(
      parseClientMessage(JSON.stringify({ t: 'look', look: { ...look, back: 'cape' } })),
    ).toBeNull();
  });
});
