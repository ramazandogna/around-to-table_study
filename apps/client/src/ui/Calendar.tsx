import { eventNow, upcoming, type Occurrence } from '@att/shared';
import { useEffect, useRef, useState } from 'react';
import { play } from '../audio/sound';
import { t, type MessageKey } from '../i18n/t';
import { useGameStore } from '../state/store';
import { Dialog } from './Panel';

const DAY = 24 * 60 * 60_000;
/** Two weeks ahead on the calendar. */
const DAYS = 14;

/** Ticks once a second, for clocks and countdowns. */
export function useNow(every = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), every);
    return () => window.clearInterval(timer);
  }, [every]);
  return now;
}

const clockFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const japanFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Tokyo',
});

/** "2d 4h", "3h 20m" or "12m": how long until something. */
export function countdown(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  if (days > 0) return t('clock.days', { d: days, h: hours });
  if (hours > 0) return t('clock.hours', { h: hours, m: minutes % 60 });
  return t('clock.minutes', { m: minutes });
}

/**
 * The building's clock, under the map: the time where the player is, and the
 * next event or the one going on. Time matters here (meetups, study hours),
 * so it is always in view. Tapping it opens the event calendar.
 */
export function WorldClock() {
  const now = useNow();
  const open = useGameStore((s) => s.calendarOpen);
  const setOpen = useGameStore((s) => s.setCalendarOpen);
  const area = useGameStore((s) => s.area);
  const musicOn = useGameStore((s) => s.musicOn);
  const live = eventNow('smoking', now);
  const next = live ?? upcoming(now, DAYS)[0];

  // Tell everyone outside the quiet library when an event begins.
  const wasLive = useRef(live !== null);
  useEffect(() => {
    const started = live !== null && !wasLive.current;
    wasLive.current = live !== null;
    if (!started || area === 'library') return;
    useGameStore.getState().setNotice('event_started', t(`area.${live.event.area}`));
    play('chime');
  }, [live, area]);

  const [hours, minutes] = clockFormat.format(now).split(':');
  return (
    <>
      <button
        type="button"
        className={`world-clock${live ? ' world-clock--live' : ''}`}
        aria-label={t('clock.open')}
        title={t('clock.open')}
        onClick={() => setOpen(true)}
      >
        <span className="world-clock-face" role="timer">
          {hours}
          <span className="world-clock-colon" aria-hidden>
            :
          </span>
          {minutes}
        </span>
        {next && (
          <span className="world-clock-next">
            {live
              ? t('clock.live', { title: t(`event.${live.event.id}.short` as MessageKey) })
              : t('clock.next', {
                  title: t(`event.${next.event.id}.short` as MessageKey),
                  in: countdown(next.start - now),
                })}
          </span>
        )}
      </button>
      {live && area === live.event.area && (
        <button
          type="button"
          className="world-music"
          aria-pressed={musicOn}
          title={t(musicOn ? 'clock.music.off' : 'clock.music.on')}
          onClick={() => useGameStore.getState().setMusicOn(!musicOn)}
        >
          {musicOn ? '♪' : '♪̸'} {t(musicOn ? 'clock.music' : 'clock.music.muted')}
        </button>
      )}
      {open && <CalendarDialog now={now} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Like a notice on the board: the next two weeks, and what happens when. */
function CalendarDialog({ now, onClose }: { now: number; onClose: () => void }) {
  const occurrences = upcoming(now, DAYS);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: DAYS }, (_, i) => new Date(today.getTime() + i * DAY));
  const on = (day: Date) =>
    occurrences.filter((o) => {
      const start = new Date(o.start);
      return start.toDateString() === day.toDateString();
    });

  useEffect(() => {
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onClose]);

  return (
    <Dialog>
      <section className="calendar board-sheet" aria-label={t('calendar.title')}>
        <header className="calendar-head">
          <h2>{t('calendar.title')}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label={t('calendar.close')}
            onClick={onClose}
          >
            ✕
          </button>
        </header>
        <ol className="calendar-grid">
          {days.map((day) => {
            const events = on(day);
            const isToday = day.getTime() === today.getTime();
            return (
              <li
                key={day.getTime()}
                className={`calendar-day${isToday ? ' calendar-day--today' : ''}${events.length ? ' calendar-day--event' : ''}`}
              >
                <span className="calendar-weekday">{dayFormat.format(day)}</span>
                <span className="calendar-date">{day.getDate()}</span>
                {events.map((o) => (
                  <span
                    key={o.start}
                    className="calendar-pin"
                    title={t(`event.${o.event.id}.title` as MessageKey)}
                  >
                    🎉
                  </span>
                ))}
              </li>
            );
          })}
        </ol>
        <ul className="calendar-list">
          {occurrences.length === 0 && <li>{t('calendar.none')}</li>}
          {occurrences.map((o) => (
            <EventLine key={o.start} occurrence={o} now={now} />
          ))}
        </ul>
        <p className="calendar-note">{t('calendar.note')}</p>
      </section>
    </Dialog>
  );
}

function EventLine({ occurrence, now }: { occurrence: Occurrence; now: number }) {
  const { event, start, end } = occurrence;
  const live = now >= start && now < end;
  return (
    <li className={`calendar-event${live ? ' calendar-event--live' : ''}`}>
      <h3>
        {live && <span className="calendar-live">{t('calendar.live')}</span>}
        {t(`event.${event.id}.title` as MessageKey)}
      </h3>
      <p className="calendar-when">
        {dateFormat.format(start)} · {clockFormat.format(start)}–{clockFormat.format(end)}
        <span className="calendar-japan">
          {t('calendar.japan', { time: japanFormat.format(start) })}
        </span>
      </p>
      <p className="calendar-where">
        {t('calendar.where', { area: t(`area.${event.area}`) })}
        {!live && ` · ${t('calendar.in', { in: countdown(start - now) })}`}
      </p>
      <p>{t(`event.${event.id}.text` as MessageKey)}</p>
    </li>
  );
}
