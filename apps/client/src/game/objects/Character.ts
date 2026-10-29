import { TILE_SIZE, type Appearance, type Point } from '@att/shared';
import type Phaser from 'phaser';
import {
  CHARACTER_HEIGHT,
  characterTexture,
  type Facing,
  type WalkFrame,
} from '../render/characterTextures';
import { SpeechBubble } from './SpeechBubble';

const TILES_PER_SECOND = 5;
const STEP_FRAMES: readonly WalkFrame[] = [1, 0, 2, 0];
/** Characters draw above the floor and furniture; within them, lower on screen = in front. */
const DEPTH_BASE = 100;

const tileCenter = (t: Point) => ({
  x: t.x * TILE_SIZE + TILE_SIZE / 2,
  y: t.y * TILE_SIZE + TILE_SIZE / 2,
});

function facingFor(dx: number, dy: number): Facing {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy < 0 ? 'up' : 'down';
}

/** A walking square character: tile-based movement along a path, plus its speech bubble. */
export class Character {
  readonly sprite: Phaser.GameObjects.Image;
  readonly bubble: SpeechBubble;
  /** The tile the character stands on, or is currently stepping onto. */
  tile: Point;
  private path: Point[] = [];
  private stepping = false;
  private facing: Facing = 'down';
  private walkClock = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly look: Appearance,
    start: Point,
  ) {
    this.tile = { ...start };
    const { x, y } = tileCenter(start);
    // Feet sit slightly below the tile center so the head overlaps the tile above.
    this.sprite = scene.add
      .image(x, y + 4, characterTexture(scene, look, 'down', 0))
      .setOrigin(0.5, 1);
    this.bubble = new SpeechBubble(scene);
    this.syncDepth();
  }

  get isMoving(): boolean {
    return this.stepping || this.path.length > 0;
  }

  /** Replaces the current route; an in-progress step finishes first. */
  walk(path: Point[]): void {
    this.path = [...path];
  }

  face(dx: number, dy: number): void {
    this.facing = facingFor(dx, dy);
    this.redraw(0);
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
        this.facing = facingFor(next.x - this.tile.x, next.y - this.tile.y);
        this.tile = next;
        this.stepping = true;
      }
    }

    if (this.stepping) {
      const target = tileCenter(this.tile);
      const targetY = target.y + 4;
      const speed = (TILES_PER_SECOND * TILE_SIZE * deltaMs) / 1000;
      const dx = target.x - this.sprite.x;
      const dy = targetY - this.sprite.y;
      const distance = Math.hypot(dx, dy);

      if (distance <= speed) {
        this.sprite.setPosition(target.x, targetY);
        this.stepping = false;
        arrived = { ...this.tile };
      } else {
        this.sprite.setPosition(
          this.sprite.x + (dx / distance) * speed,
          this.sprite.y + (dy / distance) * speed,
        );
      }
      this.walkClock += deltaMs;
    }

    const moving = this.isMoving;
    if (!moving) this.walkClock = 0;
    const frame = moving
      ? (STEP_FRAMES[Math.floor(this.walkClock / 120) % STEP_FRAMES.length] ?? 0)
      : 0;
    this.redraw(frame);
    this.syncDepth();
    return arrived;
  }

  destroy(): void {
    this.sprite.destroy();
    this.bubble.destroy();
  }

  private redraw(frame: WalkFrame): void {
    this.sprite.setTexture(characterTexture(this.scene, this.look, this.facing, frame));
  }

  private syncDepth(): void {
    const depth = DEPTH_BASE + this.sprite.y;
    this.sprite.setDepth(depth);
    this.bubble.follow(this.sprite.x, this.sprite.y - CHARACTER_HEIGHT, depth + 1000);
  }
}
