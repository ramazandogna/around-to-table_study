import { useGameStore } from '../state/store';
import { dailyDone, foundCount } from '../state/daily';
import { loadGoals } from '../state/stats';
import {
  fetchMe,
  isError,
  loadProgress,
  play,
  playingId,
  saveProgress,
  setPlayingId,
  signOut as endSession,
  type ServerCharacter,
} from './account';
import { loadLines } from './session';

/**
 * The way into the game, step by step: signed in? the door open? which
 * character? Each step asks the server and puts the matching screen up.
 */

/** Asks who is signed in and puts up the right screen; a reload goes back into the game. */
export async function refreshAccount(): Promise<void> {
  const store = useGameStore.getState();
  const me = await fetchMe();
  if (!me || !me.account) {
    store.setAccount(null, []);
    store.setGate('signin');
    return;
  }
  store.setAccount(me.account, me.characters);
  if (!me.door) {
    store.setGate('door');
    return;
  }
  // A reload (or the code just entered) goes straight back to the character played last.
  const last = me.characters.find((c) => c.id === playingId());
  if (last && store.gate !== 'select') {
    await enterAs(last);
    return;
  }
  store.setGate(me.characters.length === 0 ? 'create' : 'select');
}

/**
 * Plays as a character: the server makes this the account's one presence
 * (any other tab or device is sent out) and gives the game token; the
 * character's saved progress comes back into this browser.
 */
export async function enterAs(character: ServerCharacter): Promise<boolean> {
  const store = useGameStore.getState();
  const ticket = await play(character.id);
  if (isError(ticket)) {
    if (ticket.error === 'door_closed') store.setGate('door', 'update');
    else if (ticket.error === 'signed_out') store.setGate('signin');
    else store.setNotice('offline');
    return false;
  }
  const before = playingId();
  if (before !== character.id) {
    // Someone else's progress was here: keep it on the server, then bring this one's in.
    if (before) saveProgress(before);
    loadProgress(character.save);
  }
  setPlayingId(character.id);
  readProgressIntoStore();
  useGameStore.setState({
    session: { token: ticket.token, id: ticket.id, name: ticket.name },
    presence: ticket.presence,
    look: character.look,
    gate: 'game',
    lobby: false,
  });
  return true;
}

/** The parts of the store that were read from localStorage when the page opened. */
function readProgressIntoStore(): void {
  let linesUntil: number | null = null;
  try {
    linesUntil = Number(localStorage.getItem('att.linesUntil')) || null;
  } catch {
    // None.
  }
  useGameStore.setState({
    lines: loadLines(),
    linesUntil,
    goals: loadGoals(),
    daily: dailyDone(),
    foundCount: foundCount(),
  });
}

/** Out of the world to the character select; progress is kept on the server first. */
export function leaveToSelect(): void {
  const id = useGameStore.getState().session?.id;
  if (id) saveProgress(id);
  useGameStore.setState({ gate: 'select', lobby: true });
}

export async function signOut(): Promise<void> {
  const id = useGameStore.getState().session?.id;
  if (id) saveProgress(id, true);
  await endSession();
  setPlayingId(null);
  location.reload();
}

/**
 * The game lost its connection: was it the network, a new version (the door
 * closed), or the account opening the game somewhere else?
 */
export async function explainDisconnect(): Promise<void> {
  const store = useGameStore.getState();
  if (store.gate !== 'game' || !store.presence) return;
  const me = await fetchMe(store.presence);
  if (!me) return; // The network: the sockets keep trying.
  const out = (gate: 'signin' | 'door' | 'elsewhere', reason?: 'update') => {
    const id = store.session?.id;
    if (id) saveProgress(id);
    useGameStore.setState({ session: null, presence: null });
    store.setGate(gate, reason);
  };
  if (!me.account) return out('signin');
  store.setAccount(me.account, me.characters);
  if (!me.door) return out('door', 'update');
  if (me.presence === false) return out('elsewhere');
}

/** "Play here" after being sent out: take the presence back with the same character. */
export async function playHere(): Promise<void> {
  const store = useGameStore.getState();
  const id = playingId();
  const character = store.characters.find((c) => c.id === id);
  if (character) await enterAs(character);
  else await refreshAccount();
}
