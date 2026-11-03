import { hasProfanity } from './profanity';
import type { AreaId } from './world';

/**
 * Events in the building: regular meetups now, special days later. They run
 * on the clock alone, so every screen agrees on when one is on without the
 * server telling anyone. Times are kept in the event's own time zone, as a
 * fixed offset from UTC (zones we use have no daylight saving).
 */

/** How a room is dressed for an event. New days (a Turkish day, a Thai day…) add a theme here. */
export const EVENT_THEMES = {
  /** The weekly get-together: warm string lights, paper bunting, a little lo-fi music. */
  meetup: {
    bunting: ['#e65f4f', '#f7d154', '#5cc37c', '#4f7fd8', '#f29e4c'],
    lights: '#ffd98a',
    music: 'lofi',
  },
  /** Ready for later: Turkish day in red and white. */
  turkey: { bunting: ['#e30a17', '#ffffff'], lights: '#ffe6c8', music: 'festive' },
  /** Ready for later: Thai day in the flag's red, white and blue. */
  thailand: { bunting: ['#a51931', '#f4f5f8', '#2d2a4a'], lights: '#ffe6c8', music: 'festive' },
  /** Ready for later: a Chinese day with red lanterns and gold. */
  china: { bunting: ['#de2910', '#ffde00'], lights: '#ffb36b', music: 'festive' },
} as const satisfies Record<string, EventTheme>;

export type EventTheme = {
  /** Colours of the paper flags strung across the room. */
  bunting: readonly string[];
  /** Colour of the string lights. */
  lights: string;
  music: 'lofi' | 'festive';
};

export type ThemeId = keyof typeof EVENT_THEMES;

export type WeeklyEvent = {
  id: string;
  area: AreaId;
  theme: ThemeId;
  /** 0 is Sunday, as in Date#getDay, in the event's own time zone. */
  weekday: number;
  hour: number;
  minute: number;
  minutes: number;
  /** The event's time zone as minutes ahead of UTC (Japan is +540). */
  utcOffset: number;
};

/** The building's calendar. Only one regular event for now; no day is special yet. */
export const EVENTS: readonly WeeklyEvent[] = [
  {
    id: 'thursday-meetup',
    area: 'smoking',
    theme: 'meetup',
    weekday: 4,
    hour: 21,
    minute: 0,
    minutes: 120,
    utcOffset: 9 * 60,
  },
];

/**
 * An event someone proposed for one date (a study marathon, a talk, a party).
 * It waits for an admin's approval; only approved ones reach the calendar.
 */
export type ProposedEvent = {
  id: string;
  title: string;
  description: string;
  area: AreaId;
  /** UTC milliseconds. */
  start: number;
  minutes: number;
  by: string;
  byName: string;
  status: 'pending' | 'approved' | 'rejected';
  /** How the room is dressed; the meetup's look when left out. */
  theme?: ThemeId | undefined;
};

export const EVENT_LIMITS = {
  title: { min: 3, max: 48 },
  description: 200,
  minutes: { min: 15, max: 240 },
  /** How far ahead an event may be proposed. */
  aheadDays: 60,
  /** Proposals one person may have waiting at once. */
  pendingPerPerson: 3,
} as const;

/** Rooms an event can be held in: the shared ones. */
export const EVENT_AREAS = [
  'smoking',
  'hall',
  'library',
  'conference',
] as const satisfies readonly AreaId[];

export type EventProposal = Pick<
  ProposedEvent,
  'title' | 'description' | 'area' | 'start' | 'minutes' | 'theme'
>;

/** The looks a proposer can pick, in the order the form shows them. */
export const THEME_IDS = Object.keys(EVENT_THEMES) as ThemeId[];

/** Why a proposal cannot be taken, or null when it is fine. */
export function checkProposal(
  proposal: EventProposal,
  now: number,
): 'title' | 'area' | 'time' | 'length' | null {
  const title = proposal.title.trim();
  if (title.length < EVENT_LIMITS.title.min || title.length > EVENT_LIMITS.title.max)
    return 'title';
  if (hasProfanity(title) || hasProfanity(proposal.description)) return 'title';
  if (!(EVENT_AREAS as readonly string[]).includes(proposal.area)) return 'area';
  if (
    !Number.isFinite(proposal.start) ||
    proposal.start < now ||
    proposal.start > now + EVENT_LIMITS.aheadDays * DAY
  )
    return 'time';
  if (
    !Number.isInteger(proposal.minutes) ||
    proposal.minutes < EVENT_LIMITS.minutes.min ||
    proposal.minutes > EVENT_LIMITS.minutes.max
  )
    return 'length';
  return null;
}

/** A weekly event, or an approved proposal, at one time. */
export type Occurrence = {
  event: WeeklyEvent | ProposedEvent;
  start: number;
  end: number;
};

export const isWeekly = (event: WeeklyEvent | ProposedEvent): event is WeeklyEvent =>
  'weekday' in event;

/** How a room is dressed for an occurrence: the theme it was given, else the meetup's. */
export function themeOf(event: WeeklyEvent | ProposedEvent): ThemeId {
  return event.theme && event.theme in EVENT_THEMES ? event.theme : 'meetup';
}

function oneOffs(proposed: readonly ProposedEvent[]): Occurrence[] {
  return proposed
    .filter((event) => event.status === 'approved')
    .map((event) => ({ event, start: event.start, end: event.start + event.minutes * MINUTE }));
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const WEEK = 7 * DAY;

/** The most recent start of a weekly event at or before `now` (UTC milliseconds). */
function lastStart(event: WeeklyEvent, now: number): number {
  const local = now + event.utcOffset * MINUTE;
  const day = new Date(local).getUTCDay();
  const midnight = local - (local % DAY);
  let start = midnight + (event.weekday - day) * DAY + (event.hour * 60 + event.minute) * MINUTE;
  if (start > local) start -= WEEK;
  return start - event.utcOffset * MINUTE;
}

/** A room dresses up this long before its event starts, so people see it coming. */
export const DECOR_LEAD_MS = 15 * MINUTE;

/**
 * The event under way in a room right now, if any (weekly ones first). With
 * `lead`, one that starts within that long counts too (for decorations).
 */
export function eventNow(
  area: AreaId,
  now: number,
  events = EVENTS,
  proposed: readonly ProposedEvent[] = [],
  lead = 0,
): Occurrence | null {
  for (const event of events) {
    if (event.area !== area) continue;
    // The next start may be the one coming up within the lead.
    for (const start of [lastStart(event, now), lastStart(event, now) + WEEK]) {
      const end = start + event.minutes * MINUTE;
      if (now >= start - lead && now < end) return { event, start, end };
    }
  }
  return (
    oneOffs(proposed).find((o) => o.event.area === area && now >= o.start - lead && now < o.end) ??
    null
  );
}

/**
 * Every occurrence that has not ended yet, from now until `days` ahead,
 * soonest first: the weekly ones and the approved proposals.
 */
export function upcoming(
  now: number,
  days = 14,
  events = EVENTS,
  proposed: readonly ProposedEvent[] = [],
): Occurrence[] {
  const found: Occurrence[] = oneOffs(proposed).filter(
    (o) => o.end > now && o.start < now + days * DAY,
  );
  for (const event of events) {
    for (let start = lastStart(event, now); start < now + days * DAY; start += WEEK) {
      const end = start + event.minutes * MINUTE;
      if (end > now) found.push({ event, start, end });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}
