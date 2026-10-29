import { normalizeName } from '@att/shared';
import { useState, type FormEvent } from 'react';
import { t } from '../i18n/t';
import { createGuest, type GuestError } from '../net/session';
import { useGameStore } from '../state/store';

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
      <form className="gate-card" onSubmit={submit}>
        <h1>{t('gate.title')}</h1>
        <p>{t('gate.subtitle')}</p>
        <input
          autoFocus
          value={name}
          maxLength={20}
          placeholder={t('gate.placeholder')}
          aria-label={t('gate.placeholder')}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
        <button type="submit" disabled={busy}>
          {t('gate.enter')}
        </button>
        {error && <p className="gate-error">{t(`gate.error.${error}`)}</p>}
      </form>
    </main>
  );
}
