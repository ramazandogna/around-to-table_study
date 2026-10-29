/**
 * A character is the Kenney "Animated Characters" model with one of these skins (CC0).
 * The look is an index into CHARACTER_SKINS so the server can validate it by range.
 * The character creator (Phase 4) will add more parts once a modular pack is in.
 */
export type Appearance = {
  skin: number;
};

export const CHARACTER_SKINS = [
  'humanFemaleA',
  'humanMaleA',
  'skaterFemaleA',
  'skaterMaleA',
] as const;

export function isValidAppearance(look: Appearance): boolean {
  return Number.isInteger(look.skin) && look.skin >= 0 && look.skin < CHARACTER_SKINS.length;
}

export function randomAppearance(random: () => number = Math.random): Appearance {
  return { skin: Math.floor(random() * CHARACTER_SKINS.length) };
}
