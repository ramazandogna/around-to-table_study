/**
 * A character is a stack of Kenney "Roguelike Characters" layers (CC0).
 * Each field is an index into the matching list in CHARACTER_PARTS, so the
 * server can validate an appearance by checking ranges.
 */
export type Appearance = {
  skin: number;
  pants: number;
  shoes: number;
  top: number;
  /** 0 = no hair. */
  hair: number;
  hairColor: number;
  /** 0 = no beard. */
  beard: number;
};

/** Columns in the character spritesheet (16×16 tiles, 1px spacing). */
export const CHARACTER_SHEET_COLUMNS = 54;

/** Hair and beards come in 4×4 blocks per color; styles are [row, column] inside a block. */
type BlockOffset = readonly [row: number, column: number];

export const CHARACTER_PARTS = {
  skin: [0, 54, 108],
  pants: [3, 57, 111, 165, 273, 327, 381, 435],
  shoes: [4, 58, 112, 166, 274, 328, 382, 436],
  top: [6, 7, 8, 10, 11, 14, 15, 276, 277, 280, 281, 284, 285],
  hair: [null, [0, 0], [0, 1], [1, 1], [1, 2], [1, 3], [2, 1], [2, 2], [2, 3]],
  /** Top-left frame of each color block: brown, ginger, blond, dark, white. */
  hairColor: [19, 23, 235, 239, 451],
  beard: [null, [3, 0], [3, 1], [3, 2], [3, 3]],
} as const satisfies Record<keyof Appearance, readonly (number | BlockOffset | null)[]>;

function blockFrame(colorOrigin: number, offset: BlockOffset | null): number | null {
  return offset ? colorOrigin + offset[0] * CHARACTER_SHEET_COLUMNS + offset[1] : null;
}

/** Spritesheet frames to draw, bottom layer first. */
export function characterLayers(look: Appearance): number[] {
  const p = CHARACTER_PARTS;
  const color = p.hairColor[look.hairColor] ?? p.hairColor[0];
  const frames = [
    p.skin[look.skin],
    p.pants[look.pants],
    p.shoes[look.shoes],
    p.top[look.top],
    blockFrame(color, p.beard[look.beard] ?? null),
    blockFrame(color, p.hair[look.hair] ?? null),
  ];
  return frames.filter((f): f is number => typeof f === 'number');
}

export function isValidAppearance(look: Appearance): boolean {
  return (Object.keys(CHARACTER_PARTS) as (keyof Appearance)[]).every(
    (part) =>
      Number.isInteger(look[part]) && look[part] >= 0 && look[part] < CHARACTER_PARTS[part].length,
  );
}

export function randomAppearance(random: () => number = Math.random): Appearance {
  const pick = (part: keyof Appearance) => Math.floor(random() * CHARACTER_PARTS[part].length);
  return {
    skin: pick('skin'),
    pants: pick('pants'),
    shoes: pick('shoes'),
    top: pick('top'),
    hair: pick('hair'),
    hairColor: pick('hairColor'),
    // Most characters are clean-shaven; beards stay a deliberate choice in the creator.
    beard: random() < 0.25 ? pick('beard') : 0,
  };
}
