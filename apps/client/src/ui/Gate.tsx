import { useState, type FormEvent } from 'react';
import { t } from '../i18n/t';
import { enterDoor, isError } from '../net/account';
import { playHere, refreshAccount, signOut } from '../net/enter';
import { useGameStore } from '../state/store';
import { LegalLine } from './CharacterCreator';
import { Panel } from './Panel';

/**
 * The screens before the game, in the game's own panels: sign in with Google,
 * the door with this deploy's code, and "you opened the game somewhere else".
 */

export function SignIn({ google, dev }: { google: boolean; dev: boolean }) {
  const [email, setEmail] = useState('');
  const failed = new URLSearchParams(location.search).get('signin');
  return (
    <main className="gate">
      <Panel title={t('signin.title')} className="panel--dialog gate-panel">
        <img className="gate-logo" src="/favicon-64.png" alt="" />
        <p className="panel-text">{t('signin.text')}</p>
        {failed && <p className="panel-error">{t('signin.failed')}</p>}
        {google && (
          <a className="panel-ok google-button" href="/api/auth/google">
            <span className="google-g" aria-hidden>
              G
            </span>
            {t('signin.google')}
          </a>
        )}
        {import.meta.env.DEV && !google && dev && (
          // Local only, for tests: the server refuses it anywhere else.
          <form
            className="whisper"
            onSubmit={(event) => {
              event.preventDefault();
              location.href = `/api/auth/dev?email=${encodeURIComponent(email)}`;
            }}
          >
            <input
              value={email}
              type="email"
              placeholder="dev@example.com"
              aria-label="Email"
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" className="mini-button mini-button--ok">
              {t('signin.dev')}
            </button>
          </form>
        )}
        {!google && !dev && <p className="panel-error">{t('signin.unavailable')}</p>}
        <p className="creator-note">{t('signin.privacy')}</p>
        <LegalLine />
      </Panel>
    </main>
  );
}

export function Door() {
  const account = useGameStore((s) => s.account);
  const reason = useGameStore((s) => s.doorReason);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    const result = await enterDoor(code.trim());
    setBusy(false);
    if (isError(result)) {
      setError(result.error === 'too_many_tries' ? 'too_many_tries' : 'wrong_code');
      return;
    }
    await refreshAccount();
  }

  return (
    <main className="gate">
      <form onSubmit={submit}>
        <Panel title={`🔑 ${t('door.title')}`} className="panel--dialog gate-panel">
          <p className="panel-text">
            {t(reason === 'update' ? 'door.update' : 'door.text', { name: account?.name ?? '' })}
          </p>
          <label className="field">
            <span className="field-label">{t('door.code')}</span>
            <input
              value={code}
              maxLength={24}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              autoFocus
              placeholder={t('door.placeholder')}
              onChange={(e) => {
                setCode(e.target.value);
                setError(null);
              }}
            />
          </label>
          {error && (
            <p className="panel-error">{t(`door.error.${error}` as 'door.error.wrong_code')}</p>
          )}
          <div className="panel-actions">
            <button type="button" className="panel-button" onClick={() => void signOut()}>
              {t('account.signOut')}
            </button>
            <button type="submit" className="panel-ok" disabled={busy || !code.trim()}>
              {t('door.enter')}
            </button>
          </div>
          <p className="creator-note">{t('door.note', { email: account?.email ?? '' })}</p>
        </Panel>
      </form>
    </main>
  );
}

export function Elsewhere() {
  return (
    <main className="gate">
      <Panel title={`📱 ${t('elsewhere.title')}`} className="panel--dialog gate-panel">
        <p className="panel-text">{t('elsewhere.text')}</p>
        <div className="panel-actions">
          <button type="button" className="panel-button" onClick={() => void signOut()}>
            {t('account.signOut')}
          </button>
          <button type="button" className="panel-ok" onClick={() => void playHere()}>
            {t('elsewhere.here')}
          </button>
        </div>
      </Panel>
    </main>
  );
}

/** The menu's "Sign out". */
export function SignOutLink() {
  return (
    <button type="button" className="hud-link hud-link--quiet" onClick={() => void signOut()}>
      {t('account.signOut')}
    </button>
  );
}
