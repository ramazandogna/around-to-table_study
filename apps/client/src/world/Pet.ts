import type { Emote, PetKind, Point } from '@att/shared';
import {
  AnimationMixer,
  Group,
  LoopOnce,
  MathUtils,
  type AnimationAction,
  type Material,
  type Mesh,
} from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { FLOOR_Y } from './buildArea';
import { showEmote } from './emotes';
import type { PetClips, PetDress, PetKit } from './pets';

/**
 * A pet that walks along with its person. Every kind shares this behaviour;
 * a new kind only needs a model with the same clips (see pets.ts).
 *
 * - follow: trails its person by about a second, along the way they walked
 * - wander: while its person stands still, it potters about nearby, rests,
 *   and now and then does something clumsy
 * - wait: sits in one spot (the library door) until its person comes back
 *
 * Where a pet goes follows its person, so everyone sees it in the same place;
 * its little antics are picked by each screen on its own.
 */

/** How far behind its person the pet walks, in seconds of their path. */
const FOLLOW_DELAY = 1;
/** Never closer to its person than this (tiles), so it does not stand in their feet. */
const PERSONAL_SPACE = 0.55;
/** Further away than this (a door, a reconnect), it simply appears by its person. */
const LOST_DISTANCE = 4;
const RUN_SPEED = 3.6;
const STROLL_SPEED = 0.9;
const TURN_SPEED = 10;
/** Its person must stand still this long before it starts pottering about. */
const SETTLE_SECONDS = 1.2;
/** How far from its person it wanders. */
const WANDER_RADIUS = 1.6;
/** Chance that a pause ends in something clumsy rather than a stroll. */
const CLUMSY_CHANCE = 0.3;
const REST_SECONDS: readonly [number, number] = [1.5, 4.5];
const WAIT_IDLE_SECONDS: readonly [number, number] = [6, 14];
const LABEL_HEIGHT = 0.62;

type Mode = 'follow' | 'wander' | 'wait';
/** What a wandering pet is busy with. */
type Task =
  | { kind: 'rest'; left: number }
  | { kind: 'stroll'; to: FloorXZ; speed: number }
  /** Spins after its own tail. */
  | { kind: 'tail'; left: number }
  /** Trots, trips over its own paws and falls on its side, then shakes it off. */
  | { kind: 'stumble'; phase: 'trot' | 'fall' | 'up'; to: FloorXZ; left: number }
  /** Walks straight into something, bounces back and shakes its head. */
  | { kind: 'bump'; phase: 'walk' | 'recoil'; to: FloorXZ; from: FloorXZ; left: number }
  /** Crouches at a speck of dust and pounces. */
  | { kind: 'pounce'; phase: 'crouch' | 'jump'; to: FloorXZ; left: number };

type FloorXZ = { x: number; z: number };

/** Where its person is, as the pet sees them. */
export type Owner = { x: number; z: number; moving: boolean };

export type PetContext = {
  /** Whether a pet may stand on a tile: open floor, not furniture or walls. */
  walkable: (tile: Point) => boolean;
};

/** A small seeded random, so one pet's choices do not depend on others. */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Pet {
  readonly root = new Group();
  /** Tips over when it stumbles, without turning the whole pet. */
  private readonly tilt = new Group();
  private readonly mixer: AnimationMixer;
  private readonly clips: PetClips;
  private readonly loops: Record<'idle' | 'walk' | 'run', AnimationAction>;
  private gesture: AnimationAction | null = null;
  private readonly trail: { t: number; x: number; z: number }[] = [];
  private mode: Mode = 'follow';
  private task: Task = { kind: 'rest', left: 1 };
  private clock = 0;
  private speed = 0;
  private heading = 0;
  private ownerStill = 0;
  private waitTimer = 0;
  private readonly random: () => number;
  private readonly label: CSS2DObject;
  private readonly tag: HTMLSpanElement;
  private readonly emoteHost: HTMLDivElement;
  private stopEmote: (() => void) | null = null;

  constructor(
    kit: PetKit,
    readonly kind: PetKind,
    start: FloorXZ,
    seed: string,
    private readonly context: PetContext,
    /** Colour and accessory; a key of them tells when the pet must be made again. */
    readonly dress: PetDress = {},
  ) {
    this.random = seeded(seed);
    const { model, clips } = kit.create(kind, dress);
    this.clips = clips;
    this.tilt.add(model);
    this.root.add(this.tilt);
    this.root.position.set(start.x, FLOOR_Y, start.z);
    this.mixer = new AnimationMixer(model);
    this.loops = {
      idle: this.mixer.clipAction(clips.idle),
      walk: this.mixer.clipAction(clips.walk),
      run: this.mixer.clipAction(clips.run),
    };
    for (const action of Object.values(this.loops)) action.play().setEffectiveWeight(0);
    this.loops.idle.setEffectiveWeight(1);

    const element = document.createElement('div');
    element.className = 'pet-label';
    this.emoteHost = document.createElement('div');
    this.emoteHost.className = 'avatar-emote';
    this.tag = document.createElement('span');
    this.tag.className = 'pet-tag';
    this.tag.hidden = true;
    element.append(this.emoteHost, this.tag);
    this.label = new CSS2DObject(element);
    this.label.center.set(0.5, 1);
    this.label.position.set(0, LABEL_HEIGHT, 0);
    this.root.add(this.label);
  }

  get position(): FloorXZ {
    return { x: this.root.position.x, z: this.root.position.z };
  }

  /** A small name under a waiting pet, e.g. "ayse's cat". */
  setTag(text: string | null): void {
    this.tag.hidden = !text;
    this.tag.textContent = text ?? '';
  }

  /** Sits down at a spot and waits there, facing `facing`, until `follow` is called. */
  wait(at: FloorXZ, facing: FloorXZ): void {
    this.mode = 'wait';
    this.root.position.set(at.x, FLOOR_Y, at.z);
    this.heading = Math.atan2(facing.x, facing.z);
    this.root.rotation.y = this.heading;
    this.speed = 0;
    this.waitTimer = this.between(WAIT_IDLE_SECONDS);
  }

  /** Goes back to walking along with its person. */
  follow(): void {
    this.mode = 'follow';
    this.trail.length = 0;
  }

  /** Puts the pet right by its person, e.g. after coming through a door. */
  placeBy(owner: FloorXZ): void {
    const angle = this.random() * Math.PI * 2;
    const spot = { x: owner.x + Math.cos(angle) * 0.6, z: owner.z + Math.sin(angle) * 0.6 };
    const ok = this.context.walkable({ x: Math.floor(spot.x), y: Math.floor(spot.z) });
    const at = ok ? spot : owner;
    this.root.position.set(at.x, FLOOR_Y, at.z);
    this.trail.length = 0;
  }

  /** A feeling over its head, like a person's emote. */
  emote(emote: Emote): void {
    this.stopEmote?.();
    this.stopEmote = showEmote(this.emoteHost, emote, true);
  }

  update(delta: number, owner: Owner | null): void {
    this.clock += delta;
    if (this.mode === 'wait' || !owner) this.waitStep(delta);
    else this.followStep(delta, owner);
    this.animate();
    const turn =
      MathUtils.euclideanModulo(this.heading - this.root.rotation.y + Math.PI, Math.PI * 2) -
      Math.PI;
    this.root.rotation.y += turn * Math.min(1, TURN_SPEED * delta);
    this.mixer.update(delta);
  }

  private followStep(delta: number, owner: Owner): void {
    this.trail.push({ t: this.clock, x: owner.x, z: owner.z });
    while (this.trail.length > 2 && (this.trail[1]?.t ?? 0) < this.clock - FOLLOW_DELAY) {
      this.trail.shift();
    }
    this.ownerStill = owner.moving ? 0 : this.ownerStill + delta;
    const here = this.position;
    const toOwner = Math.hypot(owner.x - here.x, owner.z - here.z);
    if (toOwner > LOST_DISTANCE) {
      this.placeBy(owner);
      return;
    }

    const settled = this.ownerStill > SETTLE_SECONDS && toOwner < WANDER_RADIUS + 0.6;
    if (this.mode === 'follow' && settled) {
      this.mode = 'wander';
      this.task = { kind: 'rest', left: this.between([0.4, 1.2]) };
    } else if (this.mode === 'wander' && (owner.moving || toOwner > WANDER_RADIUS + 1)) {
      // Its person walks off: whatever it was doing, it hurries after them.
      this.mode = 'follow';
      this.tilt.rotation.z = 0;
    }

    if (this.mode === 'wander') {
      this.wanderStep(delta, owner);
      return;
    }
    const target = this.trail[0] ?? { x: owner.x, z: owner.z };
    const gap = Math.hypot(target.x - here.x, target.z - here.z);
    const wanted = toOwner < PERSONAL_SPACE ? 0 : Math.min(RUN_SPEED, gap * 3.2);
    this.speed = MathUtils.damp(this.speed, wanted, 8, delta);
    if (gap > 0.02 && this.speed > 0.05) this.moveTowards(target, this.speed * delta);
  }

  private wanderStep(delta: number, owner: Owner): void {
    const task = this.task;
    switch (task.kind) {
      case 'rest':
        this.speed = MathUtils.damp(this.speed, 0, 10, delta);
        task.left -= delta;
        if (task.left <= 0) this.task = this.nextTask(owner);
        return;
      case 'stroll':
        this.speed = MathUtils.damp(this.speed, task.speed, 6, delta);
        if (this.moveTowards(task.to, this.speed * delta)) {
          this.task = { kind: 'rest', left: this.between(REST_SECONDS) };
        }
        return;
      case 'tail':
        // Round and round, a little faster than looks wise.
        this.heading += delta * 9;
        this.speed = 1.6;
        task.left -= delta;
        if (task.left <= 0) {
          this.speed = 0;
          this.play('no');
          this.task = { kind: 'rest', left: this.between(REST_SECONDS) };
        }
        return;
      case 'stumble':
        task.left -= delta;
        if (task.phase === 'trot') {
          this.speed = 2;
          const there = this.moveTowards(task.to, this.speed * delta);
          if (there || task.left <= 0) Object.assign(task, { phase: 'fall', left: 0.9 });
        } else if (task.phase === 'fall') {
          this.speed = 0;
          // Topples onto its side and lies there for a moment.
          this.tilt.rotation.z = MathUtils.damp(this.tilt.rotation.z, 1.35, 14, delta);
          if (task.left <= 0) Object.assign(task, { phase: 'up', left: 0.5 });
        } else {
          this.tilt.rotation.z = MathUtils.damp(this.tilt.rotation.z, 0, 12, delta);
          if (task.left <= 0) {
            this.tilt.rotation.z = 0;
            this.play('no');
            this.task = { kind: 'rest', left: this.between(REST_SECONDS) };
          }
        }
        return;
      case 'bump':
        task.left -= delta;
        if (task.phase === 'walk') {
          this.speed = 1.2;
          const there = this.moveTowards(task.to, this.speed * delta);
          if (there || task.left <= 0) {
            Object.assign(task, { phase: 'recoil', left: 0.35 });
            this.play('no');
          }
        } else {
          // Bounces back a step without turning round.
          const back = { x: task.from.x - task.to.x, z: task.from.z - task.to.z };
          const length = Math.hypot(back.x, back.z) || 1;
          this.root.position.x += (back.x / length) * delta * 0.6;
          this.root.position.z += (back.z / length) * delta * 0.6;
          this.speed = 0;
          if (task.left <= 0) this.task = { kind: 'rest', left: this.between(REST_SECONDS) };
        }
        return;
      case 'pounce':
        task.left -= delta;
        if (task.phase === 'crouch') {
          this.speed = 0;
          this.heading = Math.atan2(task.to.x - this.position.x, task.to.z - this.position.z);
          if (task.left <= 0) {
            Object.assign(task, { phase: 'jump', left: 0.45 });
            this.play('yes');
          }
        } else {
          this.moveTowards(task.to, 2.4 * delta);
          this.speed = 0;
          if (task.left <= 0) this.task = { kind: 'rest', left: this.between(REST_SECONDS) };
        }
        return;
    }
  }

  /** What to do after a rest: mostly a little stroll, sometimes something clumsy. */
  private nextTask(owner: Owner): Task {
    const spot = this.spotNear(owner);
    if (this.random() >= CLUMSY_CHANCE || !spot) {
      return spot
        ? { kind: 'stroll', to: spot, speed: STROLL_SPEED * this.between([0.7, 1.2]) }
        : { kind: 'rest', left: this.between(REST_SECONDS) };
    }
    const pick = this.random();
    if (pick < 0.3) return { kind: 'tail', left: 1.4 };
    if (pick < 0.55) return { kind: 'stumble', phase: 'trot', to: spot, left: 1.2 };
    if (pick < 0.8) {
      const wall = this.wallNear();
      if (wall) return { kind: 'bump', phase: 'walk', to: wall, from: this.position, left: 2 };
    }
    return { kind: 'pounce', phase: 'crouch', to: spot, left: 0.8 };
  }

  /** A random open spot near its person that it can walk to in a straight line. */
  private spotNear(owner: Owner): FloorXZ | null {
    for (let tries = 0; tries < 8; tries++) {
      const angle = this.random() * Math.PI * 2;
      const distance = PERSONAL_SPACE + this.random() * (WANDER_RADIUS - PERSONAL_SPACE);
      const spot = {
        x: owner.x + Math.cos(angle) * distance,
        z: owner.z + Math.sin(angle) * distance,
      };
      if (this.clearLine(this.position, spot)) return spot;
    }
    return null;
  }

  /** The nearest edge of open floor in some direction: a table leg, a wall, a shelf. */
  private wallNear(): FloorXZ | null {
    const here = this.position;
    const start = this.random() * Math.PI * 2;
    for (let i = 0; i < 8; i++) {
      const angle = start + (i / 8) * Math.PI * 2;
      for (let d = 0.2; d < 1.6; d += 0.1) {
        const p = { x: here.x + Math.cos(angle) * d, z: here.z + Math.sin(angle) * d };
        if (!this.context.walkable({ x: Math.floor(p.x), y: Math.floor(p.z) })) {
          if (d < 0.35) break;
          // Stop just short, nose to the obstacle.
          const stop = d - 0.12;
          return { x: here.x + Math.cos(angle) * stop, z: here.z + Math.sin(angle) * stop };
        }
      }
    }
    return null;
  }

  private clearLine(from: FloorXZ, to: FloorXZ): boolean {
    const steps = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.15);
    for (let i = 1; i <= steps; i++) {
      const x = from.x + ((to.x - from.x) * i) / steps;
      const z = from.z + ((to.z - from.z) * i) / steps;
      if (!this.context.walkable({ x: Math.floor(x), y: Math.floor(z) })) return false;
    }
    return true;
  }

  /** Steps towards a point; true once it is there. */
  private moveTowards(target: FloorXZ, step: number): boolean {
    const position = this.root.position;
    const dx = target.x - position.x;
    const dz = target.z - position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.02) return true;
    this.heading = Math.atan2(dx, dz);
    const move = Math.min(step, distance);
    position.x += (dx / distance) * move;
    position.z += (dz / distance) * move;
    return move >= distance;
  }

  /** At the library door: sits quietly, now and then washing or dozing off. */
  private waitStep(delta: number): void {
    this.speed = 0;
    this.waitTimer -= delta;
    if (this.waitTimer > 0) return;
    this.waitTimer = this.between(WAIT_IDLE_SECONDS);
    if (this.random() < 0.5) this.play('eat');
    else this.emote('sleepy');
  }

  private play(name: 'yes' | 'no' | 'eat'): void {
    const action = this.mixer.clipAction(this.clips[name]);
    action.reset().setLoop(LoopOnce, 1).setEffectiveWeight(1).play();
    this.gesture = action;
  }

  /** Idle, walk and run blend by speed; a gesture plays over them for its length. */
  private animate(): void {
    let gesture = 0;
    if (this.gesture) {
      const { time } = this.gesture;
      const duration = this.gesture.getClip().duration;
      if (!this.gesture.isRunning() || time >= duration) {
        this.gesture.stop();
        this.gesture = null;
      } else {
        gesture = Math.min(1, time / 0.1, (duration - time) / 0.1);
        this.gesture.setEffectiveWeight(gesture);
      }
    }
    const rest = 1 - gesture;
    const walking = MathUtils.clamp(this.speed / 0.8, 0, 1);
    const running = MathUtils.clamp((this.speed - 1.6) / 1.4, 0, 1);
    this.loops.idle.setEffectiveWeight((1 - walking) * rest);
    this.loops.walk.setEffectiveWeight(walking * (1 - running) * rest);
    this.loops.run.setEffectiveWeight(walking * running * rest);
    this.loops.walk.timeScale = MathUtils.clamp(this.speed / 1.2, 0.6, 1.6);
    this.loops.idle.timeScale = this.mode === 'wait' ? 0.6 : 1;
  }

  private between([low, high]: readonly [number, number]): number {
    return low + this.random() * (high - low);
  }

  dispose(): void {
    this.stopEmote?.();
    this.mixer.stopAllAction();
    this.label.element.remove();
    // Each pet has its own geometry (for its colour); materials are the kit's,
    // except those of what it wears.
    this.tilt.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      if (mesh.userData.ownGear) (mesh.material as Material).dispose();
    });
    this.root.removeFromParent();
  }
}
