import { getLanguage } from '../i18n/t';
import * as en from './discoveries.en';
import * as tr from './discoveries.tr';

/**
 * Shelves, paintings, renovation notes and flaws in the player's language.
 * Switching the language reloads the page, so picking once is enough.
 */
export type { Flaw, FlawId, Painting, ShelfTopic } from './discoveries.en';
export { FLAW_IDS, HALL_GALLERY } from './discoveries.en';

const content = getLanguage() === 'tr' ? tr : en;

export const SHELF_TOPICS = content.SHELF_TOPICS;
export const PAINTINGS = content.PAINTINGS;
export const RENOVATION_NOTES = content.RENOVATION_NOTES;
export const FLAWS = content.FLAWS;
