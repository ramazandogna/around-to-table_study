import type { Appearance } from '@att/shared';
import type Phaser from 'phaser';

export type Facing = 'down' | 'up' | 'left' | 'right';
export type WalkFrame = 0 | 1 | 2;

// 12×16 pixel grids. h hair · s skin · e eyes · t top · b bottom · o shoes.
const HEAD = {
  down: [
    '....hhhh....',
    '...hhhhhh...',
    '..hhhhhhhh..',
    '..hssssssh..',
    '..sesssses..',
    '..ssssssss..',
    '...ssssss...',
  ],
  up: [
    '....hhhh....',
    '...hhhhhh...',
    '..hhhhhhhh..',
    '..hhhhhhhh..',
    '..hhhhhhhh..',
    '..shhhhhhs..',
    '...ssssss...',
  ],
  side: [
    '....hhhh....',
    '...hhhhhhh..',
    '..hhhhhhhh..',
    '..hhhsssss..',
    '..hhssssess.',
    '..hhssssss..',
    '...ssssss...',
  ],
};

const BODY = {
  front: ['..tttttttt..', '.stttttttts.', '.stttttttts.', '..tttttttt..', '..bbbbbbbb..'],
  side: ['...tttttt...', '...tttsttt..', '...tttsttt..', '...tttttt...', '...bbbbbb...'],
};

const LEGS: Record<'front' | 'side', readonly (readonly string[])[]> = {
  front: [
    ['..bbb..bbb..', '..bbb..bbb..', '..ooo..ooo..', '............'],
    ['..bbb..bbb..', '..ooo..bbb..', '.......bbb..', '.......ooo..'],
    ['..bbb..bbb..', '..bbb..ooo..', '..bbb.......', '..ooo.......'],
  ],
  side: [
    ['....bbbb....', '....bbbb....', '....oooo....', '............'],
    ['...bb..bb...', '..bb....bb..', '..oo....oo..', '............'],
    ['....bbbb....', '....bbbb....', '....oooo....', '............'],
  ],
};

const OUTLINE = '#1d1612';
const EYES = '#1d1612';
const SHOES = '#3a2a20';

function rows(facing: Facing, frame: WalkFrame): string[] {
  const view = facing === 'down' || facing === 'up' ? 'front' : 'side';
  const head = facing === 'down' ? HEAD.down : facing === 'up' ? HEAD.up : HEAD.side;
  const grid = [...head, ...BODY[view], ...(LEGS[view][frame] ?? [])];
  return facing === 'left' ? grid.map((r) => [...r].reverse().join('')) : grid;
}

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

export const CHARACTER_WIDTH = 14;
export const CHARACTER_HEIGHT = 18;

/** Draws (once) and returns the texture key for one pose of an appearance. */
export function characterTexture(
  scene: Phaser.Scene,
  look: Appearance,
  facing: Facing,
  frame: WalkFrame,
): string {
  const key = `char-${look.skin}-${look.hair}-${look.top}-${look.bottom}-${facing}-${frame}`;
  if (scene.textures.exists(key)) return key;

  const colors: Record<string, string> = {
    h: hex(look.hair),
    s: hex(look.skin),
    t: hex(look.top),
    b: hex(look.bottom),
    e: EYES,
    o: SHOES,
  };
  const grid = rows(facing, frame);
  const filled = (x: number, y: number) => (grid[y]?.[x] ?? '.') !== '.';

  const texture = scene.textures.createCanvas(key, CHARACTER_WIDTH, CHARACTER_HEIGHT);
  const ctx = texture?.getContext();
  if (!texture || !ctx) throw new Error(`Could not create texture ${key}`);

  // 1px padding on every side leaves room for the outline.
  for (let y = -1; y <= grid.length; y++) {
    for (let x = -1; x <= 12; x++) {
      const char = grid[y]?.[x];
      if (char && char !== '.') {
        ctx.fillStyle = colors[char] ?? OUTLINE;
      } else if (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1)) {
        ctx.fillStyle = OUTLINE;
      } else {
        continue;
      }
      ctx.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  texture.refresh();
  return key;
}
