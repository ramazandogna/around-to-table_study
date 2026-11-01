import { ACTIVITIES, type Activity } from '@att/shared';
import { useEffect } from 'react';
import { t } from '../i18n/t';
import { readJson, writeJson } from '../net/storage';
import { useGameStore } from '../state/store';
import { ACTIVITY_ICON } from '../state/study';
import { Choice, Dialog, Panel } from './Panel';
import { StudyRing } from './StudyRing';

const LAST_CHOICES_KEY = 'att.lastSit';
type LastChoices = { activity?: Activity };

/** The questions after sitting down: what you will work on, then how you want to study. */
export function SitDialog() {
  const step = useGameStore((s) => s.sitStep);
  if (!step) return null;
  return <Dialog>{step === 'activity' ? <ActivityStep /> : <StudyRing />}</Dialog>;
}

function ActivityStep() {
  const current = useGameStore((s) => s.activity);
  const last = readJson<LastChoices>(LAST_CHOICES_KEY);
  const selected = current ?? last?.activity;

  function choose(activity: Activity) {
    writeJson(LAST_CHOICES_KEY, { ...last, activity });
    const store = useGameStore.getState();
    store.setActivity(activity);
    // A session already going (back from a break) is kept, so there is nothing more to ask.
    store.setSitStep(store.timer || store.study ? null : 'timer');
  }

  useShortcuts(
    (n) => {
      const activity = ACTIVITIES[n - 1];
      if (activity) choose(activity);
    },
    () => useGameStore.getState().setSitStep(null),
  );

  return (
    <Panel title={t('sit.activity.title')} className="panel--dialog">
      <div className="choice-grid">
        {ACTIVITIES.map((activity, i) => (
          <Choice
            key={activity}
            icon={ACTIVITY_ICON[activity]}
            label={t(`activity.${activity}`)}
            hint={t(`activity.${activity}.hint`)}
            shortcut={i + 1}
            selected={activity === selected}
            onSelect={() => choose(activity)}
          />
        ))}
      </div>
      <div className="panel-actions">
        <button
          type="button"
          className="panel-button"
          onClick={() => useGameStore.getState().setSitStep(null)}
        >
          {t('sit.skip')}
        </button>
      </div>
    </Panel>
  );
}

/** Number keys pick a choice, Escape closes and Enter confirms. */
function useShortcuts(pick: (n: number) => void, close: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (useGameStore.getState().typing) return;
      const n = Number(event.key);
      if (n >= 1 && n <= 9) pick(n);
      else if (event.key === 'Escape') close();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
}
