import { APP_NAME } from '@att/shared';
import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/t';
import { useGameStore } from '../state/store';

/** One bounce of the logo, in milliseconds. */
export const LOADER_CYCLE_MS = 900;
/** Just long enough that a quick change does not flash. */
const MIN_MS = 300;
/** A room that never answers does not keep the loader up for long. */
const MAX_MS = 4000;

/**
 * Between rooms, and while the building first loads: the logo bouncing on a
 * wooden card. It goes the moment the room is ready, kept up only long enough
 * not to flash.
 */
export function Loader() {
  const loading = useGameStore((s) => s.loading);
  const [shown, setShown] = useState(loading);
  const startedAt = useRef(0);

  useEffect(() => {
    if (loading) {
      startedAt.current = performance.now();
      const show = window.setTimeout(() => setShown(true), 0);
      const giveUp = window.setTimeout(() => useGameStore.getState().setLoading(false), MAX_MS);
      return () => {
        window.clearTimeout(show);
        window.clearTimeout(giveUp);
      };
    }
    // Gone as soon as the room is there, after the least wait.
    const elapsed = performance.now() - startedAt.current;
    const timer = window.setTimeout(() => setShown(false), Math.max(0, MIN_MS - elapsed));
    return () => window.clearTimeout(timer);
  }, [loading]);

  if (!shown) return null;
  return (
    <div className="loader" role="status" aria-live="polite">
      <div className="loader-card">
        <img
          className="loader-logo"
          src="/logo.png"
          alt={APP_NAME}
          style={{ animationDuration: `${LOADER_CYCLE_MS}ms` }}
        />
        <p className="loader-line">{t('loader.line')}</p>
        <span className="loader-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      </div>
    </div>
  );
}
