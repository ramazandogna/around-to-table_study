import {
  TILE_SIZE,
  createAreaGrid,
  findPath,
  resolveWalkTarget,
  type AreaGrid,
  type AreaId,
  type BlockReason,
  type PlayerSnapshot,
  type Point,
  type ServerMessage,
} from '@att/shared';
import Phaser from 'phaser';
import { t, type MessageKey } from '../../i18n/t';
import { AreaConnection } from '../../net/AreaConnection';
import { loadLook } from '../../net/session';
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

const sameTile = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

/** One walkable area (hall, library, smoking room). Doors restart the scene with another area. */
export class AreaScene extends Phaser.Scene {
  private areaId: AreaId = 'hall';
  private arrivedFrom: AreaId | undefined;
  private grid!: AreaGrid;
  private player!: Character;
  private others = new Map<string, Character>();
  private connection: AreaConnection | null = null;
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
    this.others = new Map();
  }

  preload(): void {
    preloadTilesets(this);
  }

  create(): void {
    const store = useGameStore.getState();
    const session = store.session;
    if (!session) throw new Error('AreaScene needs a guest session');

    this.grid = createAreaGrid(this.areaId);
    drawArea(this, this.grid);
    store.setArea(this.areaId);
    store.setPlayersHere(1);

    const look = loadLook();
    const start = this.arrivedFrom
      ? this.grid.arrivalPoint(this.arrivedFrom)
      : this.grid.area.spawn;
    this.player = new Character(this, look, start, session.name);

    this.connection = new AreaConnection({
      area: this.areaId,
      from: this.arrivedFrom,
      token: session.token,
      look,
      onMessage: (message) => this.onServerMessage(message),
      onStatus: (connected) => useGameStore.getState().setConnected(connected),
    });
    store.setConnection(this.connection);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.disconnect());

    this.setupCamera();
    this.setupInput();
    this.cameras.main.fadeIn(FADE_MS);
  }

  override update(_time: number, delta: number): void {
    if (this.leaving) return;
    this.handleKeyboard();

    const arrived = this.player.update(delta);
    if (arrived) this.checkDoor(arrived);
    for (const other of this.others.values()) other.update(delta);

    this.followPlayer(CAMERA_LERP);
  }

  private onServerMessage(message: ServerMessage): void {
    const selfId = useGameStore.getState().session?.id;
    switch (message.t) {
      case 'welcome':
        for (const other of this.others.values()) other.destroy();
        this.others.clear();
        message.players.forEach((p) => this.addOther(p));
        // After a reconnect the server puts us at the door; walk back to where we are.
        if (!sameTile(message.tile, this.player.tile)) this.connection?.move(this.player.tile);
        break;
      case 'joined':
        if (message.player.id !== selfId) this.addOther(message.player);
        break;
      case 'left':
        this.others.get(message.id)?.destroy();
        this.others.delete(message.id);
        break;
      case 'moved': {
        const other = this.others.get(message.id);
        if (!other) break;
        const path = findPath(this.grid, other.tile, message.to);
        if (path) other.walk(path);
        else other.teleport(message.to);
        break;
      }
      case 'placed':
        if (message.id === selfId && !sameTile(this.player.tile, message.tile)) {
          this.player.teleport(message.tile);
        }
        break;
      case 'said':
        (message.id === selfId ? this.player : this.others.get(message.id))?.say(message.text);
        break;
      case 'error':
        if (message.code === 'rate_limited' || message.code === 'replaced') {
          useGameStore.getState().setNotice(message.code);
        }
        break;
    }
    useGameStore.getState().setPlayersHere(this.others.size + 1);
  }

  private addOther(player: PlayerSnapshot): void {
    this.others.get(player.id)?.destroy();
    this.others.set(player.id, new Character(this, player.look, player.tile, player.name));
  }

  private disconnect(): void {
    this.connection?.close();
    this.connection = null;
    useGameStore.getState().setConnection(null);
    for (const other of this.others.values()) other.destroy();
    this.others.clear();
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
    const top = WALL_TOP_ROWS * TILE_SIZE;
    const target = {
      x: cameraCenter(this.player.sprite.x, this.grid.width * TILE_SIZE, cam.width / cam.zoom),
      y:
        cameraCenter(
          this.player.sprite.y + top,
          this.grid.height * TILE_SIZE + top,
          cam.height / cam.zoom,
        ) - top,
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

    // pointerdown only fires on the canvas, so taps on the chat bar never walk the character.
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      this.walkTo({
        x: Math.floor(pointer.worldX / TILE_SIZE),
        y: Math.floor(pointer.worldY / TILE_SIZE),
      });
    });
  }

  private handleKeyboard(): void {
    if (this.player.isMoving || useGameStore.getState().typing) return;
    const held = (dir: keyof typeof this.keys) => this.keys[dir].some((k) => k.isDown);
    const dx = (held('right') ? 1 : 0) - (held('left') ? 1 : 0);
    const dy = dx !== 0 ? 0 : (held('down') ? 1 : 0) - (held('up') ? 1 : 0);
    if (dx === 0 && dy === 0) return;

    const next = { x: this.player.tile.x + dx, y: this.player.tile.y + dy };
    const reason = this.grid.blockReason(next);
    if (reason) {
      this.player.face(dx);
      this.explainBlock(reason);
      return;
    }
    this.player.walk([next]);
    this.connection?.move(next);
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
    if (!goal || !path) return;
    this.player.walk(path);
    this.connection?.move(goal);
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
