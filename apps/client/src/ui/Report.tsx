import { REPORT_NOTE_MAX, REPORT_REASONS, type ReportReason } from '@att/shared';
import { useState, type FormEvent } from 'react';
import { t } from '../i18n/t';
import { useGameStore } from '../state/store';
import { Dialog, Panel } from './Panel';

/** Tells the admins about someone: a reason, an optional note, and nothing the other person sees. */
export function ReportDialog() {
  const target = useGameStore((s) => s.reportFor);
  if (!target) return null;
  return <ReportForm key={target.id} id={target.id} name={target.name} />;
}

function ReportForm({ id, name }: { id: string; name: string }) {
  const social = useGameStore((s) => s.social);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const close = () => useGameStore.getState().setReportFor(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason || !social || sent) return;
    setSent(true);
    social.report(id, reason, note.trim());
  }

  return (
    <Dialog onClose={close}>
      <form onSubmit={submit}>
        <Panel title={`🚩 ${t('report.title', { name })}`} className="panel--dialog report-panel">
          <p className="creator-note">{t('report.about', { name })}</p>
          <p className="field-label">{t('report.reason')}</p>
          <div className="choice-list" role="radiogroup" aria-label={t('report.reason')}>
            {REPORT_REASONS.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={reason === option}
                className={`mini-button${reason === option ? ' mini-button--ok' : ''}`}
                onClick={() => setReason(option)}
              >
                {t(`report.reason.${option}`)}
              </button>
            ))}
          </div>
          <label className="field-label" htmlFor="report-note">
            {t('report.note')}
          </label>
          <textarea
            id="report-note"
            className="report-note-input"
            rows={3}
            value={note}
            maxLength={REPORT_NOTE_MAX}
            placeholder={t('report.note.placeholder')}
            onChange={(e) => setNote(e.target.value)}
            onFocus={() => useGameStore.getState().setTyping(true)}
            onBlur={() => useGameStore.getState().setTyping(false)}
          />
          <div className="panel-actions">
            <button type="button" className="panel-button" onClick={close}>
              {t('report.cancel')}
            </button>
            <button type="submit" className="panel-ok" disabled={!reason || !social || sent}>
              {t('report.send')}
            </button>
          </div>
        </Panel>
      </form>
    </Dialog>
  );
}
