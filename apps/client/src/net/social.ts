import { AREA_RULES, type Friend } from '@att/shared';
import { play } from '../audio/sound';
import { useGameStore } from '../state/store';
import { SocialConnection, type Presence } from './SocialConnection';
import type { GuestSession } from './session';

/**
 * Opens the friends socket for a session and keeps it told which room the
 * player is in. Returns a function that closes it.
 */
export function startSocial(session: GuestSession): () => void {
  const connection = new SocialConnection({
    token: session.token,
    presence: () => presence(useGameStore.getState()),
    onMessage: (message) => {
      const store = useGameStore.getState();
      switch (message.t) {
        case 'friends':
          store.setFriends(message.friends);
          break;
        case 'dm': {
          const { message: dm } = message;
          const mine = dm.from === session.id;
          const other = mine ? dm.to : dm.from;
          store.addMessage(other, dm);
          if (mine) break;
          const reading = store.phoneOpen && store.phoneWith === other;
          if (reading) connection.read(other);
          else {
            // Where it may not ring (the library, a focus block) the phone only buzzes by the name.
            store.setNotice('dm', nameOf(store.friends, other));
            store.buzz();
            if (mayRing()) play('phone');
          }
          break;
        }
        case 'history':
          store.setConversation(message.with, message.messages);
          store.setSeen(message.with, message.seenUpTo);
          break;
        case 'seen':
          store.setSeen(message.by, message.upTo);
          break;
        case 'buzzed':
          store.setNotice('buzzed', message.name);
          store.buzz();
          if (mayRing()) play('phone');
          break;
        case 'friendEvent':
          // In quiet rooms a request only shows as a badge on the friends button.
          if (AREA_RULES[store.area].notifySound || message.kind === 'accepted') {
            store.setNotice(
              message.kind === 'request' ? 'friend_request' : 'friend_accepted',
              message.name,
            );
            if (mayRing()) play('clink');
          }
          break;
        case 'world':
          store.setWorld(
            { online: message.online, studying: message.studying },
            message.waiting ?? [],
          );
          break;
        case 'error':
          if (
            message.code === 'unknown_user' ||
            message.code === 'too_many' ||
            message.code === 'not_friends' ||
            message.code === 'link_blocked' ||
            message.code === 'phone_silent'
          ) {
            store.setNotice(message.code);
          } else if (message.code === 'rate_limited') {
            store.setNotice('rate_limited');
          }
          break;
      }
    },
  });
  useGameStore.getState().setSocial(connection);
  const unsubscribe = useGameStore.subscribe((state, before) => {
    if (
      state.area !== before.area ||
      state.seated !== before.seated ||
      state.look !== before.look ||
      state.lines !== before.lines ||
      state.room?.room.code !== before.room?.room.code
    ) {
      connection.where(presence(state));
    }
  });
  return () => {
    unsubscribe();
    connection.close();
    useGameStore.getState().setSocial(null);
    useGameStore.getState().setFriends([]);
  };
}

/**
 * Notification sounds stay quiet in rooms that ask for it (the library) and
 * while the player sits studying or asked not to be disturbed.
 */
export function mayRing(): boolean {
  const { area, seated, dnd } = useGameStore.getState();
  return AREA_RULES[area].notifySound && !seated && !dnd;
}

/** Phone messages waiting across all friends. */
export function unreadMessages(friends: readonly Friend[]): number {
  return friends.reduce((sum, f) => sum + f.unread, 0);
}

function presence(state: ReturnType<typeof useGameStore.getState>): Presence {
  return {
    area: state.area,
    studying: state.seated,
    look: state.look,
    room: state.room?.room.code ?? null,
    lines: state.lines,
  };
}

function nameOf(friends: readonly Friend[], id: string): string {
  return friends.find((f) => f.id === id)?.name ?? '';
}
