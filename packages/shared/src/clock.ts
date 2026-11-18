/**
 * The building's own clock, for things everyone must see alike wherever they
 * live: the weather and the house cat. It is the server's time (a phone's
 * clock may be off by minutes) cut into UTC slots, so a player in Tokyo and
 * one in Istanbul land in the same slot at the same moment. The light of the
 * day and the staff shifts stay on each viewer's own hour (see `time.ts`).
 */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/**
 * The server's time, from this device's clock and how far ahead of it the
 * server was when the room said hello (`welcome.now - Date.now()`).
 */
export function buildingNow(deviceNow: number, offset: number): number {
  return deviceNow + (Number.isFinite(offset) ? offset : 0);
}

/** Which slot of a given length (in ms) a moment falls in, counted from 1970 UTC. */
export function utcSlot(now: number, slotMs: number): number {
  return Math.floor(now / slotMs);
}

/** How far into its slot a moment is, from 0 (just begun) to just under 1. */
export function slotProgress(now: number, slotMs: number): number {
  return (now - utcSlot(now, slotMs) * slotMs) / slotMs;
}

/** The UTC day number (days since 1970) of a moment. */
export function utcDay(now: number): number {
  return utcSlot(now, DAY_MS);
}

/** The UTC hour of the day (0–23) of a moment. */
export function utcHour(now: number): number {
  return new Date(now).getUTCHours();
}

/** The UTC month (0 = January) of a moment. */
export function utcMonth(now: number): number {
  return new Date(now).getUTCMonth();
}
