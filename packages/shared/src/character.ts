/**
 * A character is one of the Kenney "Mini Characters" (CC0): six women and six
 * men, each with their own face, hair and clothes. A look is an index into
 * this list, so the server can validate it by range and the client decides
 * how to draw it.
 */
export const CHARACTERS = [
  'female-a',
  'female-b',
  'female-c',
  'female-d',
  'female-e',
  'female-f',
  'male-a',
  'male-b',
  'male-c',
  'male-d',
  'male-e',
  'male-f',
] as const;

export type CharacterId = (typeof CHARACTERS)[number];

export type Appearance = { character: number };

export function isValidAppearance(look: unknown): look is Appearance {
  if (typeof look !== 'object' || look === null) return false;
  const { character } = look as Record<string, unknown>;
  return (
    Number.isInteger(character) &&
    (character as number) >= 0 &&
    (character as number) < CHARACTERS.length
  );
}

export function randomAppearance(random: () => number = Math.random): Appearance {
  return { character: Math.floor(random() * CHARACTERS.length) };
}
