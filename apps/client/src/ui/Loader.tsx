import { APP_NAME } from '@att/shared';
import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/t';
import { useGameStore } from '../state/store';

/** One bounce of the logo, in milliseconds; the loader always ends on a whole one. */
export const LOADER_CYCLE_MS = 1200;
/** It never shows for less than this, so a quick change does not flash. */
const MIN_MS = LOADER_CYCLE_MS * 2;
/** A room that never answers does not keep the loader up forever. */
const MAX_MS = 8000;

/**
 * Between rooms, and while the building first loads: the logo bouncing on a
 * wooden card, with a little line of what is happening. However long the wait
 * really is, the loader runs to the end of a bounce, so it always looks the
 * same and never flickers.
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
    // Round the wait up to whole bounces, and to the least wait.
    const elapsed = performance.now() - startedAt.current;
    const total = Math.max(MIN_MS, Math.ceil(elapsed / LOADER_CYCLE_MS) * LOADER_CYCLE_MS);
    const timer = window.setTimeout(() => setShown(false), total - elapsed);
    return () => window.clearTimeout(timer);
  }, [loading]);

  if (!shown) return null;
  return (
    <div className="loader" role="status" aria-live="polite">
      <div className="loader-card">
        <img
          className="loader-logo"
          src="/logo.png"
          alt=""
          style={{ animationDuration: `${LOADER_CYCLE_MS}ms` }}
        />
        <p className="loader-name">{APP_NAME}</p>
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
