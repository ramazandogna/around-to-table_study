import { CHARACTERS, normalizeName, randomAppearance, type Appearance } from '@att/shared';
import { useState, type FormEvent } from 'react';
import { t } from '../i18n/t';
import { createGuest, type GuestError } from '../net/session';
import { useGameStore } from '../state/store';
import { CharacterPreview } from './CharacterPreview';
import { Panel, Stepper } from './Panel';

/**
 * - `new`: first visit, name and look together (then a guest session is made)
 * - `returning`: has a name from before, only the look
 * - `wardrobe`: changing the look in the game, can be cancelled
 */
export type CreatorMode = 'new' | 'returning' | 'wardrobe';

const TURN = Math.PI / 4;

type Body = 'female' | 'male';
const BODIES: readonly Body[] = ['female', 'male'];

/** The characters of one body type, as indexes into CHARACTERS. */
const choicesFor = (body: Body) =>
  CHARACTERS.flatMap((id, index) => (id.startsWith(`${body}-`) ? [index] : []));

const bodyOf = (look: Appearance): Body =>
  CHARACTERS[look.character]?.startsWith('male-') ? 'male' : 'female';

export function CharacterCreator({ mode, onClose }: { mode: CreatorMode; onClose?: () => void }) {
  const [look, setLook] = useState<Appearance>(
    () => useGameStore.getState().look ?? randomAppearance(),
  );
  const [yaw, setYaw] = useState(0);
  const [name, setName] = useState('');
  const [error, setError] = useState<GuestError | null>(null);
  const [busy, setBusy] = useState(false);

  const body = bodyOf(look);
  const choices = choicesFor(body);
  const position = Math.max(0, choices.indexOf(look.character));
  const step = (direction: -1 | 1) => {
    const next = choices[(position + direction + choices.length) % choices.length];
    if (next !== undefined) setLook({ character: next });
  };
  const pickBody = (next: Body) => {
    if (next === body) return;
    // Keep the same place in the list, so switching back and forth is predictable.
    const index = choicesFor(next)[position];
    if (index !== undefined) setLook({ character: index });
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    const store = useGameStore.getState();
    if (mode !== 'new') {
      store.setLook(look);
      onClose?.();
      return;
    }
    if (!normalizeName(name)) return setError('invalid_name');
    setBusy(true);
    const result = await createGuest(name);
    setBusy(false);
    if (typeof result === 'string') return setError(result);
    store.setLook(look);
    store.setSession(result);
  }

  return (
    <Panel
      title={t(mode === 'wardrobe' ? 'creator.title.wardrobe' : 'creator.title.new')}
      className="panel--dialog panel--creator"
    >
      <form className="creator" onSubmit={submit}>
        {mode === 'new' && <p className="panel-text">{t('gate.subtitle')}</p>}
        <div className="creator-body">
          <div className="creator-preview">
            <div className="preview-frame">
              <CharacterPreview look={look} yaw={yaw} />
            </div>
            <div className="preview-controls">
              <button
                type="button"
                className="arrow"
                aria-label={t('creator.turnLeft')}
                onClick={() => setYaw((y) => y - TURN)}
              >
                ◀
              </button>
              <button
                type="button"
                className="icon-button"
                title={t('creator.random')}
                aria-label={t('creator.random')}
                onClick={() => setLook(randomAppearance())}
              >
                🎲
              </button>
              <button
                type="button"
                className="arrow"
                aria-label={t('creator.turnRight')}
                onClick={() => setYaw((y) => y + TURN)}
              >
                ▶
              </button>
            </div>
          </div>
          <div className="creator-options">
            {mode === 'new' && (
              <label className="field">
                <span className="field-label">{t('gate.name')}</span>
                <input
                  value={name}
                  maxLength={20}
                  placeholder={t('gate.placeholder')}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError(null);
                  }}
                />
              </label>
            )}
            <div className="option-row">
              <span className="option-label">{t('look.part.body')}</span>
              <div className="body-choice" role="radiogroup" aria-label={t('look.part.body')}>
                {BODIES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={option === body}
                    className="tag"
                    aria-pressed={option === body}
                    onClick={() => pickBody(option)}
                  >
                    {t(`look.body.${option}`)}
                  </button>
                ))}
              </div>
            </div>
            <Stepper
              label={t('look.part.style')}
              value={t('look.style', { n: position + 1, of: choices.length })}
              previous={t('creator.previous')}
              next={t('creator.next')}
              onStep={step}
            />
            <p className="creator-note">{t('look.note')}</p>
          </div>
        </div>
        {error && <p className="panel-error">{t(`gate.error.${error}`)}</p>}
        <div className="panel-actions">
          {mode === 'wardrobe' && (
            <button type="button" className="panel-button" onClick={onClose}>
              {t('creator.cancel')}
            </button>
          )}
          <button type="submit" className="panel-ok" disabled={busy}>
            {t(mode === 'new' ? 'gate.enter' : 'creator.done')}
          </button>
        </div>
      </form>
    </Panel>
  );
}
