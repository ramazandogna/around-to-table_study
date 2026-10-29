/** Colors of a square-drawn character. Styles (hair shape, outfit) arrive with the creator in Phase 4. */
export type Appearance = {
  skin: number;
  hair: number;
  top: number;
  bottom: number;
};

export const APPEARANCE_OPTIONS = {
  skin: [0xf2d0b1, 0xe0b48f, 0xc68c62, 0x9a6440, 0x6b4129],
  hair: [0x2b1d14, 0x5a3825, 0x9a6a3a, 0xd9b26a, 0xb8462e, 0x3a3a46],
  top: [0x3e6b8a, 0x8c3f3f, 0x4f7a45, 0xd2a03c, 0x6d4f8c, 0xe8e0d0],
  bottom: [0x2f3a4f, 0x4a3a2f, 0x3a3a3a, 0x5a6b7a],
} as const satisfies Record<keyof Appearance, readonly number[]>;

export function randomAppearance(random: () => number = Math.random): Appearance {
  const pick = (options: readonly number[]) =>
    options[Math.floor(random() * options.length)] ?? options[0] ?? 0;
  return {
    skin: pick(APPEARANCE_OPTIONS.skin),
    hair: pick(APPEARANCE_OPTIONS.hair),
    top: pick(APPEARANCE_OPTIONS.top),
    bottom: pick(APPEARANCE_OPTIONS.bottom),
  };
}
