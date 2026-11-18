import { CAT_NAME, staffTopics, type AreaId, type DayPhase, type Weather } from '@att/shared';
import { PAINTINGS, SHELF_TOPICS } from '../content/discoveries';
import { t, type MessageKey } from '../i18n/t';
import { paintingRooms } from './paintings';

/**
 * What staff say when tapped, worked out from what they can see: the
 * player's name and the time of day, one thing the player has not found yet,
 * how many people are studying (never fewer than two, never who), the
 * building's weather, then their own lines. Nothing about how long anyone
 * was away. Each tap says the next one (see shared `staffTopics`).
 */

export type TalkContext = {
  name: string;
  /** The room they work in. */
  area: AreaId;
  kind: 'librarian' | 'receptionist';
  phase: DayPhase;
  weather: Weather;
  /** People studying in the building right now. */
  studying: number;
  /** What the player has found, as remembered on this device (`kind:index[:pick]`). */
  found: ReadonlySet<string>;
  own: readonly MessageKey[];
};

/** The line for the n-th tap. */
export function staffLine(turn: number, context: TalkContext): string {
  const hint = hintFor(context);
  const topics = staffTopics({ hint: hint !== null, studying: context.studying });
  const topic = topics[turn % topics.length] ?? 'own';
  switch (topic) {
    case 'greet':
      return t(`staff.greet.${context.phase}`, { name: context.name });
    case 'hint':
      return hint ?? '';
    case 'company':
      return t('staff.company', { count: context.studying });
    case 'weather':
      return t(
        context.weather === 'clear' && (context.phase === 'night' || context.phase === 'evening')
          ? 'staff.weather.clearNight'
          : `staff.weather.${context.weather}`,
      );
    case 'own': {
      // Their own lines take turns, one per round of topics.
      const own = context.own[Math.floor(turn / topics.length) % Math.max(1, context.own.length)];
      return own ? t(own) : '';
    }
  }
}

/**
 * One thing left to find, nearest first: the librarian knows the shelves and
 * the library's paintings, the receptionist the hall's gallery; both know the
 * cat. Null once everything they know of is found.
 */
function hintFor({ area, kind, found }: TalkContext): string | null {
  const shelf = SHELF_TOPICS.findIndex((topic, index) =>
    topic.moments.some((_, pick) => !found.has(`shelf:${index}:${pick}`)),
  );
  const rooms = paintingRooms();
  const unseen = PAINTINGS.map((_, index) => index).filter((i) => !found.has(`painting:${i}`));
  const here = unseen.find((i) => rooms.get(i) === area);
  const elsewhere = unseen.find((i) => rooms.has(i) && rooms.get(i) !== area);
  const cat = !found.has('cat:0');
  const hints: (string | null)[] = [];
  const shelfHint =
    shelf >= 0 ? t('staff.hint.shelf', { topic: SHELF_TOPICS[shelf]?.name ?? '' }) : null;
  const hereHint =
    here !== undefined ? t('staff.hint.painting', { title: PAINTINGS[here]?.title ?? '' }) : null;
  const elsewhereHint =
    elsewhere !== undefined
      ? t('staff.hint.paintingIn', { area: t(`area.${rooms.get(elsewhere) ?? 'hall'}`) })
      : null;
  const catHint = cat ? t('staff.hint.cat', { cat: CAT_NAME }) : null;
  if (kind === 'librarian') hints.push(shelfHint, hereHint, catHint, elsewhereHint);
  else hints.push(hereHint, catHint, elsewhereHint, shelfHint);
  return hints.find((h) => h !== null) ?? null;
}
