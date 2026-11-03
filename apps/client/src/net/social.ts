import { rulesFor, type Friend } from '@att/shared';
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
        case 'found':
          store.setFound(message.people);
          break;
        case 'dm': {
          const { message: dm } = message;
          const mine = dm.from === session.id;
          const other = mine ? dm.to : dm.from;
          store.addMessage(other, dm);
          if (mine) break;
          const reading = store.phoneOpen && store.phoneWith === other;
          if (reading) connection.read(other);
          else if (!isMuted(other)) {
            // Where it may not ring (the library, a focus block) the phone only buzzes by the name.
            store.notify({ kind: 'dm', name: nameOf(store.friends, other), from: other }, 'dm');
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
          if (isMuted(message.from)) break;
          store.notify({ kind: 'buzz', name: message.name, from: message.from }, 'buzzed');
          store.buzz();
          if (mayRing()) play('phone');
          break;
        case 'me':
          store.setMe(message.role, message.blocked);
          break;
        case 'shouts':
          store.addShouts(message.lines, true);
          break;
        case 'shouted':
          store.addShouts([message.line]);
          break;
        case 'profile':
          store.setProfile(message.profile);
          break;
        case 'events':
          store.setProposed(message.events);
          break;
        case 'reviewed':
          store.notify(
            {
              kind: message.verdict === 'approved' ? 'event_approved' : 'event_rejected',
              name: message.title,
            },
            message.verdict === 'approved' ? 'event_approved' : 'event_rejected',
          );
          if (mayRing()) play('chime');
          break;
        case 'blockedBy':
          store.notify({ kind: 'blocked_by', name: message.name }, 'blocked_by');
          break;
        case 'admins':
          store.setAdmins(message.admins);
          break;
        case 'roomBans':
          store.setRoomBans(message.banned);
          break;
        case 'friendEvent':
          if (isMuted(message.id)) break;
          // Every request is kept in the bell's list; quiet rooms only skip the sound.
          store.notify(
            {
              kind: message.kind === 'request' ? 'friend_request' : 'friend_accepted',
              name: message.name,
              from: message.id,
            },
            message.kind === 'request' ? 'friend_request' : 'friend_accepted',
          );
          if (mayRing()) play('clink');
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
            message.code === 'phone_silent' ||
            message.code === 'forbidden' ||
            message.code === 'bad_event' ||
            message.code === 'too_many_events'
          ) {
            store.setNotice(message.code);
          } else if (message.code === 'blocked') {
            store.setNotice('blocked_between');
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
  const { area, seated, dnd, roomRules } = useGameStore.getState();
  return rulesFor(area, roomRules).notifySound && !seated && !dnd;
}

/** Someone the player muted (on this device) or blocked: nothing of theirs is shown. */
export function isMuted(id: string): boolean {
  const { mutedPeople, blocked } = useGameStore.getState();
  return id in mutedPeople || blocked.some((b) => b.id === id);
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
