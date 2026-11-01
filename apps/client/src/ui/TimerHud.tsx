import { quartersDone } from '@att/shared';
import { useEffect, useRef, useState } from 'react';
import { play } from '../audio/sound';
import { t } from '../i18n/t';
import { useGameStore } from '../state/store';
import { formatClock } from '../state/study';

/** The player's own timer, centered at the top. Other people's timers show on their name tags. */
export function TimerHud() {
  const timer = useGameStore((s) => s.timer);
  const dnd = useGameStore((s) => s.dnd);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!timer) return;
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(tick);
  }, [timer]);

  const left = timer ? timer.endsAt - now : 0;
  const done = timer !== null && left <= 0;

  // Each quarter rings a soft bell for the player alone, even in the quiet library;
  // the last one is the finish, which everyone in the room sees.
  const quarters = timer
    ? quartersDone({ totalMs: timer.totalMs, remainingMs: Math.max(0, left) })
    : 0;
  const rung = useRef<{ timer: typeof timer; quarters: number }>({ timer: null, quarters: 0 });
  useEffect(() => {
    if (!timer) return;
    if (rung.current.timer !== timer) rung.current = { timer, quarters };
    if (quarters <= rung.current.quarters) return;
    rung.current.quarters = quarters;
    const store = useGameStore.getState();
    if (quarters < 4) {
      play('quarter');
      return;
    }
    play('finish');
    store.connection?.finished();
    store.setNotice('finished');
  }, [timer, quarters]);

  // Do not disturb belongs to the timer; it ends when the time is up.
  useEffect(() => {
    if (done && useGameStore.getState().dnd) useGameStore.getState().setDnd(false);
  }, [done]);

  if (!timer) return null;
  const store = useGameStore.getState();
  const progress = Math.min(1, Math.max(0, 1 - left / timer.totalMs));

  return (
    <section className="panel panel--compact timer-hud" aria-label={t('timer.title')}>
      {done ? (
        <>
          <p className="timer-done">{t('timer.done')}</p>
          <div className="panel-actions">
            <button
              type="button"
              className="panel-button"
              onClick={() => store.startTimer(timer.totalMs / 60_000, false)}
            >
              {t('timer.again')}
            </button>
            <button type="button" className="panel-ok" onClick={store.stopTimer}>
              {t('timer.close')}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="timer-row">
            <span className="timer-clock" role="timer">
              {formatClock(left)}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-pressed={dnd}
              title={t('timer.dnd')}
              aria-label={t('timer.dnd')}
              onClick={() => store.setDnd(!dnd)}
            >
              {dnd ? '🔕' : '🔔'}
            </button>
            <button
              type="button"
              className="icon-button"
              title={t('timer.stop')}
              aria-label={t('timer.stop')}
              onClick={store.stopTimer}
            >
              ✕
            </button>
          </div>
          <div className="timer-bar" aria-hidden>
            <div className="timer-bar-fill" style={{ width: `${progress * 100}%` }} />
          </div>
        </>
      )}
    </section>
  );
}
