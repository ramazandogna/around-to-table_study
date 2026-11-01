import { quartersDone } from '@att/shared';
import { useEffect, useRef, useState } from 'react';
import { play } from '../audio/sound';
import { t } from '../i18n/t';
import { layerIndex, useGameStore } from '../state/store';
import { formatDuration, recordFocus, todayStats } from '../state/stats';
import { formatClock } from '../state/study';

/**
 * The player's own study session, centered at the top. Other people's timers
 * show on their name tags.
 *
 * A focus block counts down; each quarter rings a soft bell for the player
 * alone, even in the quiet library, and the end is celebrated for the room.
 * With rounds left a break follows on its own, suggesting a walk to the
 * smoking room; the next round only starts when the player says so.
 */
export function TimerHud() {
  const layers = useGameStore((s) => s.layers);
  const timer = useGameStore((s) => s.timer);
  const session = useGameStore((s) => s.study);
  const dnd = useGameStore((s) => s.dnd);
  const [now, setNow] = useState(() => Date.now());

  const running = timer !== null || session !== null;
  useEffect(() => {
    if (!running) return;
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(tick);
  }, [running]);

  const left = timer ? timer.endsAt - now : 0;
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
    // The block is done: celebrate, count it, then a break or the end.
    play('finish');
    store.connection?.finished();
    store.setNotice('finished');
    recordFocus(timer.totalMs, true);
    const current = store.study;
    const rhythm = current?.rhythm;
    if (current && rhythm && current.round < rhythm.rounds && rhythm.breakMinutes > 0) {
      store.beginBreak(rhythm.breakMinutes);
      if (store.dnd) store.setDnd(false);
    } else if (current && rhythm && current.round < rhythm.rounds) {
      store.nextRound();
    } else {
      store.finishStudy();
    }
  }, [timer, quarters]);

  // A break that ran out waits for the player to start the next round.
  const breakLeft =
    session?.phase === 'break' && session.breakEndsAt ? session.breakEndsAt - now : 0;
  useEffect(() => {
    if (session?.phase !== 'break' || breakLeft > 0) return;
    play('quarter');
    useGameStore.getState().breakOver();
  }, [session?.phase, breakLeft]);

  // A timer that starts comes up on top of the plate and the map.
  useEffect(() => {
    if (running) useGameStore.getState().raise('timer');
  }, [running]);

  if (!running) return null;
  const store = useGameStore.getState();
  const rhythm = session?.rhythm;
  const round =
    rhythm && session ? t('timer.round', { n: session.round, of: rhythm.rounds }) : null;

  /** Stops early: the time focused so far still counts. */
  const stop = () => {
    if (timer) recordFocus(timer.totalMs - Math.max(0, timer.endsAt - Date.now()), false);
    if (session?.phase === 'free') recordFocus(Date.now() - session.startedAt, false);
    store.stopTimer();
  };

  let body;
  if (session?.phase === 'break') {
    const inBreakRoom = store.area === 'smoking';
    body = (
      <>
        <p className="timer-phase">☕ {t('timer.break')}</p>
        <div className="timer-row">
          <span className="timer-clock" role="timer">
            {formatClock(breakLeft)}
          </span>
          <StopButton onStop={stop} />
        </div>
        <p className="timer-tip">{t(inBreakRoom ? 'timer.break.here' : 'timer.break.tip')}</p>
      </>
    );
  } else if (session?.phase === 'between') {
    body = (
      <>
        <p className="timer-done">{t('timer.next', { n: session.round + 1 })}</p>
        <div className="panel-actions">
          <button type="button" className="panel-button" onClick={stop}>
            {t('timer.finish')}
          </button>
          <button type="button" className="panel-ok" onClick={store.nextRound}>
            {t('timer.go')}
          </button>
        </div>
      </>
    );
  } else if (session?.phase === 'free') {
    body = (
      <>
        <p className="timer-phase">⏱️ {t('timer.free')}</p>
        <div className="timer-row">
          <span className="timer-clock" role="timer">
            {formatClock(now - session.startedAt)}
          </span>
          <StopButton onStop={stop} />
        </div>
      </>
    );
  } else if (session?.phase === 'done') {
    const today = todayStats();
    body = (
      <>
        <p className="timer-done">{t('timer.done')}</p>
        <p className="timer-tip">
          {t('plan.today', { time: formatDuration(today.focusMs), blocks: today.blocks })}
        </p>
        <div className="panel-actions">
          <button
            type="button"
            className="panel-button"
            onClick={() => {
              store.setSitStep('timer');
              store.stopTimer();
            }}
          >
            {t('timer.again')}
          </button>
          <button
            type="button"
            className="panel-ok"
            onClick={() => {
              store.stopTimer();
            }}
          >
            {t('timer.close')}
          </button>
        </div>
      </>
    );
  } else if (timer) {
    const progress = Math.min(1, Math.max(0, 1 - left / timer.totalMs));
    body = (
      <>
        {round && <p className="timer-phase">🎯 {round}</p>}
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
          <StopButton onStop={stop} />
        </div>
        <div className="timer-bar" aria-hidden>
          <div className="timer-bar-fill" style={{ width: `${progress * 100}%` }} />
        </div>
      </>
    );
  } else {
    return null;
  }

  return (
    <section
      className="panel panel--compact timer-hud"
      style={{ zIndex: layerIndex(layers, 'timer') }}
      aria-label={t('timer.title')}
    >
      {body}
    </section>
  );
}

function StopButton({ onStop }: { onStop: () => void }) {
  return (
    <button
      type="button"
      className="icon-button"
      title={t('timer.stop')}
      aria-label={t('timer.stop')}
      onClick={onStop}
    >
      ✕
    </button>
  );
}
