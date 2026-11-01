import { STALE_MS } from './constants';

/**
 * Whether a socket no longer stands for someone who is really there: nothing
 * from it (no heartbeat, nor the connect itself) for longer than STALE_MS.
 * `lastPing` is when the server last answered its heartbeat, if ever.
 */
export function isStale(now: number, connectedAt: number, lastPing: number | null): boolean {
  return now - Math.max(connectedAt, lastPing ?? 0) > STALE_MS;
}
