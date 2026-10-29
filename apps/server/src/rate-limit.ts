export type RateWindow = { start: number; count: number };

/**
 * Fixed-window limiter: at most `limit` events per `windowMs`.
 * Returns the updated window, or null when the event must be rejected.
 */
export function takeToken(
  window: RateWindow,
  now: number,
  limit: number,
  windowMs: number,
): RateWindow | null {
  if (now - window.start >= windowMs) return { start: now, count: 1 };
  return window.count < limit ? { start: window.start, count: window.count + 1 } : null;
}
