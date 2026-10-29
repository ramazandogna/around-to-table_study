import { characterLayers, type Appearance } from '@att/shared';
import type Phaser from 'phaser';
import { SHEETS } from './tileset';

export const CHARACTER_SIZE = 16;

/** Composites (once) the Kenney character layers of an appearance and returns the texture key. */
export function characterTexture(scene: Phaser.Scene, look: Appearance): string {
  const layers = characterLayers(look);
  const key = `char-${layers.join('-')}`;
  if (scene.textures.exists(key)) return key;

  const texture = scene.textures.createCanvas(key, CHARACTER_SIZE, CHARACTER_SIZE);
  const ctx = texture?.getContext();
  if (!texture || !ctx) throw new Error(`Could not create texture ${key}`);

  for (const layer of layers) {
    const frame = scene.textures.getFrame(SHEETS.characters.key, layer);
    if (!frame) continue;
    ctx.drawImage(
      frame.source.image as CanvasImageSource,
      frame.cutX,
      frame.cutY,
      CHARACTER_SIZE,
      CHARACTER_SIZE,
      0,
      0,
      CHARACTER_SIZE,
      CHARACTER_SIZE,
    );
  }
  texture.refresh();
  return key;
}
