/**
 * The building's day and year: the light follows the viewer's own clock (a
 * morning sun for someone studying in their morning), and the decoration
 * follows the season (heaters in winter, fans in summer).
 */

export const DAY_PHASES = ['morning', 'day', 'afternoon', 'evening', 'night'] as const;
export type DayPhase = (typeof DAY_PHASES)[number];

/** The part of the day at a local hour (0–24, fractions allowed). */
export function dayPhase(hour: number): DayPhase {
  if (hour >= 6 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 15) return 'day';
  if (hour >= 15 && hour < 18.5) return 'afternoon';
  if (hour >= 18.5 && hour < 22) return 'evening';
  return 'night';
}

export const SEASONS = ['winter', 'spring', 'summer', 'autumn'] as const;
export type Season = (typeof SEASONS)[number];

/** The season of a month (0 = January), as in the northern half of the world. */
export function seasonOf(month: number): Season {
  if (month === 11 || month <= 1) return 'winter';
  if (month <= 4) return 'spring';
  if (month <= 7) return 'summer';
  return 'autumn';
}

/**
 * What the building puts up for the weather: heaters through the cold months
 * (November to March), fans in the summer, nothing in between.
 */
export function weatherDecor(month: number): 'heaters' | 'fans' | null {
  if (month >= 10 || month <= 2) return 'heaters';
  if (month >= 5 && month <= 7) return 'fans';
  return null;
}
