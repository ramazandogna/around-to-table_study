import type { AreaId, Weather } from '@att/shared';

/**
 * The rules of the rooms' background sound, kept apart from Web Audio so they
 * can be tested: how loud each bed is in each room, when a page turns in the
 * library, and how far everything ducks while music plays. See `soundscape.ts`.
 */

/** The steady sounds a room is made of, each from 0 (none) to 1 (its full, still quiet level). */
export type Beds = {
  /** The hum of a room: air, a building breathing. */
  tone: number;
  /** People talking, too far off to make out. */
  murmur: number;
  /** Traffic out on the street, low and far. */
  traffic: number;
  /** Rain on the windows or the street. */
  rain: number;
};

/** What each room sounds like before the weather and the people. */
const ROOMS: Record<'library' | 'smoking' | 'hall' | 'conference' | 'room', Beds> = {
  library: { tone: 1, murmur: 0, traffic: 0, rain: 0.8 },
  smoking: { tone: 0.6, murmur: 1, traffic: 0, rain: 0.6 },
  hall: { tone: 0.5, murmur: 0, traffic: 1, rain: 1 },
  conference: { tone: 1, murmur: 0, traffic: 0, rain: 0.4 },
  room: { tone: 0.7, murmur: 0, traffic: 0, rain: 0.6 },
};

const roomOf = (area: AreaId) =>
  area === 'library' || area === 'smoking' || area === 'hall' || area === 'conference'
    ? area
    : 'room';

/**
 * How loud each bed is: the room's own mix, rain only while it rains, and the
 * smoking room's murmur growing with the people in it (a little even when
 * empty: the café next door).
 */
export function bedLevels(area: AreaId, weather: Weather, people: number): Beds {
  const room = ROOMS[roomOf(area)];
  const crowd = Math.min(1, 0.35 + Math.max(0, people - 1) * 0.15);
  return {
    tone: room.tone,
    murmur: room.murmur * crowd,
    traffic: room.traffic,
    rain: weather === 'rain' ? room.rain : 0,
  };
}

/** Whether the room has a clock to tick and pages to turn (the library only). */
export function hasPages(area: AreaId): boolean {
  return area === 'library';
}

/** Whether the coffee machine and the glasses can be heard (the smoking room only). */
export function hasCafe(area: AreaId): boolean {
  return area === 'smoking';
}

/** While music plays the beds fall to this share of their level: near silence, not a gap. */
export const DUCKED = 0.04;

/** The share of the beds' level to play at, from what else is going on. */
export function bedShare({
  on,
  muted,
  hidden,
  music,
}: {
  /** The player's "Ambience" switch. */
  on: boolean;
  muted: boolean;
  /** The tab is in the background. */
  hidden: boolean;
  /** The jukebox, the room's calm music or an event's music is playing. */
  music: boolean;
}): number {
  if (!on || muted || hidden) return 0;
  return music ? DUCKED : 1;
}

/** One person's page turns are at least this far apart (plus a little chance). */
export const PAGE_GAP_MS = 20_000;
/** And any two page turns in the room at least this far apart, however many study. */
export const PAGE_ANY_GAP_MS = 4_000;
/** No more than this many page turns sound at once. */
export const PAGE_VOICES = 4;
/** A page turn lasts about this long, for counting voices. */
export const PAGE_LENGTH_MS = 700;

export type PageState = {
  /** When each person's page last turned. */
  last: Map<string, number>;
  /** When any page last turned. */
  lastAny: number;
  /** When each sounding page turn ends. */
  sounding: number[];
};

export function newPageState(): PageState {
  return { last: new Map(), lastAny: -Infinity, sounding: [] };
}

/**
 * Whose page turns now, if anyone's: one sound per person actually in a focus
 * block, never more often than `PAGE_GAP_MS` each (stretched by up to half
 * again at random, so it never ticks like a metronome), `PAGE_ANY_GAP_MS`
 * between any two and `PAGE_VOICES` at once. Updates `state` when it says yes.
 */
export function nextPageTurn(
  state: PageState,
  now: number,
  focusing: readonly string[],
  random: () => number = Math.random,
): string | null {
  // People who stopped studying are forgotten, so they start fresh next time.
  for (const id of state.last.keys()) if (!focusing.includes(id)) state.last.delete(id);
  state.sounding = state.sounding.filter((end) => end > now);
  if (focusing.length === 0) return null;
  if (now - state.lastAny < PAGE_ANY_GAP_MS || state.sounding.length >= PAGE_VOICES) return null;
  for (const id of focusing) {
    const last = state.last.get(id);
    if (last === undefined) {
      // Someone just sat down: their first page comes a little later, not at once.
      state.last.set(id, now - PAGE_GAP_MS * random());
      continue;
    }
    if (now - last < PAGE_GAP_MS * (1 + random() * 0.5)) continue;
    state.last.set(id, now);
    state.lastAny = now;
    state.sounding.push(now + PAGE_LENGTH_MS);
    return id;
  }
  return null;
}

/** Seconds until the next coffee machine hiss or glass clink in the smoking room. */
export function cafeGap(kind: 'hiss' | 'clink', random: () => number = Math.random): number {
  return kind === 'hiss' ? 45 + random() * 60 : 30 + random() * 50;
}

/** The coffee machine's hiss is louder near it: full within two tiles, fading out by eight. */
export function nearness(distance: number): number {
  if (!Number.isFinite(distance)) return 0.25;
  return Math.max(0.25, Math.min(1, 1 - (distance - 2) / 6));
}
