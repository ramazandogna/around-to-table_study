import { t } from '../i18n/t';
import { useGameStore } from '../state/store';
import { ACTIVITY_ICON } from '../state/study';

/** While seated: change what you work on, or start a timer later. */
export function SeatBar() {
  const seated = useGameStore((s) => s.seated);
  const sitStep = useGameStore((s) => s.sitStep);
  const activity = useGameStore((s) => s.activity);
  const timer = useGameStore((s) => s.timer);
  if (!seated || sitStep) return null;
  const ask = useGameStore.getState().setSitStep;

  return (
    <div className="seat-bar">
      <button type="button" className="chip" onClick={() => ask('activity')}>
        {activity ? `${ACTIVITY_ICON[activity]} ${t(`activity.${activity}`)}` : '🪑'}
        <span className="chip-hint">{t('seat.change')}</span>
      </button>
      {!timer && (
        <button type="button" className="chip" onClick={() => ask('timer')}>
          ⏱ {t('seat.timer')}
        </button>
      )}
    </div>
  );
}
