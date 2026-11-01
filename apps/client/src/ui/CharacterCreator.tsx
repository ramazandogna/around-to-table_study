import {
  CHARACTERS,
  normalizeName,
  OUTFIT_PARTS,
  PALETTES,
  PETS,
  PETS_AVAILABLE,
  randomAppearance,
  type Appearance,
  type OutfitPart,
  type PetKind,
} from '@att/shared';
import { useState, type FormEvent } from 'react';
import { FOOTSTEPS, getFootsteps, previewStep, setFootsteps, type Footsteps } from '../audio/sound';
import { t } from '../i18n/t';
import { createGuest, type GuestError } from '../net/session';
import { useGameStore } from '../state/store';
import { CharacterPreview } from './CharacterPreview';
import { Panel, Stepper, Swatches } from './Panel';

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

/** The creator's pages, so it fits a phone. */
type Tab = 'look' | 'colours' | 'extras';
const TABS: readonly Tab[] = ['look', 'colours', 'extras'];

const PET_ICON: Record<PetKind, string> = { cat: '🐱', dog: '🐶', rabbit: '🐰' };

/** A look with one part's colour set, or put back to the character's own. */
function withColour(look: Appearance, part: OutfitPart, index: number | undefined): Appearance {
  const rest = Object.fromEntries(
    Object.entries(look).filter(([key]) => key !== part),
  ) as Appearance;
  return index === undefined ? rest : { ...rest, [part]: index };
}

function withPet(look: Appearance, pet: PetKind | null): Appearance {
  const next = { ...look };
  if (pet) next.pet = pet;
  else delete next.pet;
  return next;
}

export function CharacterCreator({ mode, onClose }: { mode: CreatorMode; onClose?: () => void }) {
  const [look, setLook] = useState<Appearance>(
    () => useGameStore.getState().look ?? randomAppearance(),
  );
  const [yaw, setYaw] = useState(0);
  const [name, setName] = useState('');
  const [error, setError] = useState<GuestError | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('look');
  const [steps, setSteps] = useState<Footsteps>(getFootsteps);

  const body = bodyOf(look);
  const choices = choicesFor(body);
  const position = Math.max(0, choices.indexOf(look.character));
  const step = (direction: -1 | 1) => {
    const next = choices[(position + direction + choices.length) % choices.length];
    // Colours and the pet stay when trying another character.
    if (next !== undefined) setLook({ ...look, character: next });
  };
  const pickBody = (next: Body) => {
    if (next === body) return;
    // Keep the same place in the list, so switching back and forth is predictable.
    const index = choicesFor(next)[position];
    if (index !== undefined) setLook({ ...look, character: index });
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    const store = useGameStore.getState();
    setFootsteps(steps);
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
                onClick={() =>
                  setLook({ ...randomAppearance(), ...(look.pet ? { pet: look.pet } : {}) })
                }
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
            <div className="creator-tabs" role="tablist">
              {TABS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  className="tag"
                  aria-selected={option === tab}
                  aria-pressed={option === tab}
                  onClick={() => setTab(option)}
                >
                  {t(`creator.tab.${option}`)}
                </button>
              ))}
            </div>
            {tab === 'look' && (
              <>
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
              </>
            )}
            {tab === 'colours' &&
              OUTFIT_PARTS.map((part) => (
                <Swatches
                  key={part}
                  label={t(`look.part.${part}`)}
                  colors={PALETTES[part]}
                  value={look[part]}
                  original={t('look.original')}
                  onChange={(index) => setLook(withColour(look, part, index))}
                />
              ))}
            {tab === 'extras' && (
              <>
                <div className="option-row option-row--top">
                  <span className="option-label">{t('look.part.pet')}</span>
                  <div className="pet-choice" role="radiogroup" aria-label={t('look.part.pet')}>
                    <button
                      type="button"
                      role="radio"
                      className="pet-card"
                      aria-checked={!look.pet}
                      onClick={() => setLook(withPet(look, null))}
                    >
                      <span className="pet-card-icon" aria-hidden>
                        ✕
                      </span>
                      {t('pet.none')}
                    </button>
                    {PETS.map((pet) => {
                      const ready = PETS_AVAILABLE.includes(pet);
                      return (
                        <button
                          key={pet}
                          type="button"
                          role="radio"
                          className="pet-card"
                          aria-checked={look.pet === pet}
                          disabled={!ready}
                          title={ready ? undefined : t('pet.soon')}
                          onClick={() => setLook(withPet(look, pet))}
                        >
                          <span className="pet-card-icon" aria-hidden>
                            {PET_ICON[pet]}
                          </span>
                          {t(`pet.${pet}`)}
                          {!ready && <span className="pet-card-soon">{t('pet.soon')}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="option-row">
                  <span className="option-label">{t('look.part.steps')}</span>
                  <div className="body-choice" role="radiogroup" aria-label={t('look.part.steps')}>
                    {FOOTSTEPS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={option === steps}
                        className="tag"
                        aria-pressed={option === steps}
                        onClick={() => {
                          setSteps(option);
                          previewStep(option);
                        }}
                      >
                        {t(`steps.${option}`)}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="creator-note">{t('look.extrasNote')}</p>
              </>
            )}
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
