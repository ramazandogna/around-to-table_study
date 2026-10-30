import {
  LOOK_OPTIONS,
  normalizeName,
  randomAppearance,
  type Appearance,
  type LookPart,
} from '@att/shared';
import { useState, type FormEvent } from 'react';
import { t } from '../i18n/t';
import { createGuest, type GuestError } from '../net/session';
import { useGameStore } from '../state/store';
import { CharacterPreview } from './CharacterPreview';
import { Panel, Stepper, Swatches } from './Panel';

/**
 * - `new`: first visit, name and look together (then a guest session is made)
 * - `returning`: has a name from before the creator existed, only the look
 * - `wardrobe`: changing the look in the game, can be cancelled
 */
export type CreatorMode = 'new' | 'returning' | 'wardrobe';

const TURN = Math.PI / 4;

function styleName(part: 'hair' | 'top' | 'bottom', index: number): string {
  if (part === 'hair') return t(`look.hair.${LOOK_OPTIONS.hair[index] ?? 'short'}`);
  if (part === 'top') return t(`look.top.${LOOK_OPTIONS.top[index] ?? 'tee'}`);
  return t(`look.bottom.${LOOK_OPTIONS.bottom[index] ?? 'jeans'}`);
}

export function CharacterCreator({ mode, onClose }: { mode: CreatorMode; onClose?: () => void }) {
  const [look, setLook] = useState<Appearance>(
    () => useGameStore.getState().look ?? randomAppearance(),
  );
  const [yaw, setYaw] = useState(0);
  const [name, setName] = useState('');
  const [error, setError] = useState<GuestError | null>(null);
  const [busy, setBusy] = useState(false);

  const choose = (part: LookPart, index: number) => setLook((l) => ({ ...l, [part]: index }));
  const step = (part: LookPart, direction: -1 | 1) => {
    const count = LOOK_OPTIONS[part].length;
    choose(part, (look[part] + direction + count) % count);
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

  const style = (part: 'hair' | 'top' | 'bottom') => (
    <Stepper
      label={t(`look.part.${part}`)}
      value={styleName(part, look[part])}
      previous={t('creator.previous')}
      next={t('creator.next')}
      onStep={(direction) => step(part, direction)}
    />
  );
  const colors = (part: 'skin' | 'hairColor' | 'topColor' | 'bottomColor') => (
    <Swatches
      label={t(`look.part.${part}`)}
      colors={LOOK_OPTIONS[part]}
      value={look[part]}
      onChange={(index) => choose(part, index)}
    />
  );

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
            {colors('skin')}
            {style('hair')}
            {colors('hairColor')}
            {style('top')}
            {colors('topColor')}
            {style('bottom')}
            {colors('bottomColor')}
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
