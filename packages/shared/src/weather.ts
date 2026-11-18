import { HOUR_MS, utcMonth, utcSlot } from './clock';
import { chance } from './staff';
import { seasonOf, type Season } from './time';

/**
 * The building's weather: made up, but the same for everyone at the same
 * moment, like the sky in a shared story. It changes every few hours by the
 * UTC clock and follows the season (snow only in the cold months), with no
 * server and no real forecast, so nobody's location is ever asked for.
 */

export const WEATHERS = ['clear', 'cloudy', 'rain', 'snow'] as const;
export type Weather = (typeof WEATHERS)[number];

/** The weather holds this long before it may change. */
export const WEATHER_BLOCK_MS = 3 * HOUR_MS;

/** How likely each weather is in a season; each row adds up to 1. Snow only in winter. */
export const WEATHER_ODDS: Record<Season, Record<Weather, number>> = {
  winter: { clear: 0.3, cloudy: 0.3, rain: 0.15, snow: 0.25 },
  spring: { clear: 0.4, cloudy: 0.3, rain: 0.3, snow: 0 },
  summer: { clear: 0.6, cloudy: 0.25, rain: 0.15, snow: 0 },
  autumn: { clear: 0.3, cloudy: 0.35, rain: 0.35, snow: 0 },
};

/** A salt so the weather does not move in step with the staff, who use the same random. */
const SALT = 0x5eed;

/** The weather at a moment of the building's clock (see `buildingNow`). */
export function weatherAt(now: number): Weather {
  const block = utcSlot(now, WEATHER_BLOCK_MS);
  const odds = WEATHER_ODDS[seasonOf(utcMonth(now))];
  let roll = chance(block * 7 + SALT);
  for (const weather of WEATHERS) {
    roll -= odds[weather];
    if (roll < 0) return weather;
  }
  return 'clear';
}

/** Whether it falls from the sky: what the windows, the street and the sound show. */
export function isWet(weather: Weather): boolean {
  return weather === 'rain' || weather === 'snow';
}
