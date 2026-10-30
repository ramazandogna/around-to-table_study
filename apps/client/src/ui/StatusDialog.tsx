import {
  cleanStatusLines,
  DOINGS,
  EMPTY_LINES,
  MOODS,
  STATUS_LIMITS,
  type StatusLines,
} from '@att/shared';
import { useState, type FormEvent } from 'react';
import { t } from '../i18n/t';
import { useGameStore } from '../state/store';
import { DOING_ICON, MOOD_ICON } from '../state/study';
import { Dialog, Panel } from './Panel';

/** Sets the three lines over your head: an announcement, what you are doing and how you feel. */
export function StatusDialog() {
  const open = useGameStore((s) => s.statusOpen);
  const setOpen = useGameStore((s) => s.setStatusOpen);
  return (
    <>
      <button type="button" className="hud-link" onClick={() => setOpen(true)}>
        {t('hud.status')}
      </button>
      {open && (
        <Dialog>
          <StatusForm onClose={() => setOpen(false)} />
        </Dialog>
      )}
    </>
  );
}

function StatusForm({ onClose }: { onClose: () => void }) {
  const [lines, setLines] = useState<StatusLines>(() => useGameStore.getState().lines);
  const [error, setError] = useState(false);
  const change = (patch: Partial<StatusLines>) => {
    setError(false);
    setLines((current) => ({ ...current, ...patch }));
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    const clean = cleanStatusLines(lines);
    if (!clean) {
      setError(true);
      return;
    }
    useGameStore.getState().setLines(clean);
    onClose();
  }

  return (
    <form onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <Panel title={t('status.title')} className="panel--dialog status-form">
        <label className="field">
          <span className="option-label">📣 {t('status.announcement')}</span>
          <input
            value={lines.announcement}
            maxLength={STATUS_LIMITS.announcement}
            placeholder={t('status.announcement.placeholder')}
            onChange={(e) => change({ announcement: e.target.value })}
          />
        </label>

        <fieldset className="status-group">
          <legend className="option-label">{t('status.doing')}</legend>
          <div className="tags">
            {DOINGS.map((doing) => (
              <button
                key={doing}
                type="button"
                className="tag"
                aria-pressed={lines.doing === doing}
                onClick={() => change({ doing: lines.doing === doing ? null : doing })}
              >
                {DOING_ICON[doing]} {t(`doing.${doing}`)}
              </button>
            ))}
          </div>
          {lines.doing && (
            <input
              className="status-note"
              value={lines.doingNote}
              maxLength={STATUS_LIMITS.note}
              placeholder={t('status.doing.placeholder')}
              aria-label={t('status.note')}
              onChange={(e) => change({ doingNote: e.target.value })}
            />
          )}
        </fieldset>

        <fieldset className="status-group">
          <legend className="option-label">{t('status.mood')}</legend>
          <div className="tags">
            {MOODS.map((mood) => (
              <button
                key={mood}
                type="button"
                className="tag"
                aria-pressed={lines.mood === mood}
                onClick={() => change({ mood: lines.mood === mood ? null : mood })}
              >
                {MOOD_ICON[mood]} {t(`mood.${mood}`)}
              </button>
            ))}
          </div>
          {lines.mood && (
            <input
              className="status-note"
              value={lines.moodNote}
              maxLength={STATUS_LIMITS.note}
              placeholder={t('status.mood.placeholder')}
              aria-label={t('status.note')}
              onChange={(e) => change({ moodNote: e.target.value })}
            />
          )}
        </fieldset>

        {error && <p className="panel-error">{t('status.error.link')}</p>}
        <div className="panel-actions">
          <button type="button" className="panel-button" onClick={() => setLines(EMPTY_LINES)}>
            {t('status.clear')}
          </button>
          <button type="button" className="panel-button" onClick={onClose}>
            {t('creator.cancel')}
          </button>
          <button type="submit" className="panel-ok">
            {t('sit.ok')}
          </button>
        </div>
      </Panel>
    </form>
  );
}
