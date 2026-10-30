import { ACTIVITIES, TIMER_PRESETS_MINUTES, type Activity } from '@att/shared';
import { useEffect, useState } from 'react';
import { t } from '../i18n/t';
import { readJson, writeJson } from '../net/storage';
import { useGameStore } from '../state/store';
import { ACTIVITY_ICON } from '../state/study';
import { Check, Choice, Dialog, Panel } from './Panel';

const LAST_CHOICES_KEY = 'att.lastSit';
type LastChoices = { activity?: Activity; minutes?: number; dnd?: boolean };

/** 0 means no timer. */
const TIMER_CHOICES = [0, ...TIMER_PRESETS_MINUTES] as const;
const TIMER_ICON: Record<(typeof TIMER_CHOICES)[number], string> = {
  0: '🪑',
  25: '🍅',
  50: '⏳',
  60: '🕐',
};

/** The questions after sitting down: what you will work on, then whether you want a timer. */
export function SitDialog() {
  const step = useGameStore((s) => s.sitStep);
  if (!step) return null;
  return <Dialog>{step === 'activity' ? <ActivityStep /> : <TimerStep />}</Dialog>;
}

function ActivityStep() {
  const current = useGameStore((s) => s.activity);
  const last = readJson<LastChoices>(LAST_CHOICES_KEY);
  const selected = current ?? last?.activity;

  function choose(activity: Activity) {
    writeJson(LAST_CHOICES_KEY, { ...last, activity });
    const store = useGameStore.getState();
    store.setActivity(activity);
    // A timer already running (back from a break) is kept, so there is nothing more to ask.
    store.setSitStep(store.timer ? null : 'timer');
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

function TimerStep() {
  const last = readJson<LastChoices>(LAST_CHOICES_KEY);
  const [minutes, setMinutes] = useState<number>(last?.minutes ?? 25);
  const [dnd, setDnd] = useState(last?.dnd ?? false);

  function confirm(chosen = minutes) {
    writeJson(LAST_CHOICES_KEY, { ...last, minutes: chosen, dnd });
    const store = useGameStore.getState();
    if (chosen > 0) store.startTimer(chosen, dnd);
    store.setSitStep(null);
  }

  useShortcuts(
    (n) => {
      const choice = TIMER_CHOICES[n - 1];
      if (choice !== undefined) setMinutes(choice);
    },
    () => useGameStore.getState().setSitStep(null),
    () => confirm(),
  );

  return (
    <Panel title={t('sit.timer.title')} className="panel--dialog">
      <div className="choice-grid">
        {TIMER_CHOICES.map((choice, i) => (
          <Choice
            key={choice}
            icon={TIMER_ICON[choice]}
            label={t(choice ? `sit.timer.${choice}` : 'sit.timer.none')}
            hint={t(choice ? `sit.timer.${choice}.hint` : 'sit.timer.none.hint')}
            shortcut={i + 1}
            selected={choice === minutes}
            onSelect={() => setMinutes(choice)}
          />
        ))}
      </div>
      <Check
        label={t('sit.dnd')}
        hint={t('sit.dnd.hint')}
        checked={dnd && minutes > 0}
        disabled={minutes === 0}
        onChange={setDnd}
      />
      <div className="panel-actions">
        <button
          type="button"
          className="panel-button"
          onClick={() => useGameStore.getState().setSitStep('activity')}
        >
          {t('sit.back')}
        </button>
        <button type="button" className="panel-ok" onClick={() => confirm()}>
          {t('sit.ok')}
        </button>
      </div>
    </Panel>
  );
}

/** Number keys pick a choice, Escape closes and Enter confirms. */
function useShortcuts(pick: (n: number) => void, close: () => void, confirm?: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (useGameStore.getState().typing) return;
      const n = Number(event.key);
      if (n >= 1 && n <= 9) pick(n);
      else if (event.key === 'Escape') close();
      else if (event.key === 'Enter' && confirm) confirm();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
}
