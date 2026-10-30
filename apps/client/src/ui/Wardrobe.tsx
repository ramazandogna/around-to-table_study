import { t } from '../i18n/t';
import { useGameStore } from '../state/store';
import { CharacterCreator } from './CharacterCreator';
import { Dialog } from './Panel';

/** Changes the player's look in the game; everyone in the area sees it at once. */
export function Wardrobe() {
  const open = useGameStore((s) => s.wardrobeOpen);
  const setOpen = useGameStore((s) => s.setWardrobeOpen);
  return (
    <>
      <button type="button" className="hud-link" onClick={() => setOpen(true)}>
        {t('hud.wardrobe')}
      </button>
      {open && (
        <Dialog>
          <CharacterCreator mode="wardrobe" onClose={() => setOpen(false)} />
        </Dialog>
      )}
    </>
  );
}
