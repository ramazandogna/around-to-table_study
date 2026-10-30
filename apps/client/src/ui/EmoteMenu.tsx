import { AREA_RULES, EMOTES, type Emote } from '@att/shared';
import { useEffect } from 'react';
import { t } from '../i18n/t';
import { useGameStore } from '../state/store';
import { EMOTE_ICON } from '../state/study';

/** Quick feelings: the 😊 button or E opens them, a number key or a tap sends one. */
export function EmoteMenu() {
  const open = useGameStore((s) => s.emoteOpen);
  const area = useGameStore((s) => s.area);
  const setOpen = useGameStore((s) => s.setEmoteOpen);

  function send(emote: Emote) {
    useGameStore.getState().connection?.emote(emote);
    setOpen(false);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { typing, sitStep, wardrobeOpen, statusOpen, confirm, emoteOpen } =
        useGameStore.getState();
      if (typing || sitStep || wardrobeOpen || statusOpen || confirm) return;
      const picked = emoteOpen ? EMOTES[Number(event.key) - 1] : undefined;
      if (event.code === 'KeyE') setOpen(!emoteOpen);
      else if (emoteOpen && event.key === 'Escape') setOpen(false);
      else if (picked) send(picked);
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="emote-menu">
      {open && (
        <div className="panel panel--compact emote-row" role="menu" aria-label={t('emote.title')}>
          {!AREA_RULES[area].effectsVisible && <p className="emote-hint">{t('emote.quiet')}</p>}
          <div className="emote-buttons">
            {EMOTES.map((emote, i) => (
              <button
                key={emote}
                type="button"
                role="menuitem"
                className="emote-button"
                title={`${t(`emote.${emote}`)} (${i + 1})`}
                aria-label={t(`emote.${emote}`)}
                onClick={() => send(emote)}
              >
                {EMOTE_ICON[emote]}
              </button>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        className="emote-toggle"
        aria-expanded={open}
        aria-label={t('emote.title')}
        title={`${t('emote.title')} (E)`}
        onClick={() => setOpen(!open)}
      >
        😊
      </button>
    </div>
  );
}
