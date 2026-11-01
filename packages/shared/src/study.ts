/**
 * What a seated person is doing, shown to others as props on the table, plus
 * their optional study timer and "do not disturb" flag.
 */
export const ACTIVITIES = ['focus', 'reading', 'online', 'quiet'] as const;
export type Activity = (typeof ACTIVITIES)[number];

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

/**
 * How many quarters of a timer are done (0 to 4), from its length and the
 * time left. A small chime marks each one; the fourth is the finish.
 */
export function quartersDone(timer: TimerStatus): number {
  const done = (timer.totalMs - timer.remainingMs) / timer.totalMs;
  return Math.max(0, Math.min(4, Math.floor(done * 4 + 1e-9)));
}

/** A finish may be claimed this long before the server's clock says so (clocks and latency). */
export const FINISH_GRACE_MS = 5_000;

/**
 * Ways to study at a table. Each is a rhythm of focus and breaks; "free" just
 * counts up, and "together" joins someone else's running block so both end at
 * the same moment.
 */
export const STUDY_PLANS = ['pomodoro', 'deep', 'marathon', 'custom', 'free', 'together'] as const;
export type StudyPlanId = (typeof STUDY_PLANS)[number];

export type StudyRhythm = {
  workMinutes: number;
  breakMinutes: number;
  rounds: number;
  /** A longer break after the last round, if any (minutes). */
  longBreakMinutes?: number;
};

export const PLAN_RHYTHMS: Record<'pomodoro' | 'deep' | 'marathon', StudyRhythm> = {
  pomodoro: { workMinutes: 25, breakMinutes: 5, rounds: 4, longBreakMinutes: 15 },
  deep: { workMinutes: 50, breakMinutes: 10, rounds: 2 },
  marathon: { workMinutes: 90, breakMinutes: 15, rounds: 1 },
};

/** What a custom rhythm may be set to. */
export const CUSTOM_LIMITS = {
  workMinutes: { min: 5, max: 180, step: 5 },
  breakMinutes: { min: 0, max: 30, step: 5 },
  rounds: { min: 1, max: 8, step: 1 },
} as const;

/** Keeps a custom rhythm inside the limits, on whole steps. */
export function clampRhythm(rhythm: StudyRhythm): StudyRhythm {
  const fit = (value: number, { min, max, step }: { min: number; max: number; step: number }) =>
    Math.min(max, Math.max(min, Math.round(value / step) * step));
  return {
    workMinutes: fit(rhythm.workMinutes, CUSTOM_LIMITS.workMinutes),
    breakMinutes: fit(rhythm.breakMinutes, CUSTOM_LIMITS.breakMinutes),
    rounds: fit(rhythm.rounds, CUSTOM_LIMITS.rounds),
  };
}
