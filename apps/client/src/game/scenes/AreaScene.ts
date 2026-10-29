import {
  TILE_SIZE,
  createAreaGrid,
  findPath,
  randomAppearance,
  resolveWalkTarget,
  type AreaGrid,
  type AreaId,
  type Appearance,
  type BlockReason,
  type Point,
} from '@att/shared';
import Phaser from 'phaser';
import { t, type MessageKey } from '../../i18n/t';
import { useGameStore } from '../../state/store';
import { cameraCenter, zoomFor } from '../camera';
import { Character } from '../objects/Character';
import { WALL_TOP_ROWS, drawArea } from '../render/drawArea';
import { preloadTilesets } from '../render/tileset';

type AreaSceneData = { area?: AreaId; from?: AreaId };

const BLOCK_MESSAGES: Partial<Record<BlockReason, MessageKey>> = {
  renovation: 'blocked.renovation',
  elevator: 'blocked.elevator',
};
const BLOCK_MESSAGE_COOLDOWN_MS = 2500;
const CAMERA_LERP = 0.15;
const FADE_MS = 200;

/** One walkable area (hall, library, smoking room). Doors restart the scene with another area. */
export class AreaScene extends Phaser.Scene {
  private areaId: AreaId = 'hall';
  private arrivedFrom: AreaId | undefined;
  private grid!: AreaGrid;
  private player!: Character;
  private keys!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key[]>;
  private leaving = false;
  private lastBlockMessageAt = -Infinity;
  private cameraTarget = { x: 0, y: 0 };

  constructor() {
    super('area');
  }

  init(data: AreaSceneData): void {
    this.areaId = data.area ?? 'hall';
    this.arrivedFrom = data.from;
    this.leaving = false;
  }

  preload(): void {
    preloadTilesets(this);
  }

  create(): void {
    this.grid = createAreaGrid(this.areaId);
    drawArea(this, this.grid);
    useGameStore.getState().setArea(this.areaId);

    const start = this.arrivedFrom
      ? this.grid.arrivalPoint(this.arrivedFrom)
      : this.grid.area.spawn;
    this.player = new Character(this, this.appearance(), start);

    this.setupCamera();
    this.setupInput();
    this.cameras.main.fadeIn(FADE_MS);
  }

  override update(_time: number, delta: number): void {
    if (this.leaving) return;
    this.handleKeyboard();

    const arrived = this.player.update(delta);
    if (arrived) this.checkDoor(arrived);

    this.followPlayer(CAMERA_LERP);
  }

  /** The player's look survives area changes for the whole session. */
  private appearance(): Appearance {
    const stored = this.registry.get('appearance') as Appearance | undefined;
    if (stored) return stored;
    const look = randomAppearance();
    this.registry.set('appearance', look);
    return look;
  }

  private setupCamera(): void {
    const cam = this.cameras.main;
    const applyZoom = () => {
      cam.setZoom(zoomFor(this.scale.width, this.scale.height));
      this.followPlayer(1);
    };
    applyZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, applyZoom);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.scale.off(Phaser.Scale.Events.RESIZE, applyZoom),
    );
  }

  private followPlayer(lerp: number): void {
    const cam = this.cameras.main;
    const target = {
      x: cameraCenter(this.player.sprite.x, this.grid.width * TILE_SIZE, cam.width / cam.zoom),
      y:
        cameraCenter(
          this.player.sprite.y + WALL_TOP_ROWS * TILE_SIZE,
          (this.grid.height + WALL_TOP_ROWS) * TILE_SIZE,
          cam.height / cam.zoom,
        ) -
        WALL_TOP_ROWS * TILE_SIZE,
    };
    this.cameraTarget.x += (target.x - this.cameraTarget.x) * lerp;
    this.cameraTarget.y += (target.y - this.cameraTarget.y) * lerp;
    cam.centerOn(this.cameraTarget.x, this.cameraTarget.y);
  }

  private setupInput(): void {
    const keyboard = this.input.keyboard;
    const add = (...codes: number[]) =>
      codes.map((code) => keyboard?.addKey(code, false)).filter((k) => !!k);
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      up: add(K.W, K.UP),
      down: add(K.S, K.DOWN),
      left: add(K.A, K.LEFT),
      right: add(K.D, K.RIGHT),
    };

    this.input.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      const tile = {
        x: Math.floor(pointer.worldX / TILE_SIZE),
        y: Math.floor(pointer.worldY / TILE_SIZE),
      };
      this.walkTo(tile);
    });
  }

  private handleKeyboard(): void {
    if (this.player.isMoving) return;
    const held = (dir: keyof typeof this.keys) => this.keys[dir].some((k) => k.isDown);
    const dx = (held('right') ? 1 : 0) - (held('left') ? 1 : 0);
    const dy = dx !== 0 ? 0 : (held('down') ? 1 : 0) - (held('up') ? 1 : 0);
    if (dx === 0 && dy === 0) return;

    const next = { x: this.player.tile.x + dx, y: this.player.tile.y + dy };
    const reason = this.grid.blockReason(next);
    if (reason) {
      this.player.face(dx, dy);
      this.explainBlock(reason);
      return;
    }
    this.player.walk([next]);
  }

  private walkTo(tile: Point): void {
    if (this.leaving) return;
    const reason = this.grid.blockReason(tile);
    if (reason && BLOCK_MESSAGES[reason]) {
      this.explainBlock(reason);
      return;
    }
    const goal = resolveWalkTarget(this.grid, this.player.tile, tile);
    const path = goal && findPath(this.grid, this.player.tile, goal);
    if (path) this.player.walk(path);
  }

  private explainBlock(reason: BlockReason): void {
    const key = BLOCK_MESSAGES[reason];
    if (!key || this.time.now - this.lastBlockMessageAt < BLOCK_MESSAGE_COOLDOWN_MS) return;
    this.lastBlockMessageAt = this.time.now;
    this.player.say(t(key));
  }

  private checkDoor(tile: Point): void {
    const to = this.grid.doorTarget(tile);
    if (!to) return;
    this.leaving = true;
    this.cameras.main.fadeOut(FADE_MS);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () =>
      this.scene.restart({ area: to, from: this.areaId } satisfies AreaSceneData),
    );
  }
}
