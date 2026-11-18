import { t } from '../i18n/t';
import { useGameStore } from '../state/store';
import { CharacterCreator } from './CharacterCreator';
import { Dialog } from './Panel';

/** The menu's way into the wardrobe. */
export function WardrobeLink() {
  return (
    <button
      type="button"
      className="hud-link"
      onClick={() => useGameStore.getState().setWardrobeOpen(true)}
    >
      <span className="hud-icon" aria-hidden>
        👕
      </span>
      <span className="hud-label">{t('hud.wardrobe')}</span>
    </button>
  );
}

/**
 * Changes the player's look in the game; everyone in the area sees it at once.
 * Mounted once beside the world, not inside the menu, so closing the menu leaves it open.
 */
export function Wardrobe() {
  const open = useGameStore((s) => s.wardrobeOpen);
  if (!open) return null;
  const close = () => useGameStore.getState().setWardrobeOpen(false);
  return (
    <Dialog onClose={close}>
      <CharacterCreator mode="wardrobe" onClose={close} />
    </Dialog>
  );
}
