/**
 * What a seated person is doing, shown to others as props on the table, plus
 * their optional study timer and "do not disturb" flag.
 */
export const ACTIVITIES = ['focus', 'reading', 'online', 'quiet'] as const;
export type Activity = (typeof ACTIVITIES)[number];

/** Timer lengths offered when sitting down. */
export const TIMER_PRESETS_MINUTES = [25, 50, 60] as const;
/** Longest timer anyone can run. */
export const MAX_TIMER_MS = 3 * 60 * 60 * 1000;

/**
 * Timers travel as "time left" rather than a clock time, so clients with
 * wrong clocks still agree on how long someone has left.
 */
export type TimerStatus = { remainingMs: number; totalMs: number };

export type StudyStatus = {
  /** Only set while seated; standing up clears it. */
  activity: Activity | null;
  timer: TimerStatus | null;
  /** Do not disturb: others see it, and the person's own screen hides chatter. */
  dnd: boolean;
};

export const IDLE_STATUS: StudyStatus = { activity: null, timer: null, dnd: false };
