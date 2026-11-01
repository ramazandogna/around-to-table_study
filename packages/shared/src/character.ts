/**
 * A character is one of the Kenney "Mini Characters" (CC0): six women and six
 * men, each with their own face, hair and clothes. A look is an index into
 * this list, plus optional colours for the skin, hair and outfit (indexes into
 * the palettes below; left out, the character keeps its own colours) and an
 * optional pet. The server validates by range and the client decides how to
 * draw it.
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

/** The parts of a character that can be recoloured. */
export const OUTFIT_PARTS = ['skin', 'hair', 'top', 'bottom', 'shoes'] as const;
export type OutfitPart = (typeof OUTFIT_PARTS)[number];

/** Colours offered for each part, as hex. Only ever append, so saved looks keep their colour. */
export const PALETTES: Record<OutfitPart, readonly string[]> = {
  skin: ['#ffe2c8', '#f3c7a0', '#e2a878', '#c98656', '#9e6038', '#6f4127'],
  hair: [
    '#2b2420',
    '#5a3a24',
    '#8c5a2b',
    '#d9a75a',
    '#efe1b6',
    '#b5462e',
    '#a3a7ae',
    '#4a6fd1',
    '#d46aa8',
  ],
  top: [
    '#e65f4f',
    '#f29e4c',
    '#f7d154',
    '#5cc37c',
    '#3fa7a1',
    '#4f7fd8',
    '#8a63d2',
    '#f3f0e8',
    '#3a3d4a',
    '#c97a9b',
  ],
  bottom: ['#3a3d4a', '#4f5d8a', '#6e86c4', '#7b6450', '#c9b48f', '#2f5e48', '#8a3b3b', '#e8e4da'],
  shoes: ['#2b2b30', '#f2f2f2', '#7a4a2a', '#d94a3a', '#4a72c9', '#e6c34a'],
};

/**
 * Pets that walk along with their person: a cat, four dogs (a beagle, a corgi
 * and a dachshund, small, and a shiba), a rabbit and a turtle. Each has its own
 * ways (see the client's Pet). Ones not in PETS_AVAILABLE show as coming soon.
 */
export const PETS = ['cat', 'dog', 'corgi', 'dachshund', 'shiba', 'rabbit', 'turtle'] as const;
export type PetKind = (typeof PETS)[number];
export const PETS_AVAILABLE: readonly PetKind[] = PETS;

/** A pet's fur, as hex. Left out, the pet keeps its own colour. Only ever append. */
export const PET_COLORS = [
  '#f0a057',
  '#f6e7cf',
  '#3b3a40',
  '#8a5a3c',
  '#ffffff',
  '#c9b9a6',
] as const;
export const PET_SEXES = ['female', 'male'] as const;
export type PetSex = (typeof PET_SEXES)[number];
/** Something for the pet to wear. */
export const PET_ACCESSORIES = ['collar', 'bell', 'bow', 'scarf', 'hat', 'glasses'] as const;
export type PetAccessory = (typeof PET_ACCESSORIES)[number];

export type Appearance = {
  character: number;
  pet?: PetKind | undefined;
  petSex?: PetSex | undefined;
  /** Index into PET_COLORS. */
  petColor?: number | undefined;
  petAccessory?: PetAccessory | undefined;
} & { [P in OutfitPart]?: number | undefined };

const isIndex = (value: unknown, length: number) =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) < length;

export function isValidAppearance(look: unknown): look is Appearance {
  if (typeof look !== 'object' || look === null) return false;
  const fields = look as Record<string, unknown>;
  if (!isIndex(fields.character, CHARACTERS.length)) return false;
  for (const part of OUTFIT_PARTS) {
    const value = fields[part];
    if (value !== undefined && !isIndex(value, PALETTES[part].length)) return false;
  }
  const { pet, petSex, petColor, petAccessory } = fields;
  if (pet !== undefined && !PETS_AVAILABLE.includes(pet as PetKind)) return false;
  if (petSex !== undefined && !PET_SEXES.includes(petSex as PetSex)) return false;
  if (petColor !== undefined && !isIndex(petColor, PET_COLORS.length)) return false;
  return petAccessory === undefined || PET_ACCESSORIES.includes(petAccessory as PetAccessory);
}

export function randomAppearance(random: () => number = Math.random): Appearance {
  return { character: Math.floor(random() * CHARACTERS.length) };
}
