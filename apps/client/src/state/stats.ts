import { t } from '../i18n/t';
import { readJson, writeJson } from '../net/storage';

/**
 * How much the player studied, kept on this device only: time focused today,
 * blocks finished today and how many days in a row they studied. Nobody else
 * sees it and there are no rankings; it is there to feel good about the day.
 */
export type Stats = {
  /** The local day these numbers are for, as YYYY-MM-DD. */
  day: string;
  focusMs: number;
  blocks: number;
  /** Days studied in a streak, today included once it has some. Up to two rest days in any week do not break it. */
  streak: number;
  /** The last day with focus time. */
  lastDay: string | null;
  /** The rest days the streak has absorbed in the last week (YYYY-MM-DD). */
  rest?: string[];
  /** The day the daily goal was last reached, so it is cheered once. */
  goalDay?: string | null;
  /** All the focus time ever kept on this device, for the character select screen. */
  totalMs?: number;
  /** The last earlier day with focus time, for the welcome-back line. */
  prev?: { day: string; focusMs: number };
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

/* ---------- Gentle streaks: two rest days a week are allowed ---------- */

/** The most rest days a streak forgives in any 7 days. */
export const REST_DAYS_PER_WEEK = 2;
const WEEK_DAYS = 7;

/** A day as a whole number, so days can be counted (UTC avoids daylight-saving surprises). */
const dayNumber = (day: string) => {
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

const dayFromNumber = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);

/**
 * Where the streak stands if the player studies on `today`: the rest days it
 * has to forgive (the unstudied days since the last one, and those already
 * forgiven within the last week), or null when that is more than two and the
 * streak is over.
 */
function restedDays(
  lastDay: string | null,
  rest: readonly string[] | undefined,
  today: string,
): string[] | null {
  if (!lastDay) return null;
  const last = dayNumber(lastDay);
  const now = dayNumber(today);
  if (now <= last) return [...(rest ?? [])];
  const gap = Array.from({ length: now - last - 1 }, (_, i) => dayFromNumber(last + 1 + i));
  const recent = [...(rest ?? []), ...gap].filter((day) => dayNumber(day) > now - WEEK_DAYS);
  return recent.length <= REST_DAYS_PER_WEEK ? recent : null;
}

/** The streak as shown today, before any studying: kept while the rest days still fit the week. */
export function liveStreak(
  saved: Pick<Stats, 'streak' | 'lastDay' | 'rest'> | null | undefined,
  today: string,
): number {
  if (!saved?.lastDay) return 0;
  return restedDays(saved.lastDay, saved.rest, today) ? saved.streak : 0;
}

/** The streak and rest days after studying on `today` (a day not yet counted). */
export function streakAfterStudying(
  saved: Pick<Stats, 'streak' | 'lastDay' | 'rest'>,
  today: string,
): { streak: number; rest: string[] } {
  const rest = restedDays(saved.lastDay, saved.rest, today);
  return rest ? { streak: saved.streak + 1, rest } : { streak: 1, rest: [] };
}

/** Today's numbers; a new day starts at zero, and more than two rest days in a week end the streak. */
export function todayStats(now = Date.now(), saved = readJson<Stats>(STATS_KEY)): Stats {
  const today = dayOf(now);
  const streak = liveStreak(saved, today);
  if (!saved || saved.day !== today) {
    return {
      day: today,
      focusMs: 0,
      blocks: 0,
      streak,
      lastDay: saved?.lastDay ?? null,
      ...(saved?.rest ? { rest: saved.rest } : {}),
      totalMs: saved?.totalMs ?? 0,
      ...(saved && saved.focusMs > 0
        ? { prev: { day: saved.day, focusMs: saved.focusMs } }
        : saved?.prev
          ? { prev: saved.prev }
          : {}),
    };
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
    totalMs: (stats.totalMs ?? 0) + Math.max(0, ms),
  };
  if (next.focusMs >= STREAK_MIN_MS && next.lastDay !== next.day) {
    const after = streakAfterStudying(next, next.day);
    next.streak = after.streak;
    next.rest = after.rest;
    next.lastDay = next.day;
  }
  writeJson(STATS_KEY, next);
  addGoalTime(ms, now);
  if (ms > 0) for (const listener of focusListeners) listener();
  return next;
}

/** The player's own daily goal, in minutes of focus (on this device, seen by nobody else). */
export function dailyGoal(saved = readJson<{ minutes?: number }>(GOAL_KEY)?.minutes): number {
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

/* ---------- Goals: what the player means to do today ---------- */

/** Ready-made goals; their names live in the translations (`goal.preset.<id>`). */
export const GOAL_PRESETS = [
  { id: 'read', icon: '📖', minutes: 60 },
  { id: 'problems', icon: '🧮', minutes: 45 },
  { id: 'revise', icon: '🗂️', minutes: 45 },
  { id: 'write', icon: '✍️', minutes: 30 },
  { id: 'language', icon: '🗣️', minutes: 30 },
  { id: 'code', icon: '💻', minutes: 60 },
  { id: 'memorize', icon: '🧠', minutes: 25 },
  { id: 'project', icon: '🛠️', minutes: 90 },
] as const;
export type GoalPresetId = (typeof GOAL_PRESETS)[number]['id'];
/** Minutes a goal can be set to. */
export const GOAL_MINUTES = [15, 25, 30, 45, 60, 90, 120, 180] as const;
export const MAX_GOALS = 5;
export const GOAL_TEXT_MAX = 40;

export type Goal = {
  id: string;
  /** A ready-made goal, or null for one in the player's own words (`text`). */
  preset: GoalPresetId | null;
  text: string;
  minutes: number;
  /** Focus time put into it today. */
  doneMs: number;
};

/** The goals, and which one the focus time goes to now. Progress starts over each day. */
export type Goals = { day: string; list: Goal[]; current: string | null };

const GOALS_KEY = 'att.goals';

export function loadGoals(now = Date.now(), saved = readJson<Goals>(GOALS_KEY)): Goals {
  const today = dayOf(now);
  const list = Array.isArray(saved?.list) ? saved.list.slice(0, MAX_GOALS) : [];
  if (!saved || saved.day === today) return { day: today, list, current: saved?.current ?? null };
  // A new day: the same goals, nothing done yet.
  return { day: today, list: list.map((goal) => ({ ...goal, doneMs: 0 })), current: saved.current };
}

export function saveGoals(goals: Goals): void {
  writeJson(GOALS_KEY, goals);
}

export const goalDone = (goal: Goal) => goal.doneMs >= goal.minutes * 60_000;

/** Which goal focus time goes to: the one picked, or else the first one not done yet. */
export function currentGoal(goals: Goals): Goal | null {
  const picked = goals.list.find((goal) => goal.id === goals.current && !goalDone(goal));
  return picked ?? goals.list.find((goal) => !goalDone(goal)) ?? null;
}

/** Focus time goes to the current goal; the goals finished by it are told to whoever listens. */
export function addGoalTime(ms: number, now = Date.now()): Goal[] {
  if (ms <= 0) return [];
  const goals = loadGoals(now);
  const goal = currentGoal(goals);
  if (!goal) return [];
  const before = goalDone(goal);
  const next = { ...goal, doneMs: goal.doneMs + ms };
  saveGoals({ ...goals, list: goals.list.map((g) => (g.id === goal.id ? next : g)) });
  const finished = !before && goalDone(next) ? [next] : [];
  for (const listener of goalListeners) listener(finished);
  return finished;
}

const focusListeners = new Set<() => void>();

/** Called whenever focus time is kept (for today's "study a while" task). */
export function onFocus(listener: () => void): () => void {
  focusListeners.add(listener);
  return () => focusListeners.delete(listener);
}

const goalListeners = new Set<(finished: Goal[]) => void>();

/** Called whenever focus time moved a goal on; returns a function to stop listening. */
export function onGoalTime(listener: (finished: Goal[]) => void): () => void {
  goalListeners.add(listener);
  return () => goalListeners.delete(listener);
}

/* ---------- Time in the world, for the character select screen ---------- */

const PLAYED_KEY = 'att.played';

/** All the time spent in the world on this device as this character. */
export function timePlayed(saved = readJson<number>(PLAYED_KEY)): number {
  return typeof saved === 'number' && saved > 0 ? saved : 0;
}

export function addTimePlayed(ms: number): void {
  writeJson(PLAYED_KEY, timePlayed() + Math.max(0, ms));
}
