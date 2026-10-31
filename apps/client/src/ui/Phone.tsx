import { AREA_RULES, DM_MAX_CHARS, type DirectMessage, type Friend } from '@att/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { t } from '../i18n/t';
import { unreadMessages } from '../net/social';
import { useGameStore } from '../state/store';
import { Panel } from './Panel';

/**
 * The HUD link to the phone. In the library it stays on silent: new messages
 * only show as a dot, and it opens again outside.
 */
export function PhoneLink() {
  const unread = useGameStore((s) => unreadMessages(s.friends));
  const open = useGameStore((s) => s.phoneOpen);
  const silent = useGameStore((s) => !AREA_RULES[s.area].dmAllowed);

  function toggle() {
    const store = useGameStore.getState();
    if (open) store.closePhone();
    else if (silent) store.setNotice('phone_silent');
    else store.openPhone(null);
  }

  return (
    <button type="button" className="hud-link" aria-expanded={open} onClick={toggle}>
      📱 {t('phone.title')}
      {unread > 0 &&
        (silent ? (
          <span className="hud-dot" aria-label={t('phone.waiting')} />
        ) : (
          <span className="chat-unread hud-badge">{unread}</span>
        ))}
    </button>
  );
}

/** Friends to message, then one conversation at a time. */
export function PhonePanel() {
  const open = useGameStore((s) => s.phoneOpen);
  const friendId = useGameStore((s) => s.phoneWith);
  const friend = useGameStore((s) =>
    s.friends.find((f) => f.id === s.phoneWith && f.state === 'friend'),
  );
  if (!open) return null;
  // A fresh conversation (and empty draft) for each friend.
  return friendId && friend ? <Conversation key={friend.id} friend={friend} /> : <Contacts />;
}

function Contacts() {
  const friends = useGameStore((s) => s.friends);
  const contacts = friends
    .filter((f) => f.state === 'friend')
    .sort(
      (a, b) =>
        b.unread - a.unread ||
        Number(b.area !== null) - Number(a.area !== null) ||
        a.name.localeCompare(b.name),
    );
  return (
    <Panel title={`📱 ${t('phone.title')}`} className="panel--compact phone-panel">
      <CloseButton />
      {contacts.length === 0 ? (
        <p className="board-empty">{t('phone.empty')}</p>
      ) : (
        <ul className="friend-list">
          {contacts.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                className="friend-row phone-contact"
                onClick={() => useGameStore.getState().openPhone(f.id)}
              >
                <span className={`presence${f.area ? ' presence--online' : ''}`} aria-hidden />
                <span className="friend-name">
                  {f.name}
                  <span className="friend-where">{whereOf(f)}</span>
                </span>
                {f.unread > 0 && <span className="chat-unread">{f.unread}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Conversation({ friend }: { friend: Friend }) {
  const social = useGameStore((s) => s.social);
  const myId = useGameStore((s) => s.session?.id);
  const messages = useGameStore((s) => s.conversations[friend.id]);
  const [text, setText] = useState('');
  const list = useRef<HTMLOListElement>(null);
  const store = useGameStore.getState();

  // Opening a conversation loads its history and marks it read.
  useEffect(() => {
    social?.history(friend.id);
  }, [social, friend.id]);

  // Closing the phone (or walking into the library) unmounts the field without a blur.
  useEffect(() => () => useGameStore.getState().setTyping(false), []);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages]);

  function send(event: FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if (!message || !social) return;
    social.dm(friend.id, message);
    setText('');
  }

  return (
    <section className="panel panel--compact phone-panel" aria-label={friend.name}>
      <header className="phone-head">
        <button
          type="button"
          className="icon-button"
          aria-label={t('phone.back')}
          title={t('phone.back')}
          onClick={() => store.openPhone(null)}
        >
          ‹
        </button>
        <span className={`presence${friend.area ? ' presence--online' : ''}`} aria-hidden />
        <span className="friend-name">
          <b>{friend.name}</b>
          <span className="friend-where">{whereOf(friend)}</span>
        </span>
        <CloseButton inline />
      </header>
      <ol ref={list} className="chat-lines phone-lines" aria-live="polite">
        {messages?.length === 0 && (
          <li className="chat-line chat-line--event">{t('phone.none')}</li>
        )}
        {messages?.map((m) => (
          <Bubble key={m.id} message={m} mine={m.from === myId} />
        ))}
      </ol>
      <form className="whisper" onSubmit={send}>
        <input
          autoFocus
          value={text}
          maxLength={DM_MAX_CHARS}
          placeholder={t('phone.placeholder', { name: friend.name })}
          aria-label={t('phone.placeholder', { name: friend.name })}
          enterKeyHint="send"
          onChange={(e) => setText(e.target.value)}
          onFocus={() => store.setTyping(true)}
          onBlur={() => store.setTyping(false)}
          onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
        />
        <button type="submit" className="mini-button mini-button--ok" disabled={!text.trim()}>
          {t('phone.send')}
        </button>
      </form>
    </section>
  );
}

function Bubble({ message, mine }: { message: DirectMessage; mine: boolean }) {
  const time = new Date(message.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <li className={`phone-bubble${mine ? ' phone-bubble--mine' : ''}`}>
      {message.text}
      <time className="phone-time" dateTime={new Date(message.at).toISOString()}>
        {time}
      </time>
    </li>
  );
}

function CloseButton({ inline = false }: { inline?: boolean }) {
  return (
    <button
      type="button"
      className={inline ? 'icon-button' : 'icon-button player-card-close'}
      aria-label={t('card.close')}
      onClick={() => {
        const store = useGameStore.getState();
        store.closePhone();
        store.setTyping(false);
      }}
    >
      ✕
    </button>
  );
}

function whereOf(friend: Friend): string {
  return friend.area ? t(`area.${friend.area}`) : t('friends.offline');
}
