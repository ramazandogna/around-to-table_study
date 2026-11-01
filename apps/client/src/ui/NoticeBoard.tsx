import { AREA_RULES, createAreaGrid, EVENTS, upcoming } from '@att/shared';
import type { ReactNode } from 'react';
import { eventTitle } from '../content/events';
import { HALL_EVENTS, LIBRARY_SESSIONS, type Pinned } from '../content/boards';
import { t } from '../i18n/t';
import { useGameStore } from '../state/store';
import { useNow } from './Calendar';

/**
 * The board you stand next to, drawn like the real thing. The hall has a cork
 * community board with flyers pinned at odd angles; the library has a tidy
 * green felt board with printed notices about studying. They share nothing
 * but the house rules.
 */
export function NoticeBoard() {
  const open = useGameStore((s) => s.boardOpen);
  const area = useGameStore((s) => s.area);
  if (!open) return null;
  const library = area === 'library';
  return (
    <section
      className={`board ${library ? 'board--library' : 'board--hall'}`}
      aria-label={t(library ? 'board.library.title' : 'board.hall.title')}
    >
      <header className="board-header">
        <h2>{t(library ? 'board.library.title' : 'board.hall.title')}</h2>
        <span>{t(library ? 'board.library.subtitle' : 'board.hall.subtitle')}</span>
        <button
          type="button"
          className="icon-button board-close"
          aria-label={t('card.close')}
          onClick={() => useGameStore.getState().setBoardOpen(false)}
        >
          ✕
        </button>
      </header>
      <div className="board-surface">{library ? <LibraryNotices /> : <HallFlyers />}</div>
    </section>
  );
}

function HallFlyers() {
  return (
    <>
      <Note tone="paper" pin="red" tilt={-1.5} wide icon="👋" title={t('board.welcome.title')}>
        <p>{t('board.welcome.text')}</p>
        <button
          type="button"
          className="mini-button note-button"
          onClick={() => useGameStore.getState().setIntroOpen(true)}
        >
          {t('board.welcome.more')}
        </button>
      </Note>
      {HALL_EVENTS.length === 0 ? (
        <Note tone="yellow" pin="blue" tilt={2} icon="📅" title={t('board.events.title')}>
          <NextEvent />
        </Note>
      ) : (
        HALL_EVENTS.map((event, i) => (
          <EventNote key={`${event.when}${event.title}`} event={event} index={i} />
        ))
      )}
      <Note tone="blue" pin="green" tilt={-2.5} icon="☕" title={t('board.break.title')}>
        <p>{t('board.break.text')}</p>
      </Note>
      <Note tone="pink" pin="yellow" tilt={1.5} icon="🤝" title={t('board.people.title')}>
        <p>{t('board.people.text')}</p>
      </Note>
      <Note tone="paper" pin="red" tilt={-1} wide icon="📜" title={t('board.rules.title')} tape>
        <ul>
          <li>{t('rules.kind')}</li>
          <li>{t('rules.dnd')}</li>
          <li>{t('rules.spam')}</li>
        </ul>
      </Note>
    </>
  );
}

const EVENT_TONES = ['pink', 'blue', 'yellow', 'green'] as const;

function EventNote({ event, index }: { event: Pinned; index: number }) {
  return (
    <Note
      tone={EVENT_TONES[index % EVENT_TONES.length] ?? 'yellow'}
      pin="red"
      tilt={index % 2 ? 2 : -2}
      icon="📅"
      title={event.title}
      when={event.when}
    >
      {event.text && <p>{event.text}</p>}
    </Note>
  );
}

function LibraryNotices() {
  const rules = AREA_RULES.library;
  const opened = useGameStore((s) => s.opened.library ?? 0);
  const seats = createAreaGrid('library', opened).openChairs().length;
  return (
    <>
      <Notice heading={`🤫 ${t('board.quiet.title')}`} wide>
        <ul>
          <li>
            {t('rules.library', {
              chars: rules.maxChars,
              seconds: Math.round(rules.cooldownMs / 1000),
            })}
          </li>
          <li>{t('rules.phone')}</li>
          <li>{t('rules.effects')}</li>
        </ul>
      </Notice>
      <Notice heading={`📚 ${t('board.how.title')}`} wide>
        <ol>
          <li>{t('board.how.1')}</li>
          <li>{t('board.how.2')}</li>
          <li>{t('board.how.3')}</li>
          <li>{t('board.how.4')}</li>
        </ol>
      </Notice>
      <Notice heading={`🌱 ${t('board.grow.title')}`} wide>
        <p>{t('board.grow.text')}</p>
        <p className="note-sub">{t('board.grow.now', { count: seats })}</p>
      </Notice>
      <Notice heading={`⏱ ${t('board.sessions.title')}`}>
        {LIBRARY_SESSIONS.length === 0 ? (
          <p>{t('board.sessions.none')}</p>
        ) : (
          <ul>
            {LIBRARY_SESSIONS.map((s) => (
              <li key={`${s.when}${s.title}`}>
                <b>{s.when}</b> {s.title}
                {s.text && <span className="note-sub">{s.text}</span>}
              </li>
            ))}
          </ul>
        )}
      </Notice>
    </>
  );
}

type Tone = 'paper' | 'yellow' | 'pink' | 'blue' | 'green';
type Pin = 'red' | 'blue' | 'green' | 'yellow';

/** A flyer on the cork board: colored paper, a pin (or tape), a little crooked. */
function Note({
  tone,
  pin,
  tilt,
  wide = false,
  tape = false,
  icon,
  title,
  when,
  children,
}: {
  tone: Tone;
  pin: Pin;
  tilt: number;
  wide?: boolean;
  tape?: boolean;
  icon: string;
  title: string;
  when?: string;
  children: ReactNode;
}) {
  return (
    <article
      className={`note note--${tone}${wide ? ' note--wide' : ''}`}
      style={{ rotate: `${tilt}deg` }}
    >
      {tape ? (
        <span className="note-tape" aria-hidden />
      ) : (
        <span className={`note-pin note-pin--${pin}`} aria-hidden />
      )}
      {when && <span className="note-when">{when}</span>}
      <h3>
        <span aria-hidden>{icon}</span> {title}
      </h3>
      {children}
    </article>
  );
}

/** A printed library notice: white sheet, straight, a rule under the heading. */
function Notice({
  heading,
  wide = false,
  children,
}: {
  heading: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <article className={`notice-sheet${wide ? ' note--wide' : ''}`}>
      <span className="notice-clip" aria-hidden />
      <h3>{heading}</h3>
      {children}
    </article>
  );
}

/** The next event from the calendar, or that nothing is planned. */
function NextEvent() {
  const now = useNow(60_000);
  const proposed = useGameStore((s) => s.proposed);
  const next = upcoming(now, 7, EVENTS, proposed)[0];
  if (!next) return <p>{t('board.events.none')}</p>;
  const live = now >= next.start;
  return (
    <>
      <p>
        <b>{eventTitle(next.event)}</b>
        {' · '}
        {live
          ? t('board.events.now', { area: t(`area.${next.event.area}`) })
          : t('board.events.when', {
              when: new Date(next.start).toLocaleString([], {
                weekday: 'long',
                hour: '2-digit',
                minute: '2-digit',
              }),
              area: t(`area.${next.event.area}`),
            })}
      </p>
      <button
        type="button"
        className="mini-button note-button"
        onClick={() => useGameStore.getState().setCalendarOpen(true)}
      >
        {t('board.events.calendar')}
      </button>
    </>
  );
}
