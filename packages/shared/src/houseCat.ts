import { DAY_MS, MINUTE_MS, utcSlot } from './clock';
import { chance } from './staff';
import type { AreaId } from './world';

/**
 * Simit, the building's cat. Nobody owns her and nobody steers her: where she
 * is follows the building's clock in UTC slots (see `clock.ts`), so everyone,
 * in any time zone, finds her in the same room doing the same thing. She goes
 * round the hall, the library and the smoking room through the day, roams a
 * little on arriving, then naps: on her bed, on a sofa, or in the library
 * next to whoever has been studying longest.
 */

export const CAT_NAME = 'Simit';

/** The rooms she visits, in the order she makes her round. */
export const CAT_ROOMS = ['hall', 'library', 'smoking'] as const satisfies readonly AreaId[];
export type CatRoom = (typeof CAT_ROOMS)[number];

/** She spends at least this long in a room before she may move on. */
export const CAT_SLOT_MS = 20 * MINUTE_MS;
/** Of the slots, this share she stays where she is rather than moving on. */
export const CAT_STAY = 0.35;
/** Coming in through the door and finding her way in. */
export const CAT_ARRIVE_MS = 40_000;
/** After arriving she looks around (one spot after another) until this far into the slot. */
export const CAT_ROAM_UNTIL_MS = 5 * MINUTE_MS;
/** Each look-around spot lasts this long. */
export const CAT_ROAM_STEP_MS = 50_000;
/** Before moving on she gets up and goes to the door this long before the slot ends. */
export const CAT_LEAVE_MS = 60_000;
/** Someone has to have studied this long before she curls up next to them. */
export const CAT_COMPANY_MS = 25 * MINUTE_MS;

const SLOTS_PER_DAY = DAY_MS / CAT_SLOT_MS;
const SALT = 0xca7;

export type CatPhase = 'arrive' | 'roam' | 'nap' | 'leave';

export type CatPlan = {
  room: CatRoom;
  slot: number;
  phase: CatPhase;
  /** While roaming, which look-around this is (0, 1, 2…); a seed for the spot. */
  step: number;
  /** Where she came from, while arriving; where she goes next, while leaving. */
  from: CatRoom | null;
  to: CatRoom | null;
  /** Milliseconds into the slot. */
  into: number;
};

/** The room she is in during a slot (of `CAT_SLOT_MS`, counted in UTC). */
export function catRoomAt(slot: number): CatRoom {
  // Each UTC day starts in a room of its own and walks the round from there.
  const day = Math.floor(slot / SLOTS_PER_DAY);
  let index = day % CAT_ROOMS.length;
  for (let s = day * SLOTS_PER_DAY + 1; s <= slot; s++) {
    if (chance(s * 13 + SALT) >= CAT_STAY) index = (index + 1) % CAT_ROOMS.length;
  }
  return CAT_ROOMS[index] as CatRoom;
}

/** What she is up to at a moment of the building's clock (see `buildingNow`). */
export function catPlan(now: number): CatPlan {
  const slot = utcSlot(now, CAT_SLOT_MS);
  const into = now - slot * CAT_SLOT_MS;
  const room = catRoomAt(slot);
  const before = catRoomAt(slot - 1);
  const after = catRoomAt(slot + 1);
  const base = { room, slot, into, step: 0, from: null, to: null };
  if (before !== room && into < CAT_ARRIVE_MS) return { ...base, phase: 'arrive', from: before };
  if (after !== room && into >= CAT_SLOT_MS - CAT_LEAVE_MS) {
    return { ...base, phase: 'leave', to: after };
  }
  if (into < CAT_ROAM_UNTIL_MS) {
    return { ...base, phase: 'roam', step: Math.floor(into / CAT_ROAM_STEP_MS) };
  }
  return { ...base, phase: 'nap' };
}

/** A stable pick from 0 to `count - 1` for a slot and a step, the same on every screen. */
export function catPick(slot: number, step: number, count: number): number {
  if (count <= 0) return 0;
  return Math.floor(chance(slot * 31 + step * 7 + SALT) * count) % count;
}

/** Someone at a table in a focus block: who, and for how long so far. */
export type Focuser = { id: string; focusedMs: number };

/**
 * Who she curls up next to in the library: the one who has studied longest,
 * at least `CAT_COMPANY_MS`; ties go to the smaller id, so screens that see
 * the same people agree. Null when nobody has studied long enough.
 */
export function catCompanion(focusers: readonly Focuser[]): string | null {
  let best: Focuser | null = null;
  for (const f of focusers) {
    if (f.focusedMs < CAT_COMPANY_MS) continue;
    if (
      !best ||
      f.focusedMs > best.focusedMs ||
      (f.focusedMs === best.focusedMs && f.id < best.id)
    ) {
      best = f;
    }
  }
  return best?.id ?? null;
}
