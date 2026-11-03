import { LegalLine } from './CharacterCreator';
import { useEffect } from 'react';
import { t, type MessageKey } from '../i18n/t';
import { readJson, writeJson } from '../net/storage';
import { useGameStore } from '../state/store';

const SEEN_KEY = 'att.intro';

const STEPS: readonly { image: string; title: MessageKey; text: MessageKey }[] = [
  { image: 'emotes/coffee.png', title: 'intro.break.title', text: 'intro.break.text' },
  { image: 'emotes/thinking3.png', title: 'intro.focus.title', text: 'intro.focus.text' },
  { image: 'emotes/heart.png', title: 'intro.friends.title', text: 'intro.friends.text' },
  { image: 'emotes/cheer.png', title: 'intro.grow.title', text: 'intro.grow.text' },
];

/**
 * "What is Around the Table?" on a note taken off the community board. It
 * opens by itself on the first visit, and again from the reception desk, the
 * HUD or the ring around your character.
 */
export function Intro() {
  const open = useGameStore((s) => s.introOpen);

  // The first time in, the note is waiting.
  useEffect(() => {
    if (!readJson<boolean>(SEEN_KEY)) useGameStore.getState().setIntroOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && close();
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [open]);

  if (!open) return null;
  return (
    <div className="intro-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <article className="intro-note" aria-labelledby="intro-title">
        <span className="note-pin note-pin--red" aria-hidden />
        <p className="intro-kicker">{t('intro.kicker')}</p>
        <h2 id="intro-title">{t('intro.title')}</h2>
        <p className="intro-lead">{t('intro.lead')}</p>
        <ol className="intro-steps">
          {STEPS.map((step) => (
            <li key={step.title}>
              <img src={step.image} alt="" className="intro-icon" />
              <span>
                <b>{t(step.title)}</b>
                {t(step.text)}
              </span>
            </li>
          ))}
        </ol>
        <LegalLine />
        <button type="button" className="panel-ok intro-ok" onClick={close}>
          {t('intro.ok')}
        </button>
      </article>
    </div>
  );
}

function close() {
  writeJson(SEEN_KEY, true);
  useGameStore.getState().setIntroOpen(false);
}
