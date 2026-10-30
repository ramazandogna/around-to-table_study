/**
 * Events and news pinned to the notice boards. Newest first; until there is an
 * admin screen, add one here and deploy, e.g.
 * { when: 'Thu 20:00', title: 'Online talk: living longer', text: 'In English, in the hall.' }
 */
export type Announcement = { when: string; title: string; text?: string };

export const ANNOUNCEMENTS: readonly Announcement[] = [];
