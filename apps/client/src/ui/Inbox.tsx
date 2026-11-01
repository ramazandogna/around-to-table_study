import { useEffect } from 'react';
import { t } from '../i18n/t';
import { useGameStore, type InboxItem } from '../state/store';
import { Dialog, Panel } from './Panel';

const ICON: Record<InboxItem['kind'], string> = {
  dm: '📱',
  poke: '👉',
  invite: '🔑',
  friend_request: '🤝',
  friend_accepted: '⭐',
  buzz: '📳',
  event_approved: '🎉',
  event_rejected: '📅',
  blocked_by: '🚫',
  kicked: '🚪',
  banned: '⛔',
  room_closed: '🗝️',
};

const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

/**
 * The bell on the HUD: everything that happened to the player (messages,
 * pokes, invites, friend requests, buzzes, answers about their events), so
 * nothing is missed while they studied or looked away. Read with a tap.
 */
export function InboxLink() {
  const unread = useGameStore((s) => s.inboxUnread);
  const open = useGameStore((s) => s.inboxOpen);
  return (
    <button
      type="button"
      className="hud-link"
      aria-expanded={open}
      onClick={() => useGameStore.getState().setInboxOpen(!open)}
    >
      <span className="hud-icon" aria-hidden>
        🔔
      </span>
      <span className="hud-label">{t('inbox.title')}</span>
      {unread > 0 && <span className="chat-unread hud-badge">{unread}</span>}
    </button>
  );
}

export function InboxPanel() {
  const open = useGameStore((s) => s.inboxOpen);
  const items = useGameStore((s) => s.inbox);
  const role = useGameStore((s) => s.role);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) =>
      event.key === 'Escape' && useGameStore.getState().setInboxOpen(false);
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [open]);
  if (!open) return null;
  const store = useGameStore.getState();
  return (
    <Panel title={`🔔 ${t('inbox.title')}`} className="panel--compact inbox-panel">
      <button
        type="button"
        className="icon-button player-card-close"
        aria-label={t('card.close')}
        onClick={() => store.setInboxOpen(false)}
      >
        ✕
      </button>
      {items.length === 0 ? (
        <p className="board-empty">{t('inbox.empty')}</p>
      ) : (
        <ul className="inbox-list">
          {items.map((item) => (
            <li key={item.key}>
              <button type="button" className="inbox-item" onClick={() => act(item)}>
                <span className="inbox-icon" aria-hidden>
                  {ICON[item.kind]}
                </span>
                <span className="inbox-text">{t(`inbox.${item.kind}`, { name: item.name })}</span>
                <time className="chat-time">{time.format(item.at)}</time>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="phone-foot">
        <button
          type="button"
          className="mini-button"
          onClick={() => {
            store.setInboxOpen(false);
            store.setPeopleOpen(true);
          }}
        >
          🔇 {t('people.title')}
        </button>
        {role === 'admin' && (
          <button
            type="button"
            className="mini-button"
            onClick={() => {
              store.setInboxOpen(false);
              store.setAdminOpen(true);
            }}
          >
            🛡️ {t('admin.title')}
          </button>
        )}
      </div>
    </Panel>
  );
}

/** Tapping an item goes where it is about: the conversation, the friends, the room. */
function act(item: InboxItem): void {
  const store = useGameStore.getState();
  store.setInboxOpen(false);
  switch (item.kind) {
    case 'dm':
    case 'buzz':
      if (item.from) store.openPhone(item.from);
      break;
    case 'friend_request':
    case 'friend_accepted':
      store.setFriendsOpen(true);
      break;
    case 'invite':
      if (item.code) store.openRooms(item.code);
      break;
    case 'event_approved':
    case 'event_rejected':
      store.setCalendarOpen(true);
      break;
    default:
      break;
  }
}

/** The people the player muted (on this device) or blocked, to let them back. */
export function PeoplePanel() {
  const open = useGameStore((s) => s.peopleOpen);
  const muted = useGameStore((s) => s.mutedPeople);
  const blocked = useGameStore((s) => s.blocked);
  if (!open) return null;
  const store = useGameStore.getState();
  const close = () => store.setPeopleOpen(false);
  return (
    <Dialog>
      <Panel title={`🔇 ${t('people.title')}`} className="panel--dialog people-panel">
        <p className="creator-note">{t('people.about')}</p>
        <p className="field-label">🔇 {t('people.muted')}</p>
        {Object.keys(muted).length === 0 ? (
          <p className="board-empty">{t('people.none')}</p>
        ) : (
          <ul className="room-list">
            {Object.entries(muted).map(([id, name]) => (
              <li key={id} className="room-line">
                <span className="room-name">{name}</span>
                <button type="button" className="mini-button" onClick={() => store.unmute(id)}>
                  {t('people.unmute')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="field-label">🚫 {t('people.blocked')}</p>
        {blocked.length === 0 ? (
          <p className="board-empty">{t('people.none')}</p>
        ) : (
          <ul className="room-list">
            {blocked.map(({ id, name }) => (
              <li key={id} className="room-line">
                <span className="room-name">{name}</span>
                <button
                  type="button"
                  className="mini-button"
                  onClick={() => store.social?.unblock(id)}
                >
                  {t('people.unblock')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="panel-actions">
          <button type="button" className="panel-ok" onClick={close}>
            {t('table.close')}
          </button>
        </div>
      </Panel>
    </Dialog>
  );
}

/**
 * For admins: who the admins are (an owner set on the server always is), to
 * take it back from someone. Making someone an admin is on their card, and
 * events waiting for approval are in the calendar.
 */
export function AdminPanel() {
  const open = useGameStore((s) => s.adminOpen);
  const admins = useGameStore((s) => s.admins);
  const social = useGameStore((s) => s.social);
  const waiting = useGameStore((s) => s.proposed.filter((e) => e.status === 'pending').length);
  useEffect(() => {
    if (open) social?.admins();
  }, [open, social]);
  if (!open) return null;
  const store = useGameStore.getState();
  return (
    <Dialog>
      <Panel title={`🛡️ ${t('admin.title')}`} className="panel--dialog people-panel">
        <p className="creator-note">{t('admin.about')}</p>
        <ul className="room-list">
          {admins.map(({ id, name }) => (
            <li key={id} className="room-line">
              <span className="room-name">{name}</span>
              <button type="button" className="mini-button" onClick={() => social?.role(id, false)}>
                {t('admin.revoke')}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="mini-button mini-button--ok"
          onClick={() => {
            store.setAdminOpen(false);
            store.setCalendarOpen(true);
          }}
        >
          📅 {t('admin.events', { n: waiting })}
        </button>
        <div className="panel-actions">
          <button type="button" className="panel-ok" onClick={() => store.setAdminOpen(false)}>
            {t('table.close')}
          </button>
        </div>
      </Panel>
    </Dialog>
  );
}
