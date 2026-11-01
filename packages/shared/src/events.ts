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

export type Occurrence = { event: WeeklyEvent; start: number; end: number };

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

/** The event under way in a room right now, if any. */
export function eventNow(area: AreaId, now: number, events = EVENTS): Occurrence | null {
  for (const event of events) {
    if (event.area !== area) continue;
    const start = lastStart(event, now);
    const end = start + event.minutes * MINUTE;
    if (now >= start && now < end) return { event, start, end };
  }
  return null;
}

/** Every occurrence that has not ended yet, from now until `days` ahead, soonest first. */
export function upcoming(now: number, days = 14, events = EVENTS): Occurrence[] {
  const found: Occurrence[] = [];
  for (const event of events) {
    for (let start = lastStart(event, now); start < now + days * DAY; start += WEEK) {
      const end = start + event.minutes * MINUTE;
      if (end > now) found.push({ event, start, end });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}
