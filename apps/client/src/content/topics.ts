import { getLanguage } from '../i18n/t';
import { TOPICS as EN } from './topics.en';
import { TOPICS as TR } from './topics.tr';

/**
 * Conversation starters from the topic jars, in the player's language (see
 * `topics.en.ts`). Switching the language reloads the page.
 */
export const TOPICS: readonly string[] = getLanguage() === 'tr' ? TR : EN;
