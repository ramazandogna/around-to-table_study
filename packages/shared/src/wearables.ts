import type { Appearance, CharacterId } from './character';
import type { Profile } from './profile';

/**
 * Things a character can wear: a hat, something on the face, at the neck and
 * on the back, one of each. Seven are there from the start; the rest come
 * with time spent studying and with friends, worked out from the profile the
 * server already keeps (like the badges), so nothing is stored and nothing
 * can drift. No streaks, no idle time, nothing for sale. Names live in the
 * translations (`wear.item.<id>`), how to earn them in `wear.earn.<rule>`.
 */

export const WEAR_SLOTS = ['hat', 'face', 'neck', 'back'] as const;
export type WearSlot = (typeof WEAR_SLOTS)[number];

/** The colour slot of each wear slot in a look (an index into ACCENTS). */
export const WEAR_COLOR = {
  hat: 'hatColor',
  face: 'faceColor',
  neck: 'neckColor',
  back: 'backColor',
} as const satisfies Record<WearSlot, string>;

/** Colours for worn things, as hex. Only ever append, so saved looks keep their colour. */
export const ACCENTS = [
  '#e65f4f',
  '#f29e4c',
  '#f7d154',
  '#5cc37c',
  '#3fa7a1',
  '#4f7fd8',
  '#8a63d2',
  '#c97a9b',
  '#f3f0e8',
  '#c9b48f',
  '#7b4a2a',
  '#3a3d4a',
] as const;

/** What a rule counts in the profile. */
export type EarnKind = 'blocks' | 'deep' | 'pomodoro' | 'focusHours' | 'friends' | 'shared';
export type EarnRule = { kind: EarnKind; need: number };

/** Every item, by slot, in the order the wardrobe shows them. Only ever append. */
export const HATS = [
  'beanie',
  'cap',
  'bucket',
  'beret',
  'headphones',
  'flowers',
  'sunhat',
  'earmuffs',
] as const;
export const FACE_ITEMS = ['round', 'square', 'sunglasses'] as const;
export const NECK_ITEMS = ['scarf', 'bowtie'] as const;
export const BACK_ITEMS = ['tote', 'backpack'] as const;

export type HatId = (typeof HATS)[number];
export type FaceItemId = (typeof FACE_ITEMS)[number];
export type NeckItemId = (typeof NECK_ITEMS)[number];
export type BackItemId = (typeof BACK_ITEMS)[number];
export type WearableId = HatId | FaceItemId | NeckItemId | BackItemId;

export const WEAR_ITEMS = {
  hat: HATS,
  face: FACE_ITEMS,
  neck: NECK_ITEMS,
  back: BACK_ITEMS,
} as const satisfies Record<WearSlot, readonly WearableId[]>;

/** Items without a rule are free; the others are earned. */
export type Wearable = { id: WearableId; slot: WearSlot; earn?: EarnRule };

const item = (id: WearableId, slot: WearSlot, earn?: EarnRule): Wearable =>
  earn ? { id, slot, earn } : { id, slot };

export const WEARABLES: Readonly<Record<WearableId, Wearable>> = {
  beanie: item('beanie', 'hat'),
  cap: item('cap', 'hat'),
  bucket: item('bucket', 'hat'),
  beret: item('beret', 'hat', { kind: 'deep', need: 1 }),
  headphones: item('headphones', 'hat', { kind: 'blocks', need: 5 }),
  flowers: item('flowers', 'hat', { kind: 'friends', need: 1 }),
  sunhat: item('sunhat', 'hat', { kind: 'focusHours', need: 25 }),
  earmuffs: item('earmuffs', 'hat', { kind: 'pomodoro', need: 10 }),
  round: item('round', 'face'),
  square: item('square', 'face'),
  sunglasses: item('sunglasses', 'face', { kind: 'shared', need: 3 }),
  scarf: item('scarf', 'neck'),
  bowtie: item('bowtie', 'neck', { kind: 'blocks', need: 50 }),
  tote: item('tote', 'back'),
  backpack: item('backpack', 'back', { kind: 'focusHours', need: 10 }),
};

/** The item with this id, or undefined for an id this build does not know. */
export function wearable(id: unknown): Wearable | undefined {
  return typeof id === 'string' && Object.hasOwn(WEARABLES, id)
    ? WEARABLES[id as WearableId]
    : undefined;
}

export const isFree = (id: WearableId): boolean => !WEARABLES[id].earn;

/** The profile as the rules read it; `sharedBlocks` (blocks studied beside someone) may be missing. */
export type WearProfile = Profile & { sharedBlocks?: number };

const HOUR = 60 * 60 * 1000;

/** How far a profile is along one rule's count. */
export function earnCount(kind: EarnKind, profile: WearProfile): number {
  switch (kind) {
    case 'blocks':
      return profile.blocks.total;
    case 'deep':
      return profile.kinds.deep;
    case 'pomodoro':
      return profile.kinds.pomodoro;
    case 'focusHours':
      return Math.floor(profile.focusMs / HOUR);
    case 'friends':
      return profile.friends;
    case 'shared':
      return typeof profile.sharedBlocks === 'number' ? profile.sharedBlocks : 0;
  }
}

/** Whether someone may wear an item. Without a profile, only the free ones. */
export function isEarned(id: WearableId, profile: WearProfile | null | undefined): boolean {
  const rule = WEARABLES[id].earn;
  if (!rule) return true;
  return !!profile && earnCount(rule.kind, profile) >= rule.need;
}

/** "2 of 5" towards an earned item, capped at the need; null for a free one. */
export function earnProgress(
  id: WearableId,
  profile: WearProfile | null | undefined,
): { have: number; need: number } | null {
  const rule = WEARABLES[id].earn;
  if (!rule) return null;
  const have = profile ? Math.min(rule.need, earnCount(rule.kind, profile)) : 0;
  return { have, need: rule.need };
}

/** Every item a profile may wear, free ones included. */
export function earnedWearables(profile: WearProfile | null | undefined): WearableId[] {
  return (Object.keys(WEARABLES) as WearableId[]).filter((id) => isEarned(id, profile));
}

/** Whether a look wears anything that has to be earned (so the server must check it). */
export function wearsEarned(look: Appearance): boolean {
  return WEAR_SLOTS.some((slot) => {
    const found = wearable(look[slot]);
    return !!found && !!found.earn;
  });
}

/** A look without the items `allowed` turns down (and without their colours). */
export function lookWithout(look: Appearance, allowed: (id: WearableId) => boolean): Appearance {
  const next: Record<string, unknown> = { ...look };
  for (const slot of WEAR_SLOTS) {
    const found = wearable(next[slot]);
    if (next[slot] !== undefined && (!found || !allowed(found.id))) {
      delete next[slot];
      delete next[WEAR_COLOR[slot]];
    }
  }
  return next as Appearance;
}

/** The look as this person may show it: items they have not earned are taken off. */
export function allowedLook(look: Appearance, profile: WearProfile | null | undefined): Appearance {
  return lookWithout(look, (id) => isEarned(id, profile));
}

/** A new character's look: only the free items. */
export const freeLook = (look: Appearance): Appearance => lookWithout(look, isFree);

/**
 * Slots a face already fills: two of the faces have glasses drawn on and one
 * a police cap, so another pair or hat would go through them.
 */
export const BUILT_IN: Partial<Record<CharacterId, readonly WearSlot[]>> = {
  'male-a': ['face'],
  'male-e': ['face'],
  'male-c': ['hat'],
};

/** Random free things to wear, for the creator's dice: each slot about half the time. */
export function randomWear(random: () => number = Math.random): Partial<Appearance> {
  const look: Record<string, unknown> = {};
  for (const slot of WEAR_SLOTS) {
    const free = WEAR_ITEMS[slot].filter((id) => isFree(id));
    if (free.length === 0 || random() < 0.5) continue;
    look[slot] = free[Math.floor(random() * free.length)];
    if (random() < 0.6) look[WEAR_COLOR[slot]] = Math.floor(random() * ACCENTS.length);
  }
  return look as Partial<Appearance>;
}
