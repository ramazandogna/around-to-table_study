import {
  AREA_RULES,
  isRoomArea,
  type AreaId,
  type DirectMessage,
  DM_MAX_CHARS,
  findRoomInvite,
  type Friend,
  roomInviteMark,
} from '@att/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { t } from '../i18n/t';
import { unreadMessages } from '../net/social';
import { useGameStore } from '../state/store';
import { DOING_ICON, MOOD_ICON, VIBE_ICON } from '../state/study';
import { Panel } from './Panel';

/**
 * The HUD link to the phone. It works in every room; in the library it only
 * buzzes (a little shaking phone by the player's name) instead of ringing.
 */
export function PhoneLink() {
  const unread = useGameStore((s) => unreadMessages(s.friends));
  const open = useGameStore((s) => s.phoneOpen);
  const silent = useGameStore((s) => !AREA_RULES[s.area].phone);

  function toggle() {
    const store = useGameStore.getState();
    if (open) store.closePhone();
    else if (silent) store.setNotice('phone_silent');
    else store.openPhone(null);
  }

  return (
    <button type="button" className="hud-link" aria-expanded={open} onClick={toggle}>
      <span className="hud-icon" aria-hidden>
        📱
      </span>
      <span className="hud-label">{t('phone.title')}</span>
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
  const [adding, setAdding] = useState(false);
  const contacts = friends
    .filter((f) => f.state === 'friend')
    .sort(
      (a, b) =>
        b.unread - a.unread ||
        Number(b.area !== null) - Number(a.area !== null) ||
        Number(b.vibe === 'chat') - Number(a.vibe === 'chat') ||
        a.name.localeCompare(b.name),
    );
  const requests = friends.filter((f) => f.state === 'incoming').length;
  const online = contacts.filter((f) => f.area).length;
  return (
    <Panel title={`📱 ${t('phone.title')}`} className="panel--compact phone-panel">
      <CloseButton />
      {contacts.length > 0 && (
        <p className="phone-summary">{t('phone.online', { n: online, of: contacts.length })}</p>
      )}
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
                  <span>
                    {f.name}
                    {f.vibe && <span title={t(`vibe.${f.vibe}`)}> {VIBE_ICON[f.vibe]}</span>}
                  </span>
                  <span className="friend-where">{whereOf(f)}</span>
                  {f.note && <span className="friend-note">“{f.note}”</span>}
                </span>
                {f.unread > 0 && <span className="chat-unread">{f.unread}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="phone-foot">
        {requests > 0 && (
          <button
            type="button"
            className="mini-button mini-button--ok"
            onClick={() => {
              const store = useGameStore.getState();
              store.closePhone();
              store.setFriendsOpen(true);
            }}
          >
            {t('phone.requests', { n: requests })}
          </button>
        )}
        <button type="button" className="mini-button" onClick={() => setAdding(!adding)}>
          ➕ {t('phone.add')}
        </button>
      </div>
      {adding && <AddFriend />}
    </Panel>
  );
}

/** Your own friend link, to send anywhere: opening it sends you a request. */
function AddFriend() {
  const id = useGameStore((s) => s.session?.id ?? '');
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}/?friend=${encodeURIComponent(id)}`;
  return (
    <div className="phone-add">
      <p className="creator-note">{t('phone.add.how')}</p>
      <code className="phone-link">{link}</code>
      <button
        type="button"
        className="mini-button mini-button--ok"
        onClick={() => void navigator.clipboard?.writeText(link).then(() => setCopied(true))}
      >
        {copied ? t('room.copied') : t('phone.add.copy')}
      </button>
    </div>
  );
}

/** Quick things to send with one tap; the last shares where the player is. */
const QUICK = [
  'phone.quick.hi',
  'phone.quick.where',
  'phone.quick.study',
  'phone.quick.coming',
] as const;

function Conversation({ friend }: { friend: Friend }) {
  const social = useGameStore((s) => s.social);
  const myId = useGameStore((s) => s.session?.id);
  const messages = useGameStore((s) => s.conversations[friend.id]);
  const seenUpTo = useGameStore((s) => s.seen[friend.id] ?? 0);
  const area = useGameStore((s) => s.area);
  const ticket = useGameStore((s) => s.room);
  const [text, setText] = useState('');
  const list = useRef<HTMLOListElement>(null);
  const store = useGameStore.getState();

  // Opening a conversation loads its history and marks it read.
  useEffect(() => {
    social?.history(friend.id);
  }, [social, friend.id]);

  // Closing the phone unmounts the field without a blur.
  useEffect(() => () => useGameStore.getState().setTyping(false), []);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages, seenUpTo]);

  function sendText(message: string) {
    if (!message || !social) return;
    social.dm(friend.id, message);
  }

  function send(event: FormEvent) {
    event.preventDefault();
    sendText(text.trim());
    setText('');
  }

  const lastMine = [...(messages ?? [])].reverse().find((m) => m.from === myId);
  const canGo = friend.area !== null && friend.area !== area && !isRoomArea(friend.area);

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
          <span>
            <b>{friend.name}</b>
            {friend.vibe && <span title={t(`vibe.${friend.vibe}`)}> {VIBE_ICON[friend.vibe]}</span>}
          </span>
          <span className="friend-where">{whereOf(friend)}</span>
        </span>
        <CloseButton inline />
      </header>
      <div className="phone-actions">
        <button
          type="button"
          className="mini-button"
          title={t('phone.buzz.hint')}
          disabled={!friend.area}
          onClick={() => {
            social?.buzz(friend.id);
            store.setNotice('buzz_sent', friend.name);
          }}
        >
          📳 {t('phone.buzz')}
        </button>
        {canGo && friend.area && (
          <button
            type="button"
            className="mini-button mini-button--ok"
            onClick={() => {
              store.closePhone();
              store.setTravel(friend.area);
            }}
          >
            🚶 {t('phone.go', { area: t(`area.${friend.area}`) })}
          </button>
        )}
        {friend.room && (
          <button
            type="button"
            className="mini-button"
            onClick={() => sendText(t('phone.askRoom'))}
          >
            🔑 {t('phone.askRoom.button')}
          </button>
        )}
        {ticket && (
          <button
            type="button"
            className="mini-button"
            onClick={() =>
              sendText(
                `${t('room.inviteText', { name: ticket.room.name })} ${roomInviteMark(ticket.room.code)}`,
              )
            }
          >
            🔑 {t('phone.inviteRoom')}
          </button>
        )}
      </div>
      <ol ref={list} className="chat-lines phone-lines" aria-live="polite">
        {messages?.length === 0 && (
          <li className="chat-line chat-line--event">{t('phone.none')}</li>
        )}
        {messages?.map((m) => (
          <Bubble
            key={m.id}
            message={m}
            mine={m.from === myId}
            seen={m === lastMine && m.id <= seenUpTo}
          />
        ))}
      </ol>
      <div className="phone-quick">
        {QUICK.map((key) => (
          <button key={key} type="button" className="tag" onClick={() => sendText(t(key))}>
            {t(key)}
          </button>
        ))}
        {!isRoomArea(area) && (
          <button
            type="button"
            className="tag"
            onClick={() =>
              sendText(`📍 ${t('phone.here', { area: t(`area.${area}`) })} ${placeMark(area)}`)
            }
          >
            📍 {t('phone.share')}
          </button>
        )}
      </div>
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

/** "Come over" markers in messages: ⟦go:smoking⟧ shows as a button to walk there. */
const PLACE = /⟦go:(hall|library|smoking)⟧/;
const placeMark = (area: AreaId) => `⟦go:${area}⟧`;

function Bubble({ message, mine, seen }: { message: DirectMessage; mine: boolean; seen: boolean }) {
  const time = new Date(message.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  // An invite to a private room, or a place to come to, shows as a button rather than its code.
  const invite = findRoomInvite(message.text);
  const place = PLACE.exec(message.text)?.[1] as AreaId | undefined;
  let text = message.text;
  if (invite) text = text.replace(roomInviteMark(invite), '');
  if (place) text = text.replace(placeMark(place), '');
  return (
    <li className={`phone-bubble${mine ? ' phone-bubble--mine' : ''}`}>
      {text.trim()}
      {invite && !mine && (
        <button
          type="button"
          className="mini-button phone-join"
          onClick={() => {
            const store = useGameStore.getState();
            store.closePhone();
            store.openRooms(invite);
          }}
        >
          🔑 {t('room.join')}
        </button>
      )}
      {place && !mine && (
        <button
          type="button"
          className="mini-button phone-join"
          onClick={() => {
            const store = useGameStore.getState();
            store.closePhone();
            store.setTravel(place);
          }}
        >
          🚶 {t('phone.goThere')}
        </button>
      )}
      <time className="phone-time" dateTime={new Date(message.at).toISOString()}>
        {time}
        {seen && ` · ${t('phone.seen')}`}
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

const ago = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** "Library · studying", or "last seen 3 hours ago" for friends who are away. */
function whereOf(friend: Friend): string {
  if (!friend.area) {
    if (!friend.seenAt) return t('friends.offline');
    const minutes = Math.round((friend.seenAt - Date.now()) / 60_000);
    const when =
      Math.abs(minutes) < 60
        ? ago.format(minutes, 'minute')
        : Math.abs(minutes) < 60 * 24
          ? ago.format(Math.round(minutes / 60), 'hour')
          : ago.format(Math.round(minutes / (60 * 24)), 'day');
    return t('phone.seenAt', { when });
  }
  const parts = [t(`area.${friend.area}`)];
  if (friend.studying) parts.push(`📚 ${t('phone.studying')}`);
  if (friend.doing) parts.push(`${DOING_ICON[friend.doing]} ${t(`doing.${friend.doing}`)}`);
  if (friend.mood) parts.push(MOOD_ICON[friend.mood]);
  return parts.join(' · ');
}
