import { hasProfanity } from '@att/shared';
import { useState, type FormEvent } from 'react';
import { t } from '../i18n/t';
import { useGameStore } from '../state/store';
import {
  currentGoal,
  formatDuration,
  GOAL_MINUTES,
  GOAL_PRESETS,
  GOAL_TEXT_MAX,
  goalDone,
  MAX_GOALS,
  type Goal,
  type GoalPresetId,
} from '../state/stats';
import { PAINTINGS, SHELF_TOPICS } from '../content/discoveries';
import { todaysTasks } from '../state/daily';
import { goalName } from './CharacterSelect';
import { Dialog, Panel } from './Panel';

/** Everything there is to find: every painting and every moment on the shelves. */
const COLLECTIBLES =
  PAINTINGS.length + SHELF_TOPICS.reduce((sum, topic) => sum + topic.moments.length, 0);

const presetIcon = (id: string | null) => GOAL_PRESETS.find((p) => p.id === id)?.icon ?? '🎯';

/** The menu's "Set a goal". */
export function GoalsLink() {
  return (
    <button
      type="button"
      className="hud-link"
      onClick={() => useGameStore.getState().setGoalsOpen(true)}
    >
      <span className="hud-icon" aria-hidden>
        🎯
      </span>
      <span className="hud-label">{t('goals.button')}</span>
    </button>
  );
}

/**
 * Setting today's goals: a ready-made one ("Read a book · 60 min") or one in
 * the player's own words, with how long. Focus time from the study timer
 * fills them, one at a time; the goals stay, and start empty again tomorrow.
 */
export function GoalsDialog() {
  const open = useGameStore((s) => s.goalsOpen);
  const goals = useGameStore((s) => s.goals);
  const [preset, setPreset] = useState<GoalPresetId | null>('read');
  const [text, setText] = useState('');
  const [minutes, setMinutes] = useState<number>(60);
  const [error, setError] = useState<'swear' | 'empty' | null>(null);
  if (!open) return null;
  const full = goals.list.length >= MAX_GOALS;
  const close = () => useGameStore.getState().setGoalsOpen(false);

  function pick(id: GoalPresetId | null) {
    setPreset(id);
    setError(null);
    const found = GOAL_PRESETS.find((p) => p.id === id);
    if (found) setMinutes(found.minutes);
  }

  function add(event: FormEvent) {
    event.preventDefault();
    const own = text.trim().slice(0, GOAL_TEXT_MAX);
    if (!preset && !own) return setError('empty');
    if (!preset && hasProfanity(own)) return setError('swear');
    const goal: Goal = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      preset,
      text: preset ? '' : own,
      minutes,
      doneMs: 0,
    };
    const store = useGameStore.getState();
    store.setGoals({ ...goals, list: [...goals.list, goal], current: goals.current ?? goal.id });
    store.setQuestsFolded(false);
    setText('');
    setError(null);
  }

  function removeGoal(id: string) {
    const list = goals.list.filter((goal) => goal.id !== id);
    useGameStore.getState().setGoals({
      ...goals,
      list,
      current: goals.current === id ? (list[0]?.id ?? null) : goals.current,
    });
  }

  return (
    <Dialog>
      <form onSubmit={add} onKeyDown={(e) => e.key === 'Escape' && close()}>
        <Panel title={`🎯 ${t('goals.title')}`} className="panel--dialog goals-panel">
          <p className="panel-text">{t('goals.text')}</p>
          {goals.list.length > 0 && (
            <ul className="goals-list">
              {goals.list.map((goal) => (
                <li key={goal.id}>
                  <span aria-hidden>{presetIcon(goal.preset)}</span>
                  <span className="goals-name">
                    {goalName(goal)} · {formatDuration(goal.minutes * 60_000)}
                  </span>
                  <button
                    type="button"
                    className="goals-remove"
                    aria-label={t('goals.remove')}
                    onClick={() => removeGoal(goal.id)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          {full ? (
            <p className="panel-text">{t('goals.full', { max: MAX_GOALS })}</p>
          ) : (
            <>
              <fieldset className="status-group">
                <legend className="option-label">{t('goals.pick')}</legend>
                <div className="tags">
                  {GOAL_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="tag"
                      aria-pressed={preset === p.id}
                      onClick={() => pick(p.id)}
                    >
                      {p.icon} {t(`goal.preset.${p.id}`)}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="tag"
                    aria-pressed={preset === null}
                    onClick={() => pick(null)}
                  >
                    ✏️ {t('goals.own')}
                  </button>
                </div>
              </fieldset>
              {preset === null && (
                <label className="field">
                  <span className="option-label">{t('goals.ownLabel')}</span>
                  <input
                    value={text}
                    maxLength={GOAL_TEXT_MAX}
                    placeholder={t('goals.ownPlaceholder')}
                    onChange={(e) => {
                      setText(e.target.value);
                      setError(null);
                    }}
                  />
                </label>
              )}
              <fieldset className="status-group">
                <legend className="option-label">{t('goals.minutes')}</legend>
                <div className="tags">
                  {GOAL_MINUTES.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className="tag"
                      aria-pressed={minutes === m}
                      onClick={() => setMinutes(m)}
                    >
                      {formatDuration(m * 60_000)}
                    </button>
                  ))}
                </div>
              </fieldset>
              {error && <p className="panel-error">{t(`goals.error.${error}`)}</p>}
            </>
          )}
          <div className="panel-actions">
            <button type="button" className="panel-button" onClick={close}>
              {t('goals.close')}
            </button>
            {!full && (
              <button type="submit" className="panel-ok">
                {t('goals.add')}
              </button>
            )}
          </div>
        </Panel>
      </form>
    </Dialog>
  );
}

/**
 * Today's goals by the minimap, each with how far along it is; the one the
 * focus time goes to now is marked, and tapping another makes it the one.
 * Tapping the head folds it to a small icon (remembered on this device).
 */
export function QuestsPanel() {
  const goals = useGameStore((s) => s.goals);
  const folded = useGameStore((s) => s.questsFolded);
  const daily = useGameStore((s) => s.daily);
  const found = useGameStore((s) => s.foundCount);
  const tasks = todaysTasks();
  const now = currentGoal(goals);
  const all = goals.list.length + tasks.length;
  const done =
    goals.list.filter(goalDone).length + tasks.filter((x) => daily.includes(x.id)).length;
  const store = useGameStore.getState;

  if (folded) {
    return (
      <button
        type="button"
        className="quests-fold"
        aria-expanded={false}
        aria-label={t('quests.unfold')}
        onClick={() => store().setQuestsFolded(false)}
      >
        <span aria-hidden>📜</span>
        <span className="quests-count">
          {done}/{all}
        </span>
      </button>
    );
  }

  return (
    <section className="quests panel panel--compact" aria-label={t('quests.title')}>
      <button
        type="button"
        className="quests-head"
        aria-expanded
        onClick={() => store().setQuestsFolded(true)}
      >
        <span>📜 {t('quests.title')}</span>
        <span className="quests-count">
          {done}/{all} ▴
        </span>
      </button>
      <ul className="quests-list quests-daily" aria-label={t('daily.title')}>
        {tasks.map((task) => {
          const ticked = daily.includes(task.id);
          return (
            <li key={task.id} className={`daily${ticked ? ' daily--done' : ''}`}>
              <span aria-hidden>{ticked ? '✅' : task.icon}</span> {t(`daily.${task.id}`)}
            </li>
          );
        })}
      </ul>
      <ul className="quests-list">
        {goals.list.map((goal) => {
          const share = Math.min(1, goal.doneMs / (goal.minutes * 60_000));
          const finished = goalDone(goal);
          return (
            <li key={goal.id}>
              <button
                type="button"
                className={`quest${goal.id === now?.id ? ' quest--now' : ''}${finished ? ' quest--done' : ''}`}
                title={finished ? t('quests.done') : t('quests.makeCurrent')}
                disabled={finished}
                onClick={() => store().setGoals({ ...goals, current: goal.id })}
              >
                <span className="quest-name">
                  {finished ? '✅' : presetIcon(goal.preset)} {goalName(goal)}
                </span>
                <span className="quest-time">
                  {formatDuration(goal.doneMs)} / {formatDuration(goal.minutes * 60_000)}
                </span>
                <span className="goal-track" aria-hidden>
                  <span className="goal-fill" style={{ width: `${Math.round(share * 100)}%` }} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="quests-found" title={t('daily.found.hint')}>
        🔎 {t('daily.found', { n: found, of: COLLECTIBLES })}
      </p>
      <button type="button" className="quests-add" onClick={() => store().setGoalsOpen(true)}>
        ＋ {t('quests.add')}
      </button>
    </section>
  );
}
