import type { AreaId } from './world';

/**
 * The people who work in the building. Each desk has its shifts, and who sits
 * behind it follows the hour on the viewer's own clock: the morning librarian
 * greets someone studying in their morning, wherever they are. Both desks
 * always have someone: at night a sleepy librarian keeps the library open.
 */

export type StaffId =
  'librarianDay' | 'librarianEvening' | 'librarianNight' | 'receptionDay' | 'receptionNight';

export type Shift = {
  staff: StaffId;
  area: AreaId;
  /** Hours on the clock, from (inclusive) to (exclusive); `to` below `from` runs past midnight. */
  from: number;
  to: number;
};

export const SHIFTS: readonly Shift[] = [
  { staff: 'librarianDay', area: 'library', from: 9, to: 15 },
  { staff: 'librarianEvening', area: 'library', from: 15, to: 22 },
  { staff: 'librarianNight', area: 'library', from: 22, to: 9 },
  { staff: 'receptionDay', area: 'hall', from: 7, to: 19 },
  { staff: 'receptionNight', area: 'hall', from: 19, to: 7 },
];

/** Whether an hour (0–23, fractions allowed) falls in a shift. */
export function inShift(shift: Pick<Shift, 'from' | 'to'>, hour: number): boolean {
  return shift.from <= shift.to
    ? hour >= shift.from && hour < shift.to
    : hour >= shift.from || hour < shift.to;
}

/** Who works in an area at an hour of the day, or null when the desk is empty. */
export function onDuty(area: AreaId, hour: number, shifts = SHIFTS): StaffId | null {
  return shifts.find((shift) => shift.area === area && inShift(shift, hour))?.staff ?? null;
}

/**
 * A small random from a number, the same on every screen: staff pick what to
 * do next from the clock, so it varies without looking scripted, yet everyone
 * sees the same.
 */
export function chance(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * What staff talk about when someone taps them, in order, one per tap: a
 * hello by name for the time of day, a hint toward something the player has
 * not found yet, how many people are studying (only with two or more, so
 * nobody alone is pointed at), the weather, and then their own lines. Never
 * how long someone was away: nobody should feel counted.
 */
export const STAFF_TOPICS = ['greet', 'hint', 'company', 'weather', 'own'] as const;
export type StaffTopic = (typeof STAFF_TOPICS)[number];

/** Fewer people studying than this and staff keep the number to themselves. */
export const COMPANY_AT_LEAST = 2;

export function staffTopics({
  hint,
  studying,
}: {
  /** Whether there is something left to point the player to. */
  hint: boolean;
  /** People studying in the building right now. */
  studying: number;
}): StaffTopic[] {
  return STAFF_TOPICS.filter(
    (topic) => (topic !== 'hint' || hint) && (topic !== 'company' || studying >= COMPANY_AT_LEAST),
  );
}
