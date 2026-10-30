/**
 * A character's look is a set of choices, each an index into one of these
 * lists, so the server can validate it by range and the client decides how
 * to draw it. Colors are hex values so client and creator share one palette.
 */
export const LOOK_OPTIONS = {
  skin: ['#FBDCC6', '#F4BC98', '#E19A72', '#C47F55', '#9A5F3B', '#6B3F26'],
  hair: ['short', 'long', 'bob', 'curly', 'tied', 'buzz', 'bald'],
  hairColor: [
    '#231C18',
    '#4D2A1A',
    '#7A4A2A',
    '#A2452A',
    '#D9AE62',
    '#B8B4AE',
    '#E59BB4',
    '#4F78C7',
  ],
  top: ['tee', 'sweater', 'hoodie', 'stripes'],
  topColor: [
    '#F2E8D5',
    '#3A3D46',
    '#2F4A73',
    '#3F6B4A',
    '#D9A441',
    '#C8603E',
    '#8E2F3C',
    '#8DB8D9',
    '#A893C9',
    '#E8E2DA',
  ],
  bottom: ['jeans', 'trousers', 'shorts'],
  bottomColor: [
    '#2F4A73',
    '#3A3D46',
    '#7B6A55',
    '#C7B48E',
    '#4A5A3A',
    '#6C3B2E',
    '#1F2A3D',
    '#8C8C8C',
  ],
} as const;

export type LookPart = keyof typeof LOOK_OPTIONS;
export type Appearance = Record<LookPart, number>;

export const LOOK_PARTS = Object.keys(LOOK_OPTIONS) as LookPart[];

export function isValidAppearance(look: unknown): look is Appearance {
  if (typeof look !== 'object' || look === null) return false;
  const parts = look as Record<string, unknown>;
  return LOOK_PARTS.every((part) => {
    const value = parts[part];
    return (
      Number.isInteger(value) &&
      (value as number) >= 0 &&
      (value as number) < LOOK_OPTIONS[part].length
    );
  });
}

export function randomAppearance(random: () => number = Math.random): Appearance {
  const pick = (part: LookPart) => Math.floor(random() * LOOK_OPTIONS[part].length);
  return {
    skin: pick('skin'),
    hair: pick('hair'),
    hairColor: pick('hairColor'),
    top: pick('top'),
    topColor: pick('topColor'),
    bottom: pick('bottom'),
    bottomColor: pick('bottomColor'),
  };
}
