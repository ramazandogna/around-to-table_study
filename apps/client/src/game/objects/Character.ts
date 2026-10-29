import { TILE_SIZE, type Appearance, type Point } from '@att/shared';
import type Phaser from 'phaser';
import { CHARACTER_SIZE, characterTexture } from '../render/characterTexture';
import { SpeechBubble, TEXT_RESOLUTION } from './SpeechBubble';

const TILES_PER_SECOND = 5;
/** Kenney characters only face forward, so walking is shown as a small hop. */
const HOP_HEIGHT = 1.5;
const HOP_MS = 220;
/** Characters draw above the floor and furniture; within them, lower on screen = in front. */
const DEPTH_BASE = 100;
/** Feet sit slightly below the tile center so the head overlaps the tile above. */
const FEET_OFFSET = 6;

const tileCenter = (t: Point) => ({
  x: t.x * TILE_SIZE + TILE_SIZE / 2,
  y: t.y * TILE_SIZE + TILE_SIZE / 2 + FEET_OFFSET,
});

/** A walking character: tile-based movement along a path, plus its speech bubble. */
export class Character {
  readonly sprite: Phaser.GameObjects.Image;
  readonly bubble: SpeechBubble;
  private readonly nameLabel: Phaser.GameObjects.Text;
  /** The tile the character stands on, or is currently stepping onto. */
  tile: Point;
  private path: Point[] = [];
  private stepping = false;
  private walkClock = 0;
  /** Ground position; the sprite is drawn above it while hopping. */
  private readonly position: { x: number; y: number };

  constructor(scene: Phaser.Scene, look: Appearance, start: Point, name: string) {
    this.tile = { ...start };
    this.position = tileCenter(start);
    this.sprite = scene.add
      .image(this.position.x, this.position.y, characterTexture(scene, look))
      .setOrigin(0.5, 1);
    this.nameLabel = scene.add
      .text(0, 0, name, {
        fontFamily: 'monospace',
        fontSize: `${5 * TEXT_RESOLUTION}px`,
        color: '#f5ecd7',
        stroke: '#1d1612',
        strokeThickness: TEXT_RESOLUTION,
      })
      .setOrigin(0.5, 0)
      .setScale(1 / TEXT_RESOLUTION);
    this.bubble = new SpeechBubble(scene);
    this.sync(0);
  }

  get isMoving(): boolean {
    return this.stepping || this.path.length > 0;
  }

  /** Replaces the current route; an in-progress step finishes first. */
  walk(path: Point[]): void {
    this.path = [...path];
  }

  /** Jumps straight to a tile, dropping any planned route. */
  teleport(tile: Point): void {
    this.path = [];
    this.stepping = false;
    this.tile = { ...tile };
    Object.assign(this.position, tileCenter(tile));
    this.sync(0);
  }

  /** Turns left or right; front and back look the same for Kenney characters. */
  face(dx: number): void {
    if (dx !== 0) this.sprite.setFlipX(dx < 0);
  }

  say(message: string): void {
    this.bubble.show(message);
  }

  /** Advances movement. Returns the tile reached this frame, if a step completed. */
  update(deltaMs: number): Point | null {
    let arrived: Point | null = null;

    if (!this.stepping) {
      const next = this.path.shift();
      if (next) {
        this.face(next.x - this.tile.x);
        this.tile = next;
        this.stepping = true;
      }
    }

    if (this.stepping) {
      const target = tileCenter(this.tile);
      const speed = (TILES_PER_SECOND * TILE_SIZE * deltaMs) / 1000;
      const dx = target.x - this.position.x;
      const dy = target.y - this.position.y;
      const distance = Math.hypot(dx, dy);

      if (distance <= speed) {
        this.position.x = target.x;
        this.position.y = target.y;
        this.stepping = false;
        arrived = { ...this.tile };
      } else {
        this.position.x += (dx / distance) * speed;
        this.position.y += (dy / distance) * speed;
      }
      this.walkClock += deltaMs;
    }

    if (!this.isMoving) this.walkClock = 0;
    const hop = this.walkClock
      ? Math.abs(Math.sin((this.walkClock / HOP_MS) * Math.PI)) * HOP_HEIGHT
      : 0;
    this.sync(hop);
    return arrived;
  }

  destroy(): void {
    this.sprite.destroy();
    this.nameLabel.destroy();
    this.bubble.destroy();
  }

  private sync(hop: number): void {
    const depth = DEPTH_BASE + this.position.y;
    this.sprite.setPosition(this.position.x, Math.round(this.position.y - hop)).setDepth(depth);
    this.nameLabel
      .setPosition(Math.round(this.position.x), Math.round(this.position.y))
      .setDepth(depth);
    this.bubble.follow(this.position.x, this.position.y - CHARACTER_SIZE, depth + 1000);
  }
}
