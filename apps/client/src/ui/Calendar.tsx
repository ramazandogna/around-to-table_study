import {
  EVENT_AREAS,
  EVENT_LIMITS,
  EVENTS,
  eventNow,
  isWeekly,
  upcoming,
  type Occurrence,
  type ProposedEvent,
} from '@att/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { play } from '../audio/sound';
import { eventShort, eventText, eventTitle } from '../content/events';
import { t } from '../i18n/t';
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

/** What is going on in any shared room right now, if anything. */
function liveEvent(now: number, proposed: readonly ProposedEvent[]): Occurrence | null {
  for (const area of EVENT_AREAS) {
    const live = eventNow(area, now, EVENTS, proposed);
    if (live) return live;
  }
  return null;
}

/**
 * The building's clock, under the map: the time where the player is, and the
 * next event or the one going on. Time matters here (meetups, study hours),
 * so it is always in view. Tapping it (the 📅) opens the event calendar.
 */
export function WorldClock() {
  const now = useNow();
  const open = useGameStore((s) => s.calendarOpen);
  const setOpen = useGameStore((s) => s.setCalendarOpen);
  const area = useGameStore((s) => s.area);
  const musicOn = useGameStore((s) => s.musicOn);
  const proposed = useGameStore((s) => s.proposed);
  const live = liveEvent(now, proposed);
  const next = live ?? upcoming(now, DAYS, EVENTS, proposed)[0];

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
        <span className="world-clock-row">
          <span className="world-clock-face" role="timer">
            {hours}
            <span className="world-clock-colon" aria-hidden>
              :
            </span>
            {minutes}
          </span>
          <span className="world-clock-calendar" aria-hidden>
            📅
          </span>
        </span>
        {next && (
          <span className="world-clock-next">
            {live
              ? t('clock.live', { title: eventShort(live.event) })
              : t('clock.next', { title: eventShort(next.event), in: countdown(next.start - now) })}
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

/**
 * Like a notice on the board: the next event large, the next two weeks, the
 * list of what happens when, and a way to propose an event (admins approve it).
 */
function CalendarDialog({ now, onClose }: { now: number; onClose: () => void }) {
  const proposed = useGameStore((s) => s.proposed);
  const role = useGameStore((s) => s.role);
  const myId = useGameStore((s) => s.session?.id);
  const formOpen = useGameStore((s) => s.eventFormOpen);
  const occurrences = upcoming(now, DAYS, EVENTS, proposed);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: DAYS }, (_, i) => new Date(today.getTime() + i * DAY));
  const on = (day: Date) =>
    occurrences.filter((o) => new Date(o.start).toDateString() === day.toDateString());
  const waiting = proposed.filter((e) => e.status === 'pending');
  const next = occurrences[0];

  useEffect(() => {
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onClose]);

  return (
    <Dialog>
      <section className="calendar board-sheet" aria-label={t('calendar.title')}>
        <header className="calendar-head">
          <h2>📅 {t('calendar.title')}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label={t('calendar.close')}
            onClick={onClose}
          >
            ✕
          </button>
        </header>
        {next && <NextUp occurrence={next} now={now} />}
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
                  <span key={`${o.start}`} className="calendar-pin" title={eventTitle(o.event)}>
                    🎉
                  </span>
                ))}
              </li>
            );
          })}
        </ol>
        <ul className="calendar-list">
          {occurrences.length === 0 && <li>{t('calendar.none')}</li>}
          {occurrences.slice(1).map((o) => (
            <EventLine key={`${o.start}:${eventTitle(o.event)}`} occurrence={o} now={now} />
          ))}
        </ul>

        {waiting.length > 0 && (
          <section className="calendar-waiting">
            <h3>{t(role === 'admin' ? 'calendar.review' : 'calendar.yours')}</h3>
            <ul className="calendar-list">
              {waiting.map((event) => (
                <WaitingLine
                  key={event.id}
                  event={event}
                  admin={role === 'admin'}
                  mine={event.by === myId}
                />
              ))}
            </ul>
          </section>
        )}

        {formOpen ? (
          <EventForm now={now} />
        ) : (
          <button
            type="button"
            className="panel-ok calendar-propose"
            onClick={() => useGameStore.getState().setEventFormOpen(true)}
          >
            ➕ {t('calendar.propose')}
          </button>
        )}
        <p className="calendar-note">{t('calendar.note')}</p>
      </section>
    </Dialog>
  );
}

/** The next event, large: what, where, when, and how long until it starts. */
function NextUp({ occurrence, now }: { occurrence: Occurrence; now: number }) {
  const { event, start, end } = occurrence;
  const live = now >= start && now < end;
  return (
    <article className={`calendar-next${live ? ' calendar-next--live' : ''}`}>
      <p className="calendar-next-label">{t(live ? 'calendar.now' : 'calendar.next')}</p>
      <h3 className="calendar-next-title">🎉 {eventTitle(event)}</h3>
      <p className="calendar-next-count">
        {live ? t('calendar.endsIn', { in: countdown(end - now) }) : countdown(start - now)}
      </p>
      <p className="calendar-when">
        {dateFormat.format(start)} · {clockFormat.format(start)}–{clockFormat.format(end)}
      </p>
      <p className="calendar-where">📍 {t('calendar.where', { area: t(`area.${event.area}`) })}</p>
      {eventText(event) && <p>{eventText(event)}</p>}
      {!isWeekly(event) && (
        <p className="creator-note">{t('calendar.by', { name: event.byName })}</p>
      )}
    </article>
  );
}

function EventLine({ occurrence, now }: { occurrence: Occurrence; now: number }) {
  const { event, start, end } = occurrence;
  const live = now >= start && now < end;
  const admin = useGameStore((s) => s.role === 'admin');
  return (
    <li className={`calendar-event${live ? ' calendar-event--live' : ''}`}>
      <h3>
        {live && <span className="calendar-live">{t('calendar.live')}</span>}
        {eventTitle(event)}
      </h3>
      <p className="calendar-when">
        {dateFormat.format(start)} · {clockFormat.format(start)}–{clockFormat.format(end)}
        {isWeekly(event) && (
          <span className="calendar-japan">
            {t('calendar.japan', { time: japanFormat.format(start) })}
          </span>
        )}
      </p>
      <p className="calendar-where">
        {t('calendar.where', { area: t(`area.${event.area}`) })}
        {!live && ` · ${t('calendar.in', { in: countdown(start - now) })}`}
      </p>
      {eventText(event) && <p>{eventText(event)}</p>}
      {!isWeekly(event) && (
        <p className="creator-note">
          {t('calendar.by', { name: event.byName })}
          {admin && (
            <button
              type="button"
              className="mini-button calendar-remove"
              onClick={() => useGameStore.getState().social?.review(event.id, 'removed')}
            >
              {t('calendar.remove')}
            </button>
          )}
        </p>
      )}
    </li>
  );
}

/** A proposal waiting: admins approve or turn it down; its author sees that it waits. */
function WaitingLine({
  event,
  admin,
  mine,
}: {
  event: ProposedEvent;
  admin: boolean;
  mine: boolean;
}) {
  const social = useGameStore((s) => s.social);
  return (
    <li className="calendar-event calendar-event--waiting">
      <h3>
        {eventTitle(event)} <span className="calendar-pending">{t('calendar.pending')}</span>
      </h3>
      <p className="calendar-when">
        {dateFormat.format(event.start)} · {clockFormat.format(event.start)} ·{' '}
        {t('calendar.minutes', { n: event.minutes })} · {t(`area.${event.area}`)}
      </p>
      {event.description && <p>{event.description}</p>}
      <p className="creator-note">
        {t('calendar.by', { name: mine ? t('table.you') : event.byName })}
      </p>
      {admin && (
        <div className="tags">
          <button
            type="button"
            className="mini-button mini-button--ok"
            onClick={() => social?.review(event.id, 'approved')}
          >
            ✓ {t('calendar.approve')}
          </button>
          <button
            type="button"
            className="mini-button"
            onClick={() => social?.review(event.id, 'rejected')}
          >
            ✕ {t('calendar.reject')}
          </button>
        </div>
      )}
    </li>
  );
}

const LENGTHS = [30, 60, 90, 120, 180] as const;

/** A local date-time for the form's input, e.g. "2026-11-05T21:00". */
function toInput(time: number): string {
  const d = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Proposing an event: what, where, when and for how long. It waits for an admin. */
function EventForm({ now }: { now: number }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [area, setArea] = useState<(typeof EVENT_AREAS)[number]>('smoking');
  const [when, setWhen] = useState(() => {
    const start = new Date(now + DAY);
    start.setMinutes(0, 0, 0);
    return toInput(start.getTime());
  });
  const [minutes, setMinutes] = useState<number>(60);
  const start = new Date(when).getTime();
  const valid =
    title.trim().length >= EVENT_LIMITS.title.min && Number.isFinite(start) && start > now;
  const store = useGameStore.getState();
  const typing = { onFocus: () => store.setTyping(true), onBlur: () => store.setTyping(false) };

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    store.social?.propose({
      title: title.trim(),
      description: description.trim(),
      area,
      start,
      minutes,
    });
    store.setEventFormOpen(false);
    store.setNotice('event_proposed');
  }

  return (
    <form className="event-form" onSubmit={submit}>
      <h3>{t('calendar.propose')}</h3>
      <label className="field">
        <span className="field-label">{t('calendar.form.title')}</span>
        <input
          value={title}
          maxLength={EVENT_LIMITS.title.max}
          placeholder={t('calendar.form.title.placeholder')}
          onChange={(e) => setTitle(e.target.value)}
          {...typing}
        />
      </label>
      <label className="field">
        <span className="field-label">{t('calendar.form.about')}</span>
        <textarea
          value={description}
          maxLength={EVENT_LIMITS.description}
          rows={2}
          onChange={(e) => setDescription(e.target.value)}
          {...typing}
        />
      </label>
      <div className="event-form-row">
        <label className="field">
          <span className="field-label">{t('calendar.form.when')}</span>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">{t('calendar.form.length')}</span>
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {LENGTHS.map((n) => (
              <option key={n} value={n}>
                {t('calendar.minutes', { n })}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">{t('calendar.form.where')}</span>
          <select value={area} onChange={(e) => setArea(e.target.value as typeof area)}>
            {EVENT_AREAS.map((a) => (
              <option key={a} value={a}>
                {t(`area.${a}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="creator-note">{t('calendar.form.note')}</p>
      <div className="panel-actions">
        <button
          type="button"
          className="panel-button"
          onClick={() => store.setEventFormOpen(false)}
        >
          {t('creator.cancel')}
        </button>
        <button type="submit" className="panel-ok" disabled={!valid}>
          {t('calendar.form.send')}
        </button>
      </div>
    </form>
  );
}
