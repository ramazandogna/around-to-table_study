import {
  BADGES,
  candleCount,
  nextTableHour,
  TABLE_HOURS,
  tableHourNow,
  type Reward as RewardData,
} from '@att/shared';
import { useEffect, useState } from 'react';
import { dateLocale, t, type MessageKey } from '../i18n/t';
import { useGameStore } from '../state/store';
import { newBadges, useTogether } from '../state/together';

/** The card stays this long unless closed sooner. */
const REWARD_MS = 12_000;
/** The table-hour line on coming into the hall or the library stays this long. */
const LINE_MS = 10_000;

/**
 * The end of a focus block, as a small wooden card above the chat bar: how
 * long, who studied beside you (friends by name, others counted), whether the
 * candle was shared, and anything it just earned. It never blocks the world,
 * closes by itself, and in the library it simply appears, without a sound or
 * a flourish.
 */
export function Reward() {
  const reward = useTogether((s) => s.reward);
  // A finished block opens the study ring around the seat, and its buttons sit where the
  // card would: the card waits until the ring is closed, and only then starts its clock.
  const choosing = useGameStore((s) => s.sitStep !== null);
  return reward && !choosing ? <Card key={reward.at} reward={reward} /> : null;
}

function Card({ reward }: { reward: RewardData }) {
  const area = useGameStore((s) => s.area);
  const items = useTogether((s) => s.itemsEarned);
  const dismiss = useTogether((s) => s.dismissReward);
  const badges = newBadges(reward.before, reward.after);

  useEffect(() => {
    const timer = window.setTimeout(dismiss, REWARD_MS);
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && dismiss();
    window.addEventListener('keydown', escape);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', escape);
    };
  }, [dismiss]);

  const named = reward.mates.flatMap((m) => (m.name ? [m.name] : []));
  const others = reward.mates.length - named.length;
  let beside: string;
  if (reward.mates.length === 0) beside = t('reward.alone');
  else if (named.length === 0)
    beside = others === 1 ? t('reward.someone') : t('reward.people', { n: others });
  else if (others === 0) beside = t('reward.with', { names: named.join(', ') });
  else beside = t('reward.withMore', { names: named.join(', '), n: others });

  return (
    <section
      className={`panel panel--compact reward${area === 'library' ? ' reward--quiet' : ''}`}
      aria-live="polite"
      aria-label={t('reward.title', { n: reward.minutes })}
    >
      <h2 className="reward-title">✅ {t('reward.title', { n: reward.minutes })}</h2>
      <p className="reward-line">👥 {beside}</p>
      {reward.shared && <p className="reward-line reward-candle">🕯️ {t('reward.shared')}</p>}
      {badges.map((id) => (
        <p key={id} className="reward-line">
          {BADGES.find((b) => b.id === id)?.icon ?? '🏅'}{' '}
          {t('reward.badge', { name: t(`badge.${id}` as MessageKey) })}
        </p>
      ))}
      {items.length > 0 && <p className="reward-line">👕 {t('reward.item')}</p>}
      <div className="panel-actions">
        {items.length > 0 && (
          <button
            type="button"
            className="panel-button"
            onClick={() => {
              // MERGE (K1/K9): the wardrobe opens on the new item once it can be opened from here.
              const store = useGameStore.getState() as { openWardrobe?: (item?: string) => void };
              store.openWardrobe?.(items[0]);
              dismiss();
            }}
          >
            {t('reward.wear')}
          </button>
        )}
        <button type="button" className="panel-ok" onClick={dismiss}>
          {t('reward.ok')}
        </button>
      </div>
    </section>
  );
}

/** This device's clock, a fresh reading every minute. */
function useMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/** "2h 10m" or "40m" (the clock's own short words). */
function shortWait(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours > 0
    ? t('clock.hours', { h: hours, m: minutes % 60 })
    : t('clock.minutes', { m: minutes });
}

/**
 * Coming into the hall or the library: one line about the next table hour,
 * or the one on now and how many are at the tables. Gone after a few seconds.
 */
export function TableHourLine() {
  const area = useGameStore((s) => s.area);
  // A fresh line for each room entered.
  return area === 'hall' || area === 'library' ? <HourLine key={area} area={area} /> : null;
}

function HourLine({ area }: { area: 'hall' | 'library' }) {
  const offset = useGameStore((s) => s.clockOffset);
  const focusing = useTogether((s) => s.focusing);
  const candles = useTogether((s) => s.candles);
  const [shownAt, setShownAt] = useState<number | null>(() => Date.now());

  useEffect(() => {
    const timer = window.setTimeout(() => setShownAt(null), LINE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (shownAt === null) return null;
  const now = shownAt + offset;
  const live = tableHourNow(now);
  // In the library the candles tell; the hall was told how many on arrival.
  const count =
    area === 'library' ? candles.reduce((sum, c) => sum + candleCount(c, now), 0) : focusing;
  let text: string;
  if (live) {
    // A count of one or none would only say nobody came: then just that it is on.
    text =
      count !== null && count >= 2 ? t('tablehour.nowCount', { n: count }) : t('tablehour.now');
  } else {
    const next = nextTableHour(now);
    if (!next) return null;
    text = t('tablehour.in', { in: shortWait(next.start - now) });
  }
  return (
    <p className={`notice table-hour-line${live ? ' table-hour-line--live' : ''}`}>🕯️ {text}</p>
  );
}

const clock = () => new Intl.DateTimeFormat(dateLocale(), { hour: '2-digit', minute: '2-digit' });

/** Today's table hours on this device's clock, e.g. "03:00 and 21:00". */
export function tableHourTimes(now: number): string {
  const format = clock();
  const times = TABLE_HOURS.map((slot) => {
    // The slot's start today in its own zone, as a moment.
    const local = new Date(now + slot.utcOffset * 60_000);
    const start = Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate(),
      slot.hour,
    );
    return start - slot.utcOffset * 60_000;
  })
    .map((start) => ({ start, label: format.format(start) }))
    .sort((a, b) => new Date(a.start).getHours() - new Date(b.start).getHours());
  return times.map((x) => x.label).join(t('tablehour.and'));
}

/** The table hours explained, for the library's board and the calendar. */
export function TableHoursText() {
  const now = useMinute() + useGameStore((s) => s.clockOffset);
  const live = tableHourNow(now);
  return (
    <>
      <p>{t('tablehour.board', { times: tableHourTimes(now) })}</p>
      <p className="note-sub">
        {live
          ? t('tablehour.now')
          : t('tablehour.in', { in: shortWait((nextTableHour(now)?.start ?? now) - now) })}
      </p>
    </>
  );
}
