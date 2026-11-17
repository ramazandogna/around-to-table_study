import { useState } from 'react';
import { t } from '../i18n/t';
import { readJson, writeJson } from '../net/storage';
import { useGameStore } from '../state/store';

const SEEN_KEY = 'att.coach';
const INTRO_KEY = 'att.intro';

const seenRooms = () => readJson<Record<string, boolean>>(SEEN_KEY) ?? {};

/** Marks a room's tip as seen (it is kept with the account's progress, so it never repeats). */
export function markCoachSeen(area: string): void {
  writeJson(SEEN_KEY, { ...seenRooms(), [area]: true });
}

/**
 * One short tip the first time someone enters each room: where to go, what to
 * tap and what the room is for. Dismissed once, it never comes back for this
 * account. The welcome note comes first on a first visit, and then stands in
 * for the hall's tip, so the two never show back to back.
 */
export function Coach() {
  const area = useGameStore((s) => s.area);
  const sitting = useGameStore((s) => s.sitStep !== null);
  const introOpen = useGameStore((s) => s.introOpen);
  const [, bump] = useState(0);
  // The welcome note is about to open, or open: its tip waits and is then not needed.
  const welcoming = introOpen || readJson<boolean>(INTRO_KEY) !== true;
  if (seenRooms()[area] || sitting || (area === 'hall' && welcoming)) return null;

  function dismiss() {
    markCoachSeen(area);
    bump((n) => n + 1);
  }

  return (
    <div className="coach panel panel--compact" role="note">
      <p>{t(`coach.${area}`)}</p>
      <button type="button" className="mini-button mini-button--ok" onClick={dismiss}>
        {t('coach.ok')}
      </button>
    </div>
  );
}
