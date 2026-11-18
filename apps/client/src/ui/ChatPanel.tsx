import { AREA_RULES, SHOUT_MAX_CHARS, type Shout } from '@att/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { dateLocale, t } from '../i18n/t';
import { panelOpen, useGameStore, type ChatLine } from '../state/store';

/** Lines from one person this close together share one name and time. */
const GROUP_MS = 3 * 60_000;

const clock = new Intl.DateTimeFormat(dateLocale(), { hour: '2-digit', minute: '2-digit' });

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
 * The chat in a thin column on the right, in two tabs: this room, and the
 * whole building. The quiet library has neither: there it folds into an icon
 * that says why.
 */
export function ChatPanel() {
  const area = useGameStore((s) => s.area);
  const lines = useGameStore((s) => s.chatLog);
  const open = useGameStore((s) => s.chatOpen);
  const unread = useGameStore((s) => s.unread);
  const shoutUnread = useGameStore((s) => s.shoutUnread);
  const tab = useGameStore((s) => s.chatTab);
  const setOpen = useGameStore((s) => s.setChatOpen);
  const setTab = useGameStore((s) => s.setChatTab);
  const list = useRef<HTMLOListElement>(null);
  const panel = useGameStore(panelOpen);

  const box = useRef<HTMLElement>(null);
  const spokeAt = useGameStore(lastSpoken);
  const openedAt = useRef(0);
  const [recheck, setRecheck] = useState(0);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [lines, open]);

  useEffect(() => {
    if (open) openedAt.current = Date.now();
  }, [open]);

  // On a desktop the open chat folds back to its strip once the room has been
  // quiet for a minute (and the player is not reading or typing in it).
  useEffect(() => {
    if (!open || window.matchMedia('(max-width: 700px)').matches) return;
    const offset = useGameStore.getState().clockOffset;
    const quietAt = Math.max(openedAt.current, spokeAt - offset) + QUIET_MS;
    const timer = window.setTimeout(
      () => {
        const el = box.current;
        if (el && (el.matches(':hover') || el.contains(document.activeElement))) {
          setRecheck((n) => n + 1);
        } else setOpen(false);
      },
      Math.max(quietAt - Date.now(), 5000),
    );
    return () => window.clearTimeout(timer);
  }, [open, spokeAt, recheck, setOpen]);

  if (!AREA_RULES[area].chatLog) return <ChatClosed aside={panel} />;
  if (!open) return <ChatStrip aside={panel} unread={unread + shoutUnread} />;
  return (
    <section ref={box} className="panel panel--compact chat-panel" aria-label={t('chat.title')}>
      <header className="chat-panel-head">
        <div className="chat-tabs" role="tablist">
          {(['room', 'building'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              className="chat-tab"
              aria-selected={tab === option}
              onClick={() => setTab(option)}
            >
              {t(`chat.tab.${option}`)}
              {option === 'building' && shoutUnread > 0 && tab !== 'building' && (
                <span className="chat-unread">{shoutUnread}</span>
              )}
            </button>
          ))}
        </div>
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
      {tab === 'building' ? (
        <Building />
      ) : (
        <ol ref={list} className="chat-lines" aria-live="polite">
          {lines.length === 0 && <li className="chat-line chat-line--event">{t('chat.empty')}</li>}
          {lines.map((line, i) => (
            <Line key={line.key} line={line} grouped={continues(line, lines[i - 1])} />
          ))}
        </ol>
      )}
    </section>
  );
}

/** The building-wide chat: everyone online, wherever they are (but the library). */
function Building() {
  const shouts = useGameStore((s) => s.shouts);
  const muted = useGameStore((s) => s.mutedPeople);
  const blocked = useGameStore((s) => s.blocked);
  const myId = useGameStore((s) => s.session?.id);
  const [text, setText] = useState('');
  const list = useRef<HTMLOListElement>(null);
  const store = useGameStore.getState();
  const visible = shouts.filter((l) => !(l.from in muted) && !blocked.some((b) => b.id === l.from));

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [visible.length]);

  function send(event: FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if (!message) return;
    store.social?.shout(message);
    setText('');
  }

  return (
    <>
      <ol ref={list} className="chat-lines" aria-live="polite">
        {visible.length === 0 && (
          <li className="chat-line chat-line--event">{t('chat.building.empty')}</li>
        )}
        {visible.map((line, i) => (
          <ShoutLine key={line.id} line={line} mine={line.from === myId} before={visible[i - 1]} />
        ))}
      </ol>
      <form className="whisper chat-shout" onSubmit={send}>
        <input
          value={text}
          maxLength={SHOUT_MAX_CHARS}
          placeholder={t('chat.building.placeholder')}
          aria-label={t('chat.building.placeholder')}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => store.setTyping(true)}
          onBlur={() => store.setTyping(false)}
        />
        <button type="submit" className="mini-button mini-button--ok" disabled={!text.trim()}>
          {t('phone.send')}
        </button>
      </form>
    </>
  );
}

function ShoutLine({
  line,
  mine,
  before,
}: {
  line: Shout;
  mine: boolean;
  before: Shout | undefined;
}) {
  const grouped = !!before && before.from === line.from && line.at - before.at < GROUP_MS;
  return (
    <li
      className={`chat-line${mine ? ' chat-line--self' : ''}${grouped ? ' chat-line--more' : ''}`}
    >
      {!grouped && (
        <span className="chat-meta">
          <b className="chat-name">{line.name}</b>
          <time className="chat-time" dateTime={new Date(line.at).toISOString()}>
            {clock.format(line.at)}
          </time>
        </span>
      )}
      <span className="chat-text">{line.text}</span>
    </li>
  );
}

/** How long the open chat stays open after the last thing anyone said (desktop). */
const QUIET_MS = 60_000;

/** The newest line someone said (not a coming or going). */
function lastSaid(lines: readonly ChatLine[]): ChatLine | undefined {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line && (line.kind === 'say' || line.kind === 'whisper')) return line;
  }
  return undefined;
}

/** When someone last said something here or to the building (server clock), or 0. */
function lastSpoken(s: ReturnType<typeof useGameStore.getState>): number {
  const said = lastSaid(s.chatLog);
  return Math.max(said?.at ?? 0, s.shouts[s.shouts.length - 1]?.at ?? 0);
}

/**
 * The closed chat: one line with the last thing said (in the room or to the
 * building), and how many lines are new. A tap opens the whole chat. On a phone
 * it is the short "Room chat" button it always was.
 */
function ChatStrip({ aside, unread }: { aside: boolean; unread: number }) {
  // Each picked as it is in the store (no new objects), so the strip redraws only when they change.
  const said = useGameStore((s) => lastSaid(s.chatLog));
  const shout = useGameStore((s) => s.shouts[s.shouts.length - 1]);
  const last =
    shout && (!said || shout.at > said.at)
      ? { name: shout.name, text: shout.text }
      : said
        ? { name: said.name, text: said.text ?? '' }
        : null;
  return (
    <button
      type="button"
      className={`chat-toggle chat-strip${aside ? ' chat-toggle--aside' : ''}`}
      title={t('chat.strip.open')}
      onClick={() => useGameStore.getState().setChatOpen(true)}
    >
      <span aria-hidden>💬</span>
      <span className={last ? 'chat-strip-title chat-strip-title--quiet' : 'chat-strip-title'}>
        {t('chat.title')}
      </span>
      {last && (
        <span className="chat-strip-line">
          <b className="chat-name">{last.name}</b> {last.text}
        </span>
      )}
      {unread > 0 && <span className="chat-unread">{unread}</span>}
    </button>
  );
}

/** In the library: a crossed-out chat icon; pointing at it (or tapping it) says why. */
function ChatClosed({ aside }: { aside: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={aside ? 'chat-closed chat-closed--aside' : 'chat-closed'}>
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
