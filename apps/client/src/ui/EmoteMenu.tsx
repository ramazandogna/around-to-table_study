import { AREA_RULES, EMOTES, type Emote } from '@att/shared';
import { useEffect } from 'react';
import { t } from '../i18n/t';
import { useGameStore } from '../state/store';
import { emoteImage } from '../world/emotes';

/** Quick feelings: the 😊 button or E opens them, a number key or a tap sends one. */
export function EmoteMenu() {
  const open = useGameStore((s) => s.emoteOpen);
  const area = useGameStore((s) => s.area);
  const dancing = useGameStore((s) => s.dancing);
  const smoking = useGameStore((s) => s.smoking);
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
                <img src={emoteImage(emote)} alt="" />
              </button>
            ))}
          </div>
          {AREA_RULES[area].dance && (
            <button
              type="button"
              className="mini-button emote-dance"
              aria-pressed={dancing}
              onClick={() => {
                useGameStore.getState().setDancing(!dancing);
                setOpen(false);
              }}
            >
              {t(dancing ? 'radial.stop' : 'radial.dance')}
            </button>
          )}
          {AREA_RULES[area].smoke && (
            <button
              type="button"
              className="mini-button emote-dance"
              aria-pressed={smoking}
              onClick={() => {
                useGameStore.getState().setSmoking(!smoking);
                setOpen(false);
              }}
            >
              {t(smoking ? 'radial.smoke.stop' : 'radial.smoke')}
            </button>
          )}
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
        <img src={emoteImage('wave')} alt="" className="emote-toggle-icon" />
      </button>
    </div>
  );
}
