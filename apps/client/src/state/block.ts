import { useGameStore, type LocalTimer, type StudySession } from './store';

/**
 * A running focus block survives a reload (F5, a language switch): the timer,
 * the plan and the round are kept in sessionStorage, this tab only, and put
 * back when the same character comes in again. The player is not seated any
 * more, so they are asked to sit down again.
 */
const KEY = 'att.block';
/** A block older than this is not worth bringing back. */
const MAX_AGE_MS = 6 * 60 * 60_000;

export type SavedBlock = {
  id: string;
  at: number;
  timer: LocalTimer | null;
  study: StudySession | null;
  dnd: boolean;
};

export type RestoredBlock = Pick<SavedBlock, 'timer' | 'study' | 'dnd'>;

/** What of a saved block still stands for this character now, or null when nothing does. */
export function restoredBlock(
  saved: SavedBlock | null | undefined,
  id: string,
  now = Date.now(),
): RestoredBlock | null {
  if (!saved || saved.id !== id || now - saved.at > MAX_AGE_MS) return null;
  const { timer, study } = saved;
  if (!study || study.phase === 'done') return null;
  if (study.phase === 'free') return { timer: null, study, dnd: saved.dnd };
  if (study.phase === 'work') {
    // A block that ran out while the page was away was never watched: it does not count.
    if (!timer || timer.endsAt <= now) return null;
    return { timer, study, dnd: saved.dnd };
  }
  if (study.phase === 'between') return { timer: null, study, dnd: false };
  // A break: over by now means the next round waits for a yes.
  if (study.breakEndsAt !== null && study.breakEndsAt <= now) {
    return { timer: null, study: { ...study, phase: 'between', breakEndsAt: null }, dnd: false };
  }
  return { timer: null, study, dnd: false };
}

function read(): SavedBlock | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedBlock) : null;
  } catch {
    return null;
  }
}

function write(block: SavedBlock | null): void {
  try {
    if (block) sessionStorage.setItem(KEY, JSON.stringify(block));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Not kept; the block just does not survive a reload.
  }
}

/** Puts a saved block back for this character; true when there was one. */
export function resumeBlock(id: string): boolean {
  const store = useGameStore.getState();
  if (store.timer || store.study) return false;
  const back = restoredBlock(read(), id);
  if (!back) {
    write(null);
    return false;
  }
  useGameStore.setState(back);
  store.setNotice('block_resume');
  return true;
}

/** Writes the block down whenever it changes. */
export function keepBlock(): () => void {
  return useGameStore.subscribe((now, before) => {
    if (now.timer === before.timer && now.study === before.study && now.dnd === before.dnd) return;
    const id = now.session?.id;
    if (!id || (!now.timer && !now.study)) {
      write(null);
      return;
    }
    write({ id, at: Date.now(), timer: now.timer, study: now.study, dnd: now.dnd });
  });
}
