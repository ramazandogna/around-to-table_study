import {
  ACCENTS,
  CHARACTERS,
  earnProgress,
  isEarned,
  normalizeName,
  OUTFIT_PARTS,
  PALETTES,
  PET_ACCESSORIES,
  PET_COLORS,
  PET_SEXES,
  PETS,
  PETS_AVAILABLE,
  randomAppearance,
  randomWear,
  WEAR_COLOR,
  WEAR_ITEMS,
  WEAR_SLOTS,
  WEARABLES,
  type Appearance,
  type OutfitPart,
  type PetKind,
  type WearableId,
  type WearProfile,
  type WearSlot,
} from '@att/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { FOOTSTEPS, getFootsteps, previewStep, setFootsteps, type Footsteps } from '../audio/sound';
import { getLanguage, t, type MessageKey } from '../i18n/t';
import { createCharacter, fetchMe, isError } from '../net/account';
import { enterAs, refreshAccount } from '../net/enter';
import { useGameStore } from '../state/store';
import { CharacterPreview } from './CharacterPreview';
import { slotBuiltIn } from '../world/gear';
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
type Tab = 'face' | 'outfit' | 'colours' | 'wear' | 'pet';
const TABS: readonly Tab[] = ['face', 'outfit', 'colours', 'wear', 'pet'];

/** The face (head) a look shows: its own, or one borrowed from another character. */
const headOf = (look: Appearance) => look.head ?? look.character;

/** A look with this face and these clothes; a face that is the clothes' own is left implied. */
function withHeadAndBody(look: Appearance, head: number, character: number): Appearance {
  const { head: _head, ...rest } = look;
  void _head;
  return head === character ? { ...rest, character } : { ...rest, character, head };
}

const WEAR_ICON: Record<WearableId, string> = {
  beanie: '🧶',
  cap: '🧢',
  bucket: '🎣',
  beret: '🎨',
  headphones: '🎧',
  flowers: '🌸',
  sunhat: '👒',
  earmuffs: '❄️',
  round: '👓',
  square: '🤓',
  sunglasses: '🕶️',
  scarf: '🧣',
  bowtie: '🎀',
  tote: '👜',
  backpack: '🎒',
};

/** A look wearing this item in its slot, or nothing there (and then no colour for it). */
function withWear(look: Appearance, slot: WearSlot, id: WearableId | undefined): Appearance {
  const rest = Object.fromEntries(
    Object.entries(look).filter(([key]) => key !== slot && (id || key !== WEAR_COLOR[slot])),
  ) as Appearance;
  return id ? ({ ...rest, [slot]: id } as Appearance) : rest;
}

function withWearColour(look: Appearance, slot: WearSlot, index: number | undefined): Appearance {
  const key = WEAR_COLOR[slot];
  const rest = Object.fromEntries(Object.entries(look).filter(([k]) => k !== key)) as Appearance;
  return index === undefined ? rest : { ...rest, [key]: index };
}

/** The profile the wear rules read: the one of the character being dressed, if it has one. */
function useWearProfile(mode: CreatorMode): WearProfile | null {
  const profile = useGameStore((s) =>
    mode === 'new' ? null : (s.characters.find((c) => c.id === s.session?.id)?.profile ?? null),
  );
  useEffect(() => {
    if (mode !== 'wardrobe') return;
    // Opening the wardrobe has seen whatever was new in it (the dock's dot, when there is one).
    const store = useGameStore.getState() as { setWardrobeNew?: (value: boolean) => void };
    store.setWardrobeNew?.(false);
    // Blocks finished since coming in count at once: the profile is asked for again.
    let live = true;
    void fetchMe().then((me) => {
      if (live && me?.account) useGameStore.getState().setAccount(me.account, me.characters);
    });
    return () => {
      live = false;
    };
  }, [mode]);
  return profile;
}

const PET_ICON: Record<PetKind, string> = {
  cat: '🐱',
  dog: '🐶',
  corgi: '🦊',
  dachshund: '🌭',
  shiba: '🐕',
  rabbit: '🐰',
  turtle: '🐢',
};

/** A look with one part's colour set, or put back to the character's own. */
function withColour(look: Appearance, part: OutfitPart, index: number | undefined): Appearance {
  const rest = Object.fromEntries(
    Object.entries(look).filter(([key]) => key !== part),
  ) as Appearance;
  return index === undefined ? rest : { ...rest, [part]: index };
}

/** A look with a pet, or without one (and then without its colour and things to wear). */
function withPet(look: Appearance, pet: PetKind | null): Appearance {
  const { pet: _pet, petSex, petColor, petAccessory, ...rest } = look;
  void _pet;
  return pet ? { ...rest, pet, petSex, petColor, petAccessory } : rest;
}

/** One pet field set, or put back to nothing. */
function withPetField<K extends 'petSex' | 'petColor' | 'petAccessory'>(
  look: Appearance,
  key: K,
  value: Appearance[K] | undefined,
): Appearance {
  const rest = Object.fromEntries(
    Object.entries(look).filter(([field]) => field !== key),
  ) as Appearance;
  return value === undefined ? rest : { ...rest, [key]: value };
}

const ACCESSORY_ICON = {
  collar: '⭕',
  bell: '🔔',
  bow: '🎀',
  scarf: '🧣',
  hat: '🥳',
  glasses: '👓',
} as const;

/** What can go wrong making a character. */
const CREATE_ERRORS = ['invalid_name', 'name_taken', 'too_many', 'network'] as const;
type CreateError = (typeof CREATE_ERRORS)[number];

export function CharacterCreator({ mode, onClose }: { mode: CreatorMode; onClose?: () => void }) {
  const [look, setLook] = useState<Appearance>(
    () => useGameStore.getState().look ?? randomAppearance(),
  );
  const [yaw, setYaw] = useState(0);
  const [name, setName] = useState('');
  const [error, setError] = useState<CreateError | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('face');
  const [steps, setSteps] = useState<Footsteps>(getFootsteps);
  const profile = useWearProfile(mode);

  const body = bodyOf(look);
  const choices = choicesFor(body);
  const position = Math.max(0, choices.indexOf(look.character));
  const head = headOf(look);
  // Trying other clothes keeps the face, the colours, what is worn and the pet.
  const dressAs = (character: number) => setLook(withHeadAndBody(look, head, character));
  const step = (direction: -1 | 1) => {
    const next = choices[(position + direction + choices.length) % choices.length];
    if (next !== undefined) dressAs(next);
  };
  const pickBody = (next: Body) => {
    if (next === body) return;
    // Keep the same place in the list, so switching back and forth is predictable.
    const index = choicesFor(next)[position];
    if (index !== undefined) dressAs(index);
  };
  const stepFace = (direction: -1 | 1) =>
    setLook(
      withHeadAndBody(
        look,
        (head + direction + CHARACTERS.length) % CHARACTERS.length,
        look.character,
      ),
    );
  const roll = () => {
    const next = randomAppearance();
    // Half the time someone else's face; a few free things to wear; the pet stays.
    const face =
      Math.random() < 0.5 ? Math.floor(Math.random() * CHARACTERS.length) : next.character;
    setLook({
      ...withHeadAndBody(next, face, next.character),
      ...randomWear(),
      ...(look.pet ? { pet: look.pet } : {}),
    });
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
    const clean = normalizeName(name);
    if (!clean) return setError('invalid_name');
    setBusy(true);
    const made = await createCharacter(clean, look);
    if (isError(made)) {
      setBusy(false);
      return setError(
        CREATE_ERRORS.includes(made.error as CreateError) ? (made.error as CreateError) : 'network',
      );
    }
    // Into the game as the new character.
    await refreshAccount();
    const character = useGameStore.getState().characters.find((c) => c.id === made.id);
    if (character) await enterAs(character);
    setBusy(false);
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
                onClick={roll}
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
            {tab === 'face' && (
              <>
                <Stepper
                  label={t('look.part.face')}
                  value={t('look.style', { n: head + 1, of: CHARACTERS.length })}
                  previous={t('creator.previous')}
                  next={t('creator.next')}
                  onStep={stepFace}
                />
                <p className="creator-note">{t('look.faceNote')}</p>
              </>
            )}
            {tab === 'outfit' && (
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
                <p className="creator-note">{t('look.outfitNote')}</p>
              </>
            )}
            {tab === 'wear' && (
              <WearPicker look={look} profile={profile} isNew={mode === 'new'} onChange={setLook} />
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
            {tab === 'pet' && (
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
                {look.pet && (
                  <>
                    <div className="option-row">
                      <span className="option-label">{t('look.part.petSex')}</span>
                      <div
                        className="body-choice"
                        role="radiogroup"
                        aria-label={t('look.part.petSex')}
                      >
                        {PET_SEXES.map((sex) => (
                          <button
                            key={sex}
                            type="button"
                            role="radio"
                            className="tag"
                            aria-checked={look.petSex === sex}
                            aria-pressed={look.petSex === sex}
                            onClick={() =>
                              setLook(
                                withPetField(look, 'petSex', look.petSex === sex ? undefined : sex),
                              )
                            }
                          >
                            {t(`pet.sex.${sex}`)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Swatches
                      label={t('look.part.petColor')}
                      colors={PET_COLORS}
                      value={look.petColor}
                      original={t('look.original')}
                      onChange={(index) => setLook(withPetField(look, 'petColor', index))}
                    />
                    <div className="option-row option-row--top">
                      <span className="option-label">{t('look.part.petAccessory')}</span>
                      <div
                        className="tags"
                        role="radiogroup"
                        aria-label={t('look.part.petAccessory')}
                      >
                        <button
                          type="button"
                          role="radio"
                          className="tag"
                          aria-checked={!look.petAccessory}
                          aria-pressed={!look.petAccessory}
                          onClick={() => setLook(withPetField(look, 'petAccessory', undefined))}
                        >
                          {t('pet.none')}
                        </button>
                        {PET_ACCESSORIES.map((item) => (
                          <button
                            key={item}
                            type="button"
                            role="radio"
                            className="tag"
                            aria-checked={look.petAccessory === item}
                            aria-pressed={look.petAccessory === item}
                            onClick={() => setLook(withPetField(look, 'petAccessory', item))}
                          >
                            {ACCESSORY_ICON[item]} {t(`pet.gear.${item}`)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
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
        {mode === 'new' && <LegalLine />}
        <div className="panel-actions">
          {onClose && (
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

/** The Wear page: one row of tiles per slot, locked tiles saying how they are earned. */
function WearPicker({
  look,
  profile,
  isNew,
  onChange,
}: {
  look: Appearance;
  profile: WearProfile | null;
  isNew: boolean;
  onChange: (look: Appearance) => void;
}) {
  const head = headOf(look);
  return (
    <>
      {WEAR_SLOTS.map((slot) => {
        const label = t(`wear.slot.${slot}`);
        if (slotBuiltIn(head, slot)) {
          return (
            <div key={slot} className="option-row">
              <span className="option-label">{label}</span>
              <p className="creator-note">{t(`wear.builtIn.${slot}` as MessageKey)}</p>
            </div>
          );
        }
        const worn = look[slot];
        return (
          <div key={slot} className="wear-slot">
            <div className="option-row option-row--top">
              <span className="option-label">{label}</span>
              <div className="pet-choice wear-choice" role="radiogroup" aria-label={label}>
                <button
                  type="button"
                  role="radio"
                  className="pet-card"
                  aria-checked={!worn}
                  onClick={() => onChange(withWear(look, slot, undefined))}
                >
                  <span className="pet-card-icon" aria-hidden>
                    ✕
                  </span>
                  {t('pet.none')}
                </button>
                {WEAR_ITEMS[slot].map((id) => {
                  const open = isEarned(id, profile);
                  const progress = earnProgress(id, profile);
                  const rule = WEARABLES[id].earn;
                  const how =
                    rule && progress
                      ? `${t(`wear.earn.${rule.kind}` as MessageKey, { n: rule.need })}${
                          isNew ? '' : ` · ${progress.have}/${progress.need}`
                        }`
                      : '';
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      className={`pet-card wear-card${open ? '' : ' wear-card--locked'}`}
                      aria-checked={worn === id}
                      disabled={!open}
                      title={open ? undefined : how}
                      onClick={() => onChange(withWear(look, slot, id))}
                    >
                      <span className="pet-card-icon" aria-hidden>
                        {open ? WEAR_ICON[id] : '🔒'}
                      </span>
                      {t(`wear.item.${id}` as MessageKey)}
                      {!open && <span className="wear-card-how">{how}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            {worn && (
              <Swatches
                label={t('wear.colour')}
                colors={ACCENTS}
                value={look[WEAR_COLOR[slot]]}
                original={t('look.original')}
                onChange={(index) => onChange(withWearColour(look, slot, index))}
              />
            )}
          </div>
        );
      })}
      <p className="creator-note">{t(isNew ? 'wear.noteNew' : 'wear.note')}</p>
    </>
  );
}

/** "By coming in you accept the Terms and the Privacy note", with both linked (Turkish part for Turkish players). */
export function LegalLine() {
  const hash = getLanguage() === 'tr' ? '#tr' : '';
  return (
    <p className="legal-line">
      {t('legal.accept')}{' '}
      <a href={`/terms.html${hash}`} target="_blank" rel="noopener">
        {t('legal.terms')}
      </a>{' '}
      ·{' '}
      <a href={`/privacy.html${hash}`} target="_blank" rel="noopener">
        {t('legal.privacy')}
      </a>
    </p>
  );
}
