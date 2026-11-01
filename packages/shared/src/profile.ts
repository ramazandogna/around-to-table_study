/**
 * What the building remembers about a person, shown on their profile card:
 * how much they studied (focus blocks by day, week, month and year), how long
 * they have been around, how many friends and messages, and since when. The
 * numbers belong to the server; badges are worked out from them, so new
 * badges only need a line here.
 */

export type Role = 'user' | 'admin';

/** How a finished focus block was planned; the plan's rhythm decides its kind. */
export const BLOCK_KINDS = ['pomodoro', 'deep', 'marathon', 'custom'] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

/** Focus blocks finished in each stretch of time, on the person's own calendar. */
export type BlockCounts = {
  today: number;
  week: number;
  month: number;
  year: number;
  total: number;
};

export type Profile = {
  id: string;
  name: string;
  role: Role;
  /** When they first came in. */
  joinedAt: number;
  /** Online right now, and where. */
  online: boolean;
  blocks: BlockCounts;
  /** All-time focus blocks of each kind. */
  kinds: Record<BlockKind, number>;
  /** Time in focus blocks, and time in the building, in milliseconds. */
  focusMs: number;
  timeMs: number;
  friends: number;
  messages: number;
  /** Their longest run of days with at least one focus block. */
  bestStreak: number;
};

/** Sorts a finished block by its length: 25 minutes is a pomodoro, 50 deep, 90 a marathon. */
export function blockKind(minutes: number): BlockKind {
  if (minutes === 25) return 'pomodoro';
  if (minutes === 50) return 'deep';
  if (minutes === 90) return 'marathon';
  return 'custom';
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * When today, this week (from Monday), this month and this year began, for
 * someone whose clock is `offset` minutes ahead of UTC.
 */
export function periodStarts(
  now: number,
  offset: number,
): { today: number; week: number; month: number; year: number } {
  const local = new Date(now + offset * 60_000);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const sinceMonday = (local.getUTCDay() + 6) % 7;
  const toUtc = (t: number) => t - offset * 60_000;
  return {
    today: toUtc(midnight),
    week: toUtc(midnight - sinceMonday * DAY),
    month: toUtc(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1)),
    year: toUtc(Date.UTC(local.getUTCFullYear(), 0, 1)),
  };
}

/** The longest run of consecutive local days among block times. */
export function longestStreak(times: readonly number[], offset: number): number {
  const days = [...new Set(times.map((t) => Math.floor((t + offset * 60_000) / DAY)))].sort(
    (a, b) => a - b,
  );
  let best = 0;
  let run = 0;
  days.forEach((day, i) => {
    run = i > 0 && day === (days[i - 1] ?? 0) + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

export type Badge = { id: string; icon: string; earned: (p: Profile) => boolean };

/** Badges, from the first step to the long haul. Their names live in the translations. */
export const BADGES: readonly Badge[] = [
  { id: 'first-block', icon: '🌱', earned: (p) => p.blocks.total >= 1 },
  { id: 'ten-tomatoes', icon: '🍅', earned: (p) => p.kinds.pomodoro >= 10 },
  { id: 'deep-diver', icon: '🌊', earned: (p) => p.kinds.deep >= 5 },
  { id: 'marathoner', icon: '🏃', earned: (p) => p.kinds.marathon >= 3 },
  { id: 'hundred-hours', icon: '💯', earned: (p) => p.focusMs >= 100 * 60 * 60 * 1000 },
  { id: 'week-streak', icon: '🔥', earned: (p) => p.bestStreak >= 7 },
  { id: 'friendly', icon: '🤝', earned: (p) => p.friends >= 5 },
  { id: 'chatty', icon: '💬', earned: (p) => p.messages >= 100 },
  { id: 'regular', icon: '🏠', earned: (p) => p.timeMs >= 24 * 60 * 60 * 1000 },
];

export function earnedBadges(profile: Profile): Badge[] {
  return BADGES.filter((badge) => badge.earned(profile));
}

/** A time zone offset in minutes, as clients send it; anything else is UTC. */
export function cleanOffset(offset: unknown): number {
  return typeof offset === 'number' && Number.isInteger(offset) && offset >= -720 && offset <= 840
    ? offset
    : 0;
}
