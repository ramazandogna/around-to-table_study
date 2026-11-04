import { t } from '../i18n/t';
import { readJson, writeJson } from '../net/storage';

/**
 * How much the player studied, kept on this device only: time focused today,
 * blocks finished today and how many days in a row they studied. Nobody else
 * sees it and there are no rankings; it is there to feel good about the day.
 */
type Stats = {
  /** The local day these numbers are for, as YYYY-MM-DD. */
  day: string;
  focusMs: number;
  blocks: number;
  /** Days in a row with any focus time, today included once it has some. */
  streak: number;
  /** The last day with focus time. */
  lastDay: string | null;
  /** The day the daily goal was last reached, so it is cheered once. */
  goalDay?: string | null;
};

const STATS_KEY = 'att.stats';
const GOAL_KEY = 'att.goal';
/** Daily goals the player can pick, in minutes of focus. */
export const GOALS = [30, 60, 120, 180, 240] as const;
const DEFAULT_GOAL = 60;
/** Less than this does not count as studying for the streak. */
const STREAK_MIN_MS = 5 * 60_000;

const dayOf = (time: number) => {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const yesterdayOf = (time: number) => dayOf(time - 24 * 60 * 60_000);

/** Today's numbers; a new day starts at zero, and a missed day ends the streak. */
export function todayStats(now = Date.now()): Stats {
  const today = dayOf(now);
  const saved = readJson<Stats>(STATS_KEY);
  const streak =
    saved?.lastDay === today || saved?.lastDay === yesterdayOf(now) ? (saved?.streak ?? 0) : 0;
  if (!saved || saved.day !== today) {
    return { day: today, focusMs: 0, blocks: 0, streak, lastDay: saved?.lastDay ?? null };
  }
  return { ...saved, streak };
}

/** Adds focused time; `finished` when a whole block was done. */
export function recordFocus(ms: number, finished: boolean, now = Date.now()): Stats {
  const stats = todayStats(now);
  if (ms <= 0 && !finished) return stats;
  const next = {
    ...stats,
    focusMs: stats.focusMs + Math.max(0, ms),
    blocks: stats.blocks + (finished ? 1 : 0),
  };
  if (next.focusMs >= STREAK_MIN_MS && next.lastDay !== next.day) {
    next.streak = next.lastDay === yesterdayOf(now) ? next.streak + 1 : 1;
    next.lastDay = next.day;
  }
  writeJson(STATS_KEY, next);
  return next;
}

/** The player's own daily goal, in minutes of focus (on this device, seen by nobody else). */
export function dailyGoal(): number {
  const saved = readJson<{ minutes?: number }>(GOAL_KEY)?.minutes;
  return GOALS.find((g) => g === saved) ?? DEFAULT_GOAL;
}

/** The next goal in the list, round again after the last. */
export function nextGoal(): number {
  const goal = GOALS[(GOALS.indexOf(dailyGoal() as (typeof GOALS)[number]) + 1) % GOALS.length];
  writeJson(GOAL_KEY, { minutes: goal });
  return goal ?? DEFAULT_GOAL;
}

/**
 * Whether today's goal was just reached: true once a day, the first time the
 * focus time passes it, so the game can cheer.
 */
export function goalJustReached(now = Date.now()): boolean {
  const stats = todayStats(now);
  if (stats.focusMs < dailyGoal() * 60_000 || stats.goalDay === stats.day) return false;
  writeJson(STATS_KEY, { ...stats, goalDay: stats.day });
  return true;
}

/** "1h 25m" or "40m". */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  return hours > 0
    ? t('duration.hours', { h: hours, m: minutes % 60 })
    : t('duration.minutes', { m: minutes });
}
