import { useState } from 'react';
import { t } from '../i18n/t';
import { readJson, writeJson } from '../net/storage';
import { useGameStore } from '../state/store';

const SEEN_KEY = 'att.coach';

/**
 * One short tip the first time someone enters each room: where to go, what to
 * tap and what the room is for. Dismissed once, it never comes back on this device.
 */
export function Coach() {
  const area = useGameStore((s) => s.area);
  const sitting = useGameStore((s) => s.sitStep !== null);
  const [seen, setSeen] = useState<Record<string, boolean>>(
    () => readJson<Record<string, boolean>>(SEEN_KEY) ?? {},
  );
  if (seen[area] || sitting) return null;

  function dismiss() {
    const next = { ...seen, [area]: true };
    writeJson(SEEN_KEY, next);
    setSeen(next);
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
