import { DATA_EPOCH } from '@att/shared';
import { startOverIfNeeded } from './storage';

// Imported first by main.tsx, so it runs before anything reads storage: a
// building that started over forgets old characters.
startOverIfNeeded(DATA_EPOCH);
