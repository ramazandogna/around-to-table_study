import { chance } from '@att/shared';
import { readJson, writeJson } from '../net/storage';

/**
 * Small things to do today for someone who did not come to study: three a
 * day, picked by the date so everyone in the building has the same three,
 * and ticked off by playing (no buttons to press). Next to them, a
 * collection of everything found on the shelves and walls so far.
 * Kept on this device, per character.
 */

export const DAILY_TASKS = [
  { id: 'smoking', icon: '☕' },
  { id: 'conference', icon: '🎤' },
  { id: 'painting', icon: '🖼️' },
  { id: 'shelf', icon: '📚' },
  { id: 'game', icon: '🎲' },
  { id: 'dance', icon: '💃' },
  { id: 'lost', icon: '🧤' },
  { id: 'chat', icon: '💬' },
  { id: 'study', icon: '⏱️' },
] as const;
export type DailyTaskId = (typeof DAILY_TASKS)[number]['id'];
export const DAILY_COUNT = 3;

type Daily = { day: string; done: DailyTaskId[] };
type Found = string[];

const DAILY_KEY = 'att.daily';
const FOUND_KEY = 'att.found';

const today = (now = Date.now()) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Today's three tasks: the same for everyone on the same date. */
export function todaysTasks(now = Date.now()): (typeof DAILY_TASKS)[number][] {
  const d = new Date(now);
  const seed = d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate();
  const order = [...DAILY_TASKS].sort(
    (a, b) =>
      chance(seed * 31 + DAILY_TASKS.indexOf(a)) - chance(seed * 31 + DAILY_TASKS.indexOf(b)),
  );
  return order.slice(0, DAILY_COUNT);
}

export function dailyDone(now = Date.now()): DailyTaskId[] {
  const saved = readJson<Daily>(DAILY_KEY);
  return saved?.day === today(now) && Array.isArray(saved.done) ? saved.done : [];
}

/** Ticks a task off, if it is one of today's; true when this finished it just now. */
export function markTask(id: DailyTaskId, now = Date.now()): boolean {
  if (!todaysTasks(now).some((task) => task.id === id)) return false;
  const done = dailyDone(now);
  if (done.includes(id)) return false;
  writeJson(DAILY_KEY, { day: today(now), done: [...done, id] });
  return true;
}

/** Things found on the shelves and walls, as `kind:index:pick`; true when it is new. */
export function remember(key: string): boolean {
  const found = readJson<Found>(FOUND_KEY) ?? [];
  if (found.includes(key)) return false;
  writeJson(FOUND_KEY, [...found, key].slice(-500));
  return true;
}

export function foundCount(): number {
  return (readJson<Found>(FOUND_KEY) ?? []).length;
}
