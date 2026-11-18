import { useEffect, useState } from 'react';
import { t } from '../i18n/t';
import { useGameStore } from '../state/store';
import { Dialog, Panel } from './Panel';
import { leaveToSelect } from '../net/enter';

/** Seconds before "Exit" can be pressed, so it is never pressed by mistake. */
const COUNTDOWN = 3;

/**
 * The menu's way out: a short countdown, then out of the world to the
 * character select screen (the server sees the player leave). From there
 * "Join" comes straight back.
 */
export function ExitLink() {
  return (
    <button
      type="button"
      className="hud-link"
      onClick={() => useGameStore.getState().setExitOpen(true)}
    >
      <span className="hud-icon" aria-hidden>
        🚪
      </span>
      <span className="hud-label">{t('exit.button')}</span>
    </button>
  );
}

/** The question itself, mounted beside the world so the menu that asked can close. */
export function ExitGame() {
  const open = useGameStore((s) => s.exitOpen);
  if (!open) return null;
  return <ExitDialog onClose={() => useGameStore.getState().setExitOpen(false)} />;
}

function ExitDialog({ onClose }: { onClose: () => void }) {
  const [left, setLeft] = useState(COUNTDOWN);

  useEffect(() => {
    if (left <= 0) return;
    const timer = window.setTimeout(() => setLeft(left - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [left]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function exit() {
    const store = useGameStore.getState();
    // On a phone the dock comes back folded; a desktop keeps its dock.
    if (window.matchMedia('(max-width: 700px)').matches) store.setPlateOpen(false);
    store.setMenuOpen(false);
    // The question lives in the store now: closed here, it does not greet the player on the way back in.
    store.setExitOpen(false);
    leaveToSelect();
  }

  return (
    <Dialog>
      <Panel title={`🚪 ${t('exit.title')}`} className="panel--dialog exit-panel">
        <p className="panel-text">{t('exit.text')}</p>
        <div className="panel-actions">
          <button type="button" className="panel-button" onClick={onClose}>
            {t('exit.stay')}
          </button>
          <button
            type="button"
            className="panel-ok exit-confirm"
            disabled={left > 0}
            aria-live="polite"
            onClick={exit}
          >
            {left > 0 ? t('exit.wait', { count: left }) : t('exit.confirm')}
          </button>
        </div>
      </Panel>
    </Dialog>
  );
}
