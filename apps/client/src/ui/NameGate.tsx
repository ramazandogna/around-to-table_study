import { normalizeName } from '@att/shared';
import { useState, type FormEvent } from 'react';
import { t } from '../i18n/t';
import { createGuest, type GuestError } from '../net/session';
import { useGameStore } from '../state/store';
import { Panel } from './Panel';

/** First screen: pick a nickname to get a guest session. */
export function NameGate() {
  const setSession = useGameStore((s) => s.setSession);
  const [name, setName] = useState('');
  const [error, setError] = useState<GuestError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!normalizeName(name)) return setError('invalid_name');
    setBusy(true);
    const result = await createGuest(name);
    setBusy(false);
    if (typeof result === 'string') setError(result);
    else setSession(result);
  }

  return (
    <main className="gate">
      <Panel title={t('gate.title')} className="panel--dialog">
        <form className="gate-form" onSubmit={submit}>
          <p className="panel-text">{t('gate.subtitle')}</p>
          <label className="field">
            <span className="field-label">{t('gate.name')}</span>
            <input
              autoFocus
              value={name}
              maxLength={20}
              placeholder={t('gate.placeholder')}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
            />
          </label>
          {error && <p className="panel-error">{t(`gate.error.${error}`)}</p>}
          <div className="panel-actions">
            <button type="submit" className="panel-ok" disabled={busy}>
              {t('gate.enter')}
            </button>
          </div>
        </form>
      </Panel>
    </main>
  );
}
