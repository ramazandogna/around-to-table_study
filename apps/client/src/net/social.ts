import { AREA_RULES } from '@att/shared';
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
    onMessage: (message) => {
      const store = useGameStore.getState();
      switch (message.t) {
        case 'friends':
          store.setFriends(message.friends);
          break;
        case 'friendEvent':
          // In quiet rooms a request only shows as a badge on the friends button.
          if (AREA_RULES[store.area].notifySound || message.kind === 'accepted') {
            store.setNotice(
              message.kind === 'request' ? 'friend_request' : 'friend_accepted',
              message.name,
            );
          }
          break;
        case 'error':
          if (message.code === 'unknown_user' || message.code === 'too_many') {
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
    if (state.area !== before.area) connection.where(state.area);
  });
  return () => {
    unsubscribe();
    connection.close();
    useGameStore.getState().setSocial(null);
    useGameStore.getState().setFriends([]);
  };
}
