import { useEffect } from 'react';
import { PAINTINGS, RENOVATION_NOTES, SHELF_TOPICS } from '../content/discoveries';
import { t } from '../i18n/t';
import { useGameStore, type Discovery as Found } from '../state/store';

/**
 * What the player found by walking up to something: a moment from a book on
 * the shelf, the story of a painting, or a peek behind the renovation tape.
 * It closes when they walk away (the world clears it) or change rooms.
 */
export function Discovery() {
  const found = useGameStore((s) => s.discovery);

  useEffect(() => {
    if (!found) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') useGameStore.getState().setDiscovery(null);
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [found]);

  if (!found) return null;
  return (
    <section className={`discovery discovery--${found.kind}`} aria-live="polite">
      <Body found={found} />
      <div className="discovery-actions">
        {found.kind === 'shelf' && (
          <button type="button" className="mini-button" onClick={() => another(found)}>
            {t('discovery.another')}
          </button>
        )}
        <button
          type="button"
          className="mini-button mini-button--ok"
          onClick={() => useGameStore.getState().setDiscovery(null)}
        >
          {t('discovery.close')}
        </button>
      </div>
    </section>
  );
}

function Body({ found }: { found: Found }) {
  if (found.kind === 'shelf') {
    const topic = SHELF_TOPICS[found.index];
    const moment = topic?.moments[found.pick];
    return (
      <>
        <p className="discovery-kicker">{t('discovery.shelf', { topic: topic?.name ?? '' })}</p>
        <h3>{moment?.book}</h3>
        <p>{moment?.text}</p>
      </>
    );
  }
  if (found.kind === 'painting') {
    const painting = PAINTINGS[found.index];
    return (
      <>
        <p className="discovery-kicker">{t('discovery.painting')}</p>
        <h3>{painting?.title}</h3>
        <p>{painting?.story}</p>
      </>
    );
  }
  return (
    <>
      <p className="discovery-kicker">{t('discovery.renovation')}</p>
      <p>{RENOVATION_NOTES[found.pick]}</p>
    </>
  );
}

/** Another moment from the same shelf, never the one just read. */
function another(found: Found) {
  const count = SHELF_TOPICS[found.index]?.moments.length ?? 1;
  if (count < 2) return;
  const next = (found.pick + 1 + Math.floor(Math.random() * (count - 1))) % count;
  useGameStore.getState().setDiscovery({ ...found, pick: next });
}
