import type Phaser from 'phaser';
import { INDOOR, SHEETS } from './tileset';

/** Spine colors picked from the Kenney palette so books match the rest of the art. */
const BOOK_COLORS = ['#c9672f', '#4aa96c', '#3fb1ac', '#e6dabf', '#b04a3a', '#d9a441'];
const GAP_COLOR = '#8f673f';
/** The two shelf openings inside the Kenney shelf tile: [left, top, right, bottom], inclusive. */
const SHELVES = [
  [2, 5, 12, 8],
  [3, 11, 13, 14],
] as const;

export const BOOKCASE_VARIANTS = 3;

/** Deterministic pseudo-random sequence, so bookcases look the same on every load. */
function sequence(seed: number): () => number {
  let state = seed * 9301 + 49297;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

/**
 * Builds bookcase textures from the Kenney indoor shelf tile by refilling
 * its two shelves with book spines. Kenney has no full bookcase tile.
 */
export function createBookcaseTextures(scene: Phaser.Scene): void {
  const shelf = scene.textures.getFrame(SHEETS.indoor.key, INDOOR.shelf);
  if (!shelf) throw new Error('Indoor tileset must be loaded before bookcases are built');

  for (let variant = 0; variant < BOOKCASE_VARIANTS; variant++) {
    const key = bookcaseKey(variant);
    if (scene.textures.exists(key)) continue;

    const texture = scene.textures.createCanvas(key, 16, 16);
    const ctx = texture?.getContext();
    if (!texture || !ctx) throw new Error(`Could not create texture ${key}`);

    ctx.drawImage(
      shelf.source.image as CanvasImageSource,
      shelf.cutX,
      shelf.cutY,
      16,
      16,
      0,
      0,
      16,
      16,
    );

    const random = sequence(variant + 1);
    for (const [left, top, right, bottom] of SHELVES) {
      ctx.fillStyle = GAP_COLOR;
      ctx.fillRect(left, top, right - left + 1, bottom - top + 1);
      for (let x = left; x <= right;) {
        const width = random() < 0.3 ? 2 : 1;
        const height = random() < 0.35 ? bottom - top : bottom - top + 1;
        ctx.fillStyle = BOOK_COLORS[Math.floor(random() * BOOK_COLORS.length)] ?? GAP_COLOR;
        ctx.fillRect(x, bottom - height + 1, Math.min(width, right - x + 1), height);
        x += width + (random() < 0.15 ? 1 : 0);
      }
    }
    texture.refresh();
  }
}

export function bookcaseKey(variant: number): string {
  return `bookcase-${variant % BOOKCASE_VARIANTS}`;
}
