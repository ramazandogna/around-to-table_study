import { AREA_RULES, type Friend } from '@att/shared';
import { play } from '../audio/sound';
import { useGameStore } from '../state/store';
import { SocialConnection } from './SocialConnection';
import type { GuestSession } from './session';

/**
 * Opens the friends socket for a session and keeps it told which room the
 * player is in. Returns a function that closes it.
 */
export function startSocial(session: GuestSession): () => void {
  const connection = new SocialConnection({
    token: session.token,
    area: () => useGameStore.getState().area,
    studying: () => useGameStore.getState().seated,
    pet: () => useGameStore.getState().look?.pet ?? null,
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
          // In the library the phone stays silent; the badge waits for the way out.
          else if (AREA_RULES[store.area].dmAllowed) {
            store.setNotice('dm', nameOf(store.friends, other));
            if (mayRing()) play('phone');
          }
          break;
        }
        case 'history':
          store.setConversation(message.with, message.messages);
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
    const pet = state.look?.pet ?? null;
    const petChanged = pet !== (before.look?.pet ?? null);
    if ((state.seated !== before.seated || petChanged) && state.area === before.area) {
      connection.where(state.area, state.seated, pet);
    }
    if (state.area === before.area) return;
    connection.where(state.area, state.seated, pet);
    if (!AREA_RULES[state.area].dmAllowed) {
      state.closePhone();
    } else if (!AREA_RULES[before.area].dmAllowed) {
      // Leaving the quiet room: tell the player what arrived while they studied.
      const waiting = unreadMessages(state.friends);
      if (waiting > 0) state.setNotice('dm_waiting', String(waiting));
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

function nameOf(friends: readonly Friend[], id: string): string {
  return friends.find((f) => f.id === id)?.name ?? '';
}
