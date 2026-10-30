import { AREA_RULES } from '@att/shared';
import { ANNOUNCEMENTS } from '../content/announcements';
import { t } from '../i18n/t';
import { useGameStore } from '../state/store';
import { Panel } from './Panel';

/** The board's rules and this week's events, shown while standing next to it. */
export function NoticeBoard() {
  const open = useGameStore((s) => s.boardOpen);
  if (!open) return null;
  const library = AREA_RULES.library;

  return (
    <Panel title={t('board.title')} className="panel--compact notice-board">
      <button
        type="button"
        className="icon-button player-card-close"
        aria-label={t('card.close')}
        onClick={() => useGameStore.getState().setBoardOpen(false)}
      >
        ✕
      </button>
      <h3 className="board-heading">📜 {t('board.rules')}</h3>
      <ul className="board-list">
        <li>{t('rules.kind')}</li>
        <li>
          {t('rules.library', {
            chars: library.maxChars,
            seconds: Math.round(library.cooldownMs / 1000),
          })}
        </li>
        <li>{t('rules.timer')}</li>
        <li>{t('rules.dnd')}</li>
        <li>{t('rules.social')}</li>
        <li>{t('rules.spam')}</li>
      </ul>
      <h3 className="board-heading">📅 {t('board.events')}</h3>
      {ANNOUNCEMENTS.length === 0 ? (
        <p className="board-empty">{t('board.events.none')}</p>
      ) : (
        <ul className="board-list board-events">
          {ANNOUNCEMENTS.map((a) => (
            <li key={`${a.when}${a.title}`}>
              <b>{a.when}</b> {a.title}
              {a.text && <span className="board-event-text">{a.text}</span>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
