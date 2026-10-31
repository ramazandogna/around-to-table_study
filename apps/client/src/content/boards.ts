/**
 * What is pinned on the two notice boards beyond the standing notices. The hall
 * board is for the whole community (events, meetups, news); the library board
 * only for studying (group study sessions, quiet hours, library news). Until
 * there is an admin screen, add an entry here and deploy, e.g.
 * { when: 'Thu 20:00', title: 'Online talk: living longer', text: 'In English, in the hall.' }
 */
export type Pinned = { when: string; title: string; text?: string };

export const HALL_EVENTS: readonly Pinned[] = [];

export const LIBRARY_SESSIONS: readonly Pinned[] = [];
