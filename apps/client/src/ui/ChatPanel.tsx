import { AREA_RULES } from '@att/shared';
import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/t';
import { useGameStore, type ChatLine } from '../state/store';

/** Lines from one person this close together share one name and time. */
const GROUP_MS = 3 * 60_000;

const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

/** A line continues the one before when the same person said it, the same way, just now. */
function continues(line: ChatLine, before: ChatLine | undefined): boolean {
  return (
    !!before &&
    before.kind === line.kind &&
    (line.kind === 'say' || line.kind === 'whisper') &&
    before.name === line.name &&
    before.to === line.to &&
    line.at - before.at < GROUP_MS
  );
}

/**
 * The room's chat in a thin column on the right. The quiet library has none:
 * there it folds into an icon that says why.
 */
export function ChatPanel() {
  const area = useGameStore((s) => s.area);
  const lines = useGameStore((s) => s.chatLog);
  const open = useGameStore((s) => s.chatOpen);
  const unread = useGameStore((s) => s.unread);
  const setOpen = useGameStore((s) => s.setChatOpen);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [lines, open]);

  if (!AREA_RULES[area].chatLog) return <ChatClosed />;
  if (!open) {
    return (
      <button type="button" className="chat-toggle" onClick={() => setOpen(true)}>
        <span aria-hidden>💬</span> {t('chat.title')}
        {unread > 0 && <span className="chat-unread">{unread}</span>}
      </button>
    );
  }
  return (
    <section className="panel panel--compact chat-panel" aria-label={t('chat.title')}>
      <header className="chat-panel-head">
        <h2>{t('chat.title')}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={t('chat.hide')}
          title={t('chat.hide')}
          onClick={() => setOpen(false)}
        >
          ✕
        </button>
      </header>
      <ol ref={list} className="chat-lines" aria-live="polite">
        {lines.length === 0 && <li className="chat-line chat-line--event">{t('chat.empty')}</li>}
        {lines.map((line, i) => (
          <Line key={line.key} line={line} grouped={continues(line, lines[i - 1])} />
        ))}
      </ol>
    </section>
  );
}

/** In the library: a crossed-out chat icon; pointing at it (or tapping it) says why. */
function ChatClosed() {
  const [open, setOpen] = useState(false);
  return (
    <div className="chat-closed">
      <button
        type="button"
        className="chat-closed-icon"
        aria-label={t('chat.closed')}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onBlur={() => setOpen(false)}
      >
        <span aria-hidden>💬</span>
      </button>
      {open && (
        <p className="chat-closed-tip" role="tooltip">
          {t('chat.closed')}
        </p>
      )}
    </div>
  );
}

/** Who said it and when, then what; a run of lines from one person shows the name once. */
function Line({ line, grouped }: { line: ChatLine; grouped: boolean }) {
  const time = (
    <time className="chat-time" dateTime={new Date(line.at).toISOString()}>
      {clock.format(line.at)}
    </time>
  );
  if (line.kind === 'joined' || line.kind === 'left') {
    return (
      <li className="chat-line chat-line--event">
        {t(line.kind === 'joined' ? 'chat.joined' : 'chat.left', { name: line.name })} {time}
      </li>
    );
  }
  const whisper = line.kind === 'whisper';
  return (
    <li
      className={`chat-line${whisper ? ' chat-line--whisper' : ''}${line.self ? ' chat-line--self' : ''}${grouped ? ' chat-line--more' : ''}`}
    >
      {!grouped && (
        <span className="chat-meta">
          <b className="chat-name">
            {whisper
              ? line.self
                ? t('chat.whisper.to', { name: line.to ?? '' })
                : t('chat.whisper.from', { name: line.name })
              : line.name}
          </b>
          {time}
        </span>
      )}
      <span className="chat-text">{line.text}</span>
    </li>
  );
}
