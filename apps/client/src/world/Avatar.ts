import type { Appearance, Point } from '@att/shared';
import { AnimationMixer, Group, MathUtils, Vector3, type AnimationAction } from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { CHAIR_INSET, FLOOR_Y, SEAT_HEIGHT } from './buildArea';
import type { CharacterKit } from './characters';

const TILES_PER_SECOND = 2.4;
/** Roughly matches the derived walk's stride to the ground speed. */
const WALK_ANIMATION_SPEED = 0.6;
const TURN_SPEED = 12;
const FADE_SECONDS = 0.25;
/** Keyboard walking stops for a frame between tiles; poses only change after a real stop. */
const SETTLE_SECONDS = 0.15;
/** How quickly the body slides onto or off a chair. */
const SEAT_EASE = 9;
/** The hips rest slightly behind the chair's center, against the backrest. */
const SIT_INSET = CHAIR_INSET - 0.05;
/** The hip joint sits this far above the cushion (half a thigh). */
const HIP_ABOVE_SEAT = 0.07;
const LABEL_HEIGHT = 1.95;
const SEATED_LABEL_HEIGHT = 1.55;
const BUBBLE_MIN_MS = 3000;
const BUBBLE_MAX_MS = 9000;

const tileCenter = (t: Point) => ({ x: t.x + 0.5, z: t.y + 0.5 });

/** Direction from a seat tile towards its table, or null if the tile is not a seat. */
export type SeatLookup = (tile: Point) => Point | null;

type Pose = 'idle' | 'walk' | 'sit';

/** A player in the world: animated model, tile movement and a DOM label with name and bubble. */
export class Avatar {
  readonly root = new Group();
  /** The tile the avatar stands on, or is currently stepping onto. */
  tile: Point;
  private path: Point[] = [];
  private stepping = false;
  private heading = 0;
  private readonly model: Group;
  private readonly mixer: AnimationMixer;
  private readonly actions: Record<Pose, AnimationAction>;
  private pose: Pose = 'idle';
  private stillFor = 0;
  private readonly seatedY: number;
  private readonly settleTarget = new Vector3();
  private readonly bubble: HTMLDivElement;
  private readonly label: CSS2DObject;
  private bubbleTimer = 0;

  constructor(
    kit: CharacterKit,
    look: Appearance,
    start: Point,
    name: string,
    isSelf: boolean,
    private readonly seats: SeatLookup,
  ) {
    this.tile = { ...start };
    const { x, z } = tileCenter(start);
    this.root.position.set(x, FLOOR_Y, z);

    this.model = kit.create(look);
    this.root.add(this.model);
    this.mixer = new AnimationMixer(this.model);
    this.actions = {
      idle: this.mixer.clipAction(kit.clips.idle),
      walk: this.mixer.clipAction(kit.clips.walk),
      sit: this.mixer.clipAction(kit.clips.sit),
    };
    this.actions.walk.timeScale = WALK_ANIMATION_SPEED;
    this.actions.idle.play();
    this.seatedY = FLOOR_Y + SEAT_HEIGHT + HIP_ABOVE_SEAT - kit.seatedHipHeight;

    const element = document.createElement('div');
    element.className = `avatar-label${isSelf ? ' avatar-label--self' : ''}`;
    this.bubble = document.createElement('div');
    this.bubble.className = 'avatar-bubble';
    const nameTag = document.createElement('div');
    nameTag.className = 'avatar-name';
    nameTag.textContent = name;
    element.append(this.bubble, nameTag);
    this.label = new CSS2DObject(element);
    this.label.position.set(0, LABEL_HEIGHT, 0);
    this.root.add(this.label);
  }

  get isMoving(): boolean {
    return this.stepping || this.path.length > 0;
  }

  get position(): { x: number; z: number } {
    return { x: this.root.position.x, z: this.root.position.z };
  }

  /** Replaces the current route; an in-progress step finishes first. */
  walk(path: Point[]): void {
    this.path = [...path];
  }

  teleport(tile: Point): void {
    this.path = [];
    this.stepping = false;
    this.tile = { ...tile };
    const { x, z } = tileCenter(tile);
    this.root.position.set(x, FLOOR_Y, z);
  }

  face(dx: number, dz: number): void {
    this.heading = Math.atan2(dx, dz);
  }

  say(text: string): void {
    this.bubble.textContent = text;
    this.bubble.classList.add('avatar-bubble--visible');
    window.clearTimeout(this.bubbleTimer);
    const visibleMs = MathUtils.clamp(text.length * 80, BUBBLE_MIN_MS, BUBBLE_MAX_MS);
    this.bubbleTimer = window.setTimeout(
      () => this.bubble.classList.remove('avatar-bubble--visible'),
      visibleMs,
    );
  }

  /** Advances movement and animation. Returns the tile reached this frame, if a step completed. */
  update(delta: number): Point | null {
    let arrived: Point | null = null;

    if (!this.stepping) {
      const next = this.path.shift();
      if (next) {
        this.face(next.x - this.tile.x, next.y - this.tile.y);
        this.tile = next;
        this.stepping = true;
      }
    }

    if (this.stepping) {
      const target = tileCenter(this.tile);
      const step = TILES_PER_SECOND * delta;
      const dx = target.x - this.root.position.x;
      const dz = target.z - this.root.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= step) {
        this.root.position.x = target.x;
        this.root.position.z = target.z;
        this.stepping = false;
        arrived = { ...this.tile };
      } else {
        this.root.position.x += (dx / distance) * step;
        this.root.position.z += (dz / distance) * step;
      }
    }

    this.stillFor = this.isMoving ? 0 : this.stillFor + delta;
    const toTable = this.isMoving ? null : this.seats(this.tile);
    if (this.isMoving || this.stillFor < SETTLE_SECONDS) {
      if (this.isMoving) this.play('walk');
    } else if (toTable) {
      this.face(toTable.x, toTable.y);
      this.play('sit');
    } else {
      this.play('idle');
    }
    this.settle(delta, toTable);

    const turn =
      MathUtils.euclideanModulo(this.heading - this.model.rotation.y + Math.PI, Math.PI * 2) -
      Math.PI;
    this.model.rotation.y += turn * Math.min(1, TURN_SPEED * delta);
    this.mixer.update(delta);
    return arrived;
  }

  private play(pose: Pose): void {
    if (pose === this.pose) return;
    const from = this.actions[this.pose];
    const to = this.actions[pose];
    to.reset().play();
    from.crossFadeTo(to, FADE_SECONDS, false);
    this.pose = pose;
  }

  /** Eases the body onto the chair while seated, and back to the floor otherwise. */
  private settle(delta: number, toTable: Point | null): void {
    const ease = 1 - Math.exp(-SEAT_EASE * delta);
    const position = this.root.position;
    if (this.pose === 'sit' && toTable) {
      const { x, z } = tileCenter(this.tile);
      this.settleTarget.set(x + toTable.x * SIT_INSET, this.seatedY, z + toTable.y * SIT_INSET);
      position.lerp(this.settleTarget, ease);
    } else {
      position.y = MathUtils.lerp(position.y, FLOOR_Y, ease);
    }
    const labelHeight = this.pose === 'sit' ? SEATED_LABEL_HEIGHT : LABEL_HEIGHT;
    this.label.position.y = MathUtils.lerp(this.label.position.y, labelHeight, ease);
  }

  dispose(): void {
    window.clearTimeout(this.bubbleTimer);
    this.mixer.stopAllAction();
    this.label.element.remove();
    this.root.removeFromParent();
  }
}
