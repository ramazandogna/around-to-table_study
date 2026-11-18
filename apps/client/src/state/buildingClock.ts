import { buildingNow, weatherAt, type Weather } from '@att/shared';
import { useGameStore } from './store';

/**
 * The building's clock on this screen: the server's time, as told by the room
 * on joining (`clockOffset`), so a phone set a few minutes off still sees the
 * same weather and the same cat as everyone else.
 */
export function buildingTime(): number {
  return buildingNow(Date.now(), useGameStore.getState().clockOffset);
}

/** The building's weather right now, the same on every screen. */
export function weatherNow(): Weather {
  return weatherAt(buildingTime());
}
