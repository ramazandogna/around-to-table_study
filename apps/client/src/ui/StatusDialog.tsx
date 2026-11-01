import {
  cleanStatusLines,
  DOINGS,
  EMPTY_LINES,
  MOODS,
  STATUS_LIMITS,
  VIBES,
  type StatusLines,
} from '@att/shared';
import { useState, type FormEvent } from 'react';
import { t } from '../i18n/t';
import { useGameStore } from '../state/store';
import { DOING_ICON, MOOD_ICON, VIBE_ICON } from '../state/study';
import { Dialog, Panel } from './Panel';

/** Sets the three lines over your head: an announcement, what you are doing and how you feel. */
export function StatusDialog() {
  const open = useGameStore((s) => s.statusOpen);
  const setOpen = useGameStore((s) => s.setStatusOpen);
  return (
    <>
      <button type="button" className="hud-link" onClick={() => setOpen(true)}>
        <span className="hud-icon" aria-hidden>
          💭
        </span>
        <span className="hud-label">{t('hud.status')}</span>
      </button>
      {open && (
        <Dialog>
          <StatusForm onClose={() => setOpen(false)} />
        </Dialog>
      )}
    </>
  );
}

/** How long the lines stay up before clearing themselves. */
const KEEP = ['hour', 'hours', 'today', 'always'] as const;
type Keep = (typeof KEEP)[number];

function untilFor(keep: Keep, now = new Date()): number | null {
  if (keep === 'hour') return now.getTime() + 60 * 60_000;
  if (keep === 'hours') return now.getTime() + 4 * 60 * 60_000;
  if (keep === 'today') {
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime();
  }
  return null;
}

function StatusForm({ onClose }: { onClose: () => void }) {
  const [lines, setLines] = useState<StatusLines>(() => useGameStore.getState().lines);
  const [keep, setKeep] = useState<Keep>(() =>
    useGameStore.getState().linesUntil ? 'today' : 'always',
  );
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
    useGameStore.getState().setLines(clean, untilFor(keep));
    onClose();
  }

  return (
    <form onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <Panel title={t('status.title')} className="panel--dialog status-form">
        <fieldset className="status-group">
          <legend className="option-label">{t('status.vibe')}</legend>
          <div className="tags">
            {VIBES.map((vibe) => (
              <button
                key={vibe}
                type="button"
                className="tag"
                aria-pressed={lines.vibe === vibe}
                title={t(`vibe.${vibe}.hint`)}
                onClick={() => change({ vibe: lines.vibe === vibe ? null : vibe })}
              >
                {VIBE_ICON[vibe]} {t(`vibe.${vibe}`)}
              </button>
            ))}
          </div>
        </fieldset>

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

        <fieldset className="status-group">
          <legend className="option-label">{t('status.keep')}</legend>
          <div className="tags">
            {KEEP.map((option) => (
              <button
                key={option}
                type="button"
                className="tag"
                aria-pressed={keep === option}
                onClick={() => setKeep(option)}
              >
                {t(`status.keep.${option}`)}
              </button>
            ))}
          </div>
        </fieldset>
        <p className="creator-note">{t('status.friends')}</p>

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
