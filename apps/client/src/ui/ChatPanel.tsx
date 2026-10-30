import { AREA_RULES } from '@att/shared';
import { useEffect, useRef } from 'react';
import { t } from '../i18n/t';
import { useGameStore, type ChatLine } from '../state/store';

/** The room's chat along the side; every room has one except the quiet library. */
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

  if (!AREA_RULES[area].chatLog) return null;
  if (!open) {
    return (
      <button
        type="button"
        className="chat-toggle panel panel--compact"
        onClick={() => setOpen(true)}
      >
        💬 {t('chat.title')}
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
        {lines.map((line) => (
          <Line key={line.key} line={line} />
        ))}
      </ol>
    </section>
  );
}

function Line({ line }: { line: ChatLine }) {
  if (line.kind === 'joined' || line.kind === 'left') {
    return (
      <li className="chat-line chat-line--event">
        {t(line.kind === 'joined' ? 'chat.joined' : 'chat.left', { name: line.name })}
      </li>
    );
  }
  const whisper = line.kind === 'whisper';
  return (
    <li
      className={`chat-line${whisper ? ' chat-line--whisper' : ''}${line.self ? ' chat-line--self' : ''}`}
    >
      <b className="chat-name">
        {whisper
          ? line.self
            ? t('chat.whisper.to', { name: line.to ?? '' })
            : t('chat.whisper.from', { name: line.name })
          : line.name}
      </b>{' '}
      {line.text}
    </li>
  );
}
