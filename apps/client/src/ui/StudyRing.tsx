import {
  clampRhythm,
  CUSTOM_LIMITS,
  PLAN_RHYTHMS,
  STUDY_PLANS,
  type StudyPlanId,
  type StudyRhythm,
} from '@att/shared';
import { useState } from 'react';
import { t, type MessageKey } from '../i18n/t';
import { readJson, writeJson } from '../net/storage';
import { useGameStore, type RunningBlock } from '../state/store';
import { dailyGoal, formatDuration, nextGoal, todayStats } from '../state/stats';
import { formatClock } from '../state/study';
import { useNow } from './Calendar';
import { Check, Stepper } from './Panel';

const LAST_KEY = 'att.lastPlan';
type Last = { plan?: StudyPlanId; custom?: StudyRhythm; dnd?: boolean };

const ICON: Record<StudyPlanId, string> = {
  pomodoro: '🍅',
  deep: '🎧',
  marathon: '🏃',
  custom: '⚙️',
  free: '⏱️',
  together: '🤝',
};

/** How far the plans sit from the middle of the ring, in pixels (smaller on phones). */
const radius = () => (window.innerWidth <= 520 ? 108 : 132);

const planKey = (plan: StudyPlanId, part: 'name' | 'text') => `plan.${plan}.${part}` as MessageKey;

/**
 * How to study this time, as a ring of plans around a card. Tapping a plan
 * explains it in the middle; nothing starts until the player says yes. Today's
 * time stays in view, to make a good day feel like one.
 */
export function StudyRing() {
  const last = readJson<Last>(LAST_KEY);
  const blocks = useGameStore((s) => s.blocksHere);
  const [plan, setPlan] = useState<StudyPlanId | null>(last?.plan ?? null);
  const [custom, setCustom] = useState<StudyRhythm>(
    last?.custom ?? { workMinutes: 40, breakMinutes: 10, rounds: 2 },
  );
  const [dnd, setDnd] = useState(last?.dnd ?? false);
  const [joining, setJoining] = useState<RunningBlock | null>(null);
  const [asking, setAsking] = useState(false);
  const stats = todayStats();
  const now = useNow();
  const close = () => useGameStore.getState().setSitStep(null);

  const rhythm: StudyRhythm | null =
    plan === 'custom'
      ? clampRhythm(custom)
      : plan && plan in PLAN_RHYTHMS
        ? PLAN_RHYTHMS[plan as keyof typeof PLAN_RHYTHMS]
        : null;
  const ready = plan !== null && (plan !== 'together' || joining !== null);

  function start() {
    if (!plan || !ready) return;
    writeJson(LAST_KEY, { plan, custom, dnd });
    const store = useGameStore.getState();
    store.startSession(
      plan,
      rhythm,
      dnd,
      plan === 'together' && joining
        ? { endsAt: joining.endsAt, totalMs: joining.totalMs }
        : undefined,
    );
    store.setSitStep(null);
  }

  const summary = !plan
    ? t('plan.pick')
    : plan === 'together'
      ? joining
        ? t('plan.together.with', {
            name: joining.name,
            left: formatClock(joining.endsAt - now),
          })
        : t('plan.together.pick')
      : rhythm
        ? t('plan.rhythm', {
            work: rhythm.workMinutes,
            rest: rhythm.breakMinutes,
            rounds: rhythm.rounds,
          })
        : t('plan.free.rhythm');

  return (
    <section className="study-ring" aria-label={t('plan.title')}>
      <div className="study-ring-wheel">
        <span className="study-ring-track" aria-hidden />
        {STUDY_PLANS.map((option, i) => {
          const angle = -Math.PI / 2 + (i / STUDY_PLANS.length) * Math.PI * 2;
          return (
            <button
              key={option}
              type="button"
              className="study-ring-plan"
              aria-pressed={option === plan}
              style={{
                translate: `${Math.cos(angle) * radius()}px ${Math.sin(angle) * radius()}px`,
              }}
              onClick={() => {
                setPlan(option);
                setAsking(false);
              }}
            >
              <span className="study-ring-icon" aria-hidden>
                {ICON[option]}
              </span>
              <span className="study-ring-name">{t(planKey(option, 'name'))}</span>
            </button>
          );
        })}
        <div className="study-ring-card">
          {plan ? (
            <>
              <h2>
                {ICON[plan]} {t(planKey(plan, 'name'))}
              </h2>
              <p className="study-ring-text">{t(planKey(plan, 'text'))}</p>
              <p className="study-ring-rhythm">{summary}</p>
            </>
          ) : (
            <>
              <h2>{t('plan.title')}</h2>
              <p className="study-ring-text">{summary}</p>
            </>
          )}
          <p className="study-ring-today">
            {t('plan.today', { time: formatDuration(stats.focusMs), blocks: stats.blocks })}
            {stats.streak > 1 && ` · ${t('plan.streak', { days: stats.streak })}`}
          </p>
          <GoalBar focusMs={stats.focusMs} />
        </div>
      </div>

      <div className="panel panel--compact study-ring-panel">
        {plan === 'custom' && (
          <div className="study-ring-custom">
            {(['workMinutes', 'breakMinutes', 'rounds'] as const).map((part) => {
              const { step } = CUSTOM_LIMITS[part];
              return (
                <Stepper
                  key={part}
                  label={t(`plan.custom.${part}`)}
                  value={
                    part === 'rounds'
                      ? String(custom[part])
                      : t('plan.minutes', { n: custom[part] })
                  }
                  previous={t('creator.previous')}
                  next={t('creator.next')}
                  onStep={(d) =>
                    setCustom((c) => clampRhythm({ ...c, [part]: c[part] + d * step }))
                  }
                />
              );
            })}
          </div>
        )}
        {plan === 'together' && (
          <ul className="study-ring-blocks">
            {blocks.length === 0 && <li className="study-ring-empty">{t('plan.together.none')}</li>}
            {blocks.map((block) => (
              <li key={block.id}>
                <button
                  type="button"
                  className="tag"
                  aria-pressed={joining?.id === block.id}
                  onClick={() => setJoining(block)}
                >
                  🤝 {block.name} · {formatClock(block.endsAt - now)}
                </button>
              </li>
            ))}
          </ul>
        )}
        {plan && plan !== 'free' && (
          <Check label={t('sit.dnd')} hint={t('sit.dnd.hint')} checked={dnd} onChange={setDnd} />
        )}
        {asking && plan ? (
          <div className="study-ring-confirm">
            <p>{t('plan.sure', { plan: t(planKey(plan, 'name')) })}</p>
            <div className="panel-actions">
              <button type="button" className="panel-button" onClick={() => setAsking(false)}>
                {t('plan.notYet')}
              </button>
              <button type="button" className="panel-ok" onClick={start}>
                {t('plan.yes')}
              </button>
            </div>
          </div>
        ) : (
          <div className="panel-actions">
            <button type="button" className="panel-button" onClick={close}>
              {t('plan.later')}
            </button>
            <button
              type="button"
              className="panel-ok"
              disabled={!ready}
              onClick={() => setAsking(true)}
            >
              {t('plan.start')}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Today against the player's own goal: a bar that fills as they focus. Tapping
 * the goal moves it to the next one (30 minutes to 4 hours). Only this device
 * knows it; there is no ranking.
 */
export function GoalBar({ focusMs }: { focusMs: number }) {
  const [goal, setGoal] = useState(dailyGoal);
  const share = Math.min(1, focusMs / (goal * 60_000));
  return (
    <div className="goal-bar">
      <span className="goal-track" aria-hidden>
        <span className="goal-fill" style={{ width: `${Math.round(share * 100)}%` }} />
      </span>
      <button
        type="button"
        className="goal-pick"
        title={t('goal.change')}
        onClick={() => setGoal(nextGoal())}
      >
        {share >= 1 ? '🎯 ' : ''}
        {t('goal.label', { time: formatDuration(goal * 60_000) })}
      </button>
    </div>
  );
}
