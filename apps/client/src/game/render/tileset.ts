import type Phaser from 'phaser';

/** Kenney "Roguelike" base, indoor and characters packs (CC0): 16×16 tiles with 1px spacing. */
export const SHEETS = {
  base: { key: 'base', url: 'tiles/roguelike-base.png' },
  indoor: { key: 'indoor', url: 'tiles/roguelike-indoor.png' },
  characters: { key: 'characters', url: 'tiles/roguelike-characters.png' },
} as const;

export function preloadTilesets(scene: Phaser.Scene): void {
  for (const sheet of Object.values(SHEETS)) {
    scene.load.spritesheet(sheet.key, sheet.url, { frameWidth: 16, frameHeight: 16, spacing: 1 });
  }
}

/** Frame indices (0-based, row-major) in the base sheet. */
export const BASE = {
  floorStone: 120,
  floorParquet: 119,
  floorPlanks: 122,
  wallFace: 868,
  windowArched: 158,
  doubleDoorGlass: 440,
  elevatorDoor: 147,
  chairFacingDown: 190,
  chairFacingUp: 191,
  chairFacingLeft: 192,
  chairFacingRight: 193,
  /** Wall-top rims, keyed by which neighbors are also wall tops. */
  wallTop: {
    E: 697,
    W: 699,
    S: 754,
    N: 811,
    EW: 698,
    NS: 756,
    ES: 700,
    SW: 701,
    EN: 757,
    NW: 758,
    ENS: 702,
    NSW: 759,
    ENSW: 755,
  } as Record<string, number>,
  /** 3×3 carpet pieces: [top, middle, bottom] × [left, center, right]. */
  carpetGreen: [
    [922, 923, 924],
    [979, 980, 981],
    [1036, 1037, 1038],
  ],
  carpetOrange: [
    [751, 752, 753],
    [808, 809, 810],
    [865, 866, 867],
  ],
} as const;

/** Frame indices in the indoor sheet. */
export const INDOOR = {
  plant: 16,
  bench: 88,
  ashtray: 230,
  shelf: 462,
  longTableLeft: 0,
  longTableMiddle: 1,
  longTableRight: 2,
  ovalTableLeft: 237,
  ovalTableMiddle: 235,
  ovalTableRight: 238,
} as const;
