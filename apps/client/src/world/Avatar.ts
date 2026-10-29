import type { Appearance, Point } from '@att/shared';
import { AnimationMixer, Group, MathUtils, type AnimationAction } from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { FLOOR_Y } from './buildArea';
import type { CharacterKit } from './characters';

const TILES_PER_SECOND = 3.2;
/** The run cycle slowed down reads as a brisk walk. */
const WALK_ANIMATION_SPEED = 0.62;
const TURN_SPEED = 12;
const LABEL_HEIGHT = 1.12;
const BUBBLE_MIN_MS = 3000;
const BUBBLE_MAX_MS = 9000;

const tileCenter = (t: Point) => ({ x: t.x + 0.5, z: t.y + 0.5 });

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
  private readonly idle: AnimationAction;
  private readonly walking: AnimationAction;
  private readonly bubble: HTMLDivElement;
  private readonly label: CSS2DObject;
  private bubbleTimer = 0;

  constructor(kit: CharacterKit, look: Appearance, start: Point, name: string, isSelf: boolean) {
    this.tile = { ...start };
    const { x, z } = tileCenter(start);
    this.root.position.set(x, FLOOR_Y, z);

    this.model = kit.create(look);
    this.root.add(this.model);
    this.mixer = new AnimationMixer(this.model);
    this.idle = this.mixer.clipAction(kit.clips.idle).play();
    this.walking = this.mixer.clipAction(kit.clips.walk);
    this.walking.timeScale = WALK_ANIMATION_SPEED;

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
    const wasMoving = this.isMoving;

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

    const moving = this.isMoving;
    if (moving !== wasMoving || (moving && !this.walking.isRunning())) {
      const [from, to] = moving ? [this.idle, this.walking] : [this.walking, this.idle];
      to.reset().play();
      from.crossFadeTo(to, 0.2, false);
    }

    const turn =
      MathUtils.euclideanModulo(this.heading - this.model.rotation.y + Math.PI, Math.PI * 2) -
      Math.PI;
    this.model.rotation.y += turn * Math.min(1, TURN_SPEED * delta);
    this.mixer.update(delta);
    return arrived;
  }

  dispose(): void {
    window.clearTimeout(this.bubbleTimer);
    this.mixer.stopAllAction();
    this.label.element.remove();
    this.root.removeFromParent();
  }
}
