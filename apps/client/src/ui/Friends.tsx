import type { Friend } from '@att/shared';
import type { ReactNode } from 'react';
import { t } from '../i18n/t';
import { useGameStore } from '../state/store';
import { Panel } from './Panel';

/** The HUD link to the friends list, with a badge for requests waiting on you. */
export function FriendsLink() {
  const incoming = useGameStore((s) => s.friends.filter((f) => f.state === 'incoming').length);
  const open = useGameStore((s) => s.friendsOpen);
  const setOpen = useGameStore((s) => s.setFriendsOpen);
  return (
    <button type="button" className="hud-link" aria-expanded={open} onClick={() => setOpen(!open)}>
      {t('friends.title')}
      {incoming > 0 && <span className="chat-unread hud-badge">{incoming}</span>}
    </button>
  );
}

/** Requests to answer, friends with where they are, and requests you sent. */
export function FriendsPanel() {
  const open = useGameStore((s) => s.friendsOpen);
  const friends = useGameStore((s) => s.friends);
  const social = useGameStore((s) => s.social);
  if (!open) return null;

  const incoming = friends.filter((f) => f.state === 'incoming');
  const accepted = friends
    .filter((f) => f.state === 'friend')
    .sort((a, b) => Number(b.area !== null) - Number(a.area !== null));
  const outgoing = friends.filter((f) => f.state === 'outgoing');

  return (
    <Panel title={t('friends.title')} className="panel--compact friends-panel">
      <button
        type="button"
        className="icon-button player-card-close"
        aria-label={t('card.close')}
        onClick={() => useGameStore.getState().setFriendsOpen(false)}
      >
        ✕
      </button>
      {friends.length === 0 && <p className="board-empty">{t('friends.empty')}</p>}
      {incoming.length > 0 && (
        <Section title={t('friends.requests')}>
          {incoming.map((f) => (
            <Row key={f.id} friend={f}>
              <button
                type="button"
                className="mini-button mini-button--ok"
                onClick={() => social?.befriend(f.id)}
              >
                {t('friends.accept')}
              </button>
              <button type="button" className="mini-button" onClick={() => social?.unfriend(f.id)}>
                {t('friends.decline')}
              </button>
            </Row>
          ))}
        </Section>
      )}
      {accepted.length > 0 && (
        <Section title={t('friends.list')}>
          {accepted.map((f) => (
            <Row key={f.id} friend={f}>
              <button
                type="button"
                className="mini-button"
                aria-label={t('friends.remove', { name: f.name })}
                title={t('friends.remove', { name: f.name })}
                onClick={() => social?.unfriend(f.id)}
              >
                ✕
              </button>
            </Row>
          ))}
        </Section>
      )}
      {outgoing.length > 0 && (
        <Section title={t('friends.sent')}>
          {outgoing.map((f) => (
            <Row key={f.id} friend={f}>
              <button type="button" className="mini-button" onClick={() => social?.unfriend(f.id)}>
                {t('friends.cancel')}
              </button>
            </Row>
          ))}
        </Section>
      )}
    </Panel>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <h3 className="board-heading">{title}</h3>
      <ul className="friend-list">{children}</ul>
    </>
  );
}

function Row({ friend, children }: { friend: Friend; children: ReactNode }) {
  const where =
    friend.state !== 'friend'
      ? null
      : friend.area
        ? t(`area.${friend.area}`)
        : t('friends.offline');
  return (
    <li className="friend-row">
      {friend.state === 'friend' && (
        <span className={`presence${friend.area ? ' presence--online' : ''}`} aria-hidden />
      )}
      <span className="friend-name">
        {friend.name}
        {where && <span className="friend-where">{where}</span>}
      </span>
      {children}
    </li>
  );
}
