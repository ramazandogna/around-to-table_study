import {
  EMPTY_LINES,
  IDLE_STATUS,
  type Appearance,
  type Emote,
  type Point,
  type Seat,
  type StatusLines,
  type StudyStatus,
} from '@att/shared';
import {
  AnimationMixer,
  Group,
  LoopOnce,
  MathUtils,
  Vector3,
  type AnimationAction,
  type Mesh,
  type MeshStandardMaterial,
} from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { t } from '../i18n/t';
import { ACTIVITY_ICON, DOING_ICON, formatClock, MOOD_ICON } from '../state/study';
import { CHAIR_INSET, FLOOR_Y, SEAT_HEIGHT, SOFA_SEAT_HEIGHT, TABLE_HEIGHT } from './buildArea';
import type { Character, CharacterClips, CharacterKit } from './characters';
import { showEmote } from './emotes';
import { facing } from './instancing';
import type { TableProps } from './tableProps';

/** Walking pace in tiles (about meters) per second: brisk, so crossing a room takes seconds, not a chore. */
export const WALK_SPEED = 3;
/** Reaches full pace in about a fifth of a second. */
const ACCELERATION = 16;
/** Brakes a little softer than it starts, so stops do not look like hitting a wall. */
const DECELERATION = 11;
/**
 * How fast the walk clip plays at full pace. Its own tempo is three steps a
 * second, a brisk walk. The legs are short next to the body, so feet that
 * never slide would need about eight steps a second, which reads as frantic;
 * the planted foot drifts a little instead.
 */
const WALK_TEMPO_AT_FULL_PACE = 1.1;
/** How fast the body turns towards where it walks (higher is snappier). */
const TURN_SPEED = 14;
/** Sitting down and standing up blend over this long. */
const SIT_FADE_SECONDS = 0.3;
/** A stop must last this long before sitting down, so passing over a chair does not sit. */
const SETTLE_SECONDS = 0.15;
/** Half the body's width, for bumping into walls while steering with keys. */
const BODY_RADIUS = 0.24;
/** A waypoint counts as reached this close, in tiles. */
const ARRIVE_EPSILON = 0.002;
/** How quickly the body slides onto or off a chair. */
const SEAT_EASE = 9;
/** The hips rest slightly behind the chair's center, against the backrest. */
const SIT_INSET = CHAIR_INSET - 0.08;
/** On a sofa the body leans back into the cushions. */
const SOFA_INSET = -0.1;
/** The hip joints sit this far above the cushion (half a leg's thickness). */
const HIP_ABOVE_SEAT = 0.05;
/** Where the bottom of the name tag sits; lines and bubbles grow upwards from it. */
const LABEL_HEIGHT = 1.42;
const SEATED_LABEL_HEIGHT = 1.16;
/** Top of the head standing and seated, for picking someone by their whole body. */
const BODY_HEIGHT = 1.3;
const SEATED_BODY_HEIGHT = 1.08;
const BODY_PICK_RADIUS = 0.32;
/** A gesture blends in and out over this long. */
const GESTURE_FADE_SECONDS = 0.15;
/** A poked person shakes for a moment. */
const JOLT_SECONDS = 0.6;
/** How quickly someone in a crowd slides to their own spot on a shared tile. */
const SPREAD_EASE = 6;
const HIGHLIGHT = 0x3b2a12;
const BUBBLE_MIN_MS = 3000;
const BUBBLE_MAX_MS = 9000;
/** Props lie this far from the seat's center, towards the table. */
const PROP_REACH = 0.68;
/** Props appear once the person has settled into the chair. */
const PROPS_AFTER_SECONDS = 0.6;
const DETAILS_MS = 8000;
/** Lively emotes make the body hop for a moment, where effects are allowed. */
const HOPPING: ReadonlySet<Emote> = new Set(['cheer', 'laugh']);
const HOP_SECONDS = 0.9;
const HOP_HEIGHT = 0.12;
/** The body's own gesture for an emote, where effects are allowed. */
const EMOTE_GESTURE: Partial<Record<Emote, Gesture>> = {
  wave: 'wave',
  cheer: 'nod',
  laugh: 'nod',
  heart: 'nod',
};
const POKED_MS = 3200;
/** A tapped icon row stays open this long. */
const LINES_OPEN_MS = 6000;

const tileCenter = (t: Point) => ({ x: t.x + 0.5, z: t.y + 0.5 });

/** The chair or sofa on a tile, or null if there is none. */
export type SeatLookup = (tile: Point) => Seat | null;

/** What every avatar in an area shares. */
export type AvatarContext = {
  seats: SeatLookup;
  props: TableProps;
  /** Whether the body may stand on a tile, for walking with keys. */
  walkable: (tile: Point) => boolean;
};

/** A point on the floor in tiles: x across, y down the map (world z). */
export type FloorPoint = { x: number; y: number };

/** A study status with the timer on this device's clock. */
type LocalStatus = Omit<StudyStatus, 'timer'> & {
  timer: { endsAt: number; totalMs: number } | null;
};

type Pose = 'idle' | 'walk' | 'sit';

type Loop = 'idle' | 'walk' | 'sit' | 'study' | 'dance';
type Gesture = 'poke' | 'nod' | 'wave';

/**
 * A player in the world: animated model, smooth movement and a DOM label with
 * name and bubble. The body moves freely along straight routes (taps) or by
 * steering (keys), speeding up and slowing down; the tile it stands on follows.
 */
export class Avatar {
  readonly root = new Group();
  /** The tile under the middle of the body. */
  tile: Point;
  /** Waypoints still ahead, in tiles; the last one is where the body stops. */
  private route: FloorPoint[] = [];
  /** Direction held on the keys, already normalized; null when no key is down. */
  private steering: FloorPoint | null = null;
  /** The tile steering started on, so a quick tap of a key still takes one step. */
  private steerStart: Point | null = null;
  private speed = 0;
  /** Direction of the current movement, kept while braking. */
  private readonly velocityDir = { x: 0, y: 1 };
  private heading = 0;
  /** Holds the model and the label, so a crowd can be spread out without moving the body's tile. */
  private readonly body = new Group();
  private model!: Group;
  private mixer!: AnimationMixer;
  private actions!: Record<Loop, AnimationAction>;
  private clips!: CharacterClips;
  private materials: MeshStandardMaterial[] = [];
  private pose: Pose = 'idle';
  /** The chair or sofa being sat on (or about to be). */
  private seat: Seat | null = null;
  /** 0 standing, 1 seated; blends the sit pose in and out. */
  private sitBlend = 0;
  private stillFor = 0;
  private dancing = false;
  private gesture: AnimationAction | null = null;
  private joltFor = 0;
  private highlighted = false;
  private readonly spread = { x: 0, z: 0 };
  private readonly settleTarget = new Vector3();
  private readonly bubble: HTMLDivElement;
  private readonly details: HTMLDivElement;
  private readonly badges: HTMLSpanElement;
  private readonly emoteIcon: HTMLDivElement;
  private readonly pokeNote: HTMLDivElement;
  private pokeTimer = 0;
  private readonly linesBox: HTMLDivElement;
  private readonly nameTag: HTMLButtonElement;
  private stopEmote: (() => void) | null = null;
  private hopFor = 0;
  private linesOpenTimer = 0;
  private linesPinned = false;
  private crowded = false;
  private friend = false;
  private lines: StatusLines = EMPTY_LINES;
  private bubbleShift = 0;
  private readonly label: CSS2DObject;
  private bubbleTimer = 0;
  private detailsTimer = 0;
  private status: LocalStatus = { ...IDLE_STATUS, timer: null };
  private props: Group | null = null;
  /** Called when the name tag is tapped; by default it shows what this person is up to. */
  onTap: (() => void) | null = null;

  constructor(
    private readonly kit: CharacterKit,
    look: Appearance,
    start: Point,
    readonly name: string,
    private readonly isSelf: boolean,
    private readonly context: AvatarContext,
  ) {
    this.tile = { ...start };
    const { x, z } = tileCenter(start);
    this.root.position.set(x, FLOOR_Y, z);

    this.root.add(this.body);
    this.wear(kit.create(look));

    const element = document.createElement('div');
    element.className = `avatar-label${isSelf ? ' avatar-label--self' : ''}`;
    this.bubble = document.createElement('div');
    this.bubble.className = 'avatar-bubble';
    this.details = document.createElement('div');
    this.details.className = 'avatar-details';
    // The name tag is a button: tapping it shows what this person is up to.
    this.emoteIcon = document.createElement('div');
    this.emoteIcon.className = 'avatar-emote';
    this.pokeNote = document.createElement('div');
    this.pokeNote.className = 'avatar-poke';
    this.linesBox = document.createElement('div');
    this.linesBox.className = 'avatar-lines';
    // In a crowd the lines fold into icons; tapping them opens the full lines for a while.
    this.linesBox.addEventListener('click', () => this.pinLines());
    const nameTag = document.createElement('button');
    this.nameTag = nameTag;
    nameTag.type = 'button';
    nameTag.className = 'avatar-name';
    nameTag.textContent = name;
    this.badges = document.createElement('span');
    this.badges.className = 'avatar-badges';
    nameTag.append(this.badges);
    nameTag.addEventListener('click', () => (this.onTap ? this.onTap() : this.toggleDetails()));
    element.append(
      this.emoteIcon,
      this.pokeNote,
      this.bubble,
      this.details,
      this.linesBox,
      nameTag,
    );
    this.label = new CSS2DObject(element);
    // Anchored at the bottom, so a bubble or lines appearing never push the name around.
    this.label.center.set(0.5, 1);
    this.label.position.set(0, LABEL_HEIGHT, 0);
    this.body.add(this.label);
  }

  /** Puts on a character model: its own mixer, with every looping clip playing at weight 0. */
  private wear({ model, clips }: Character): void {
    const turned = this.model?.rotation.y ?? this.heading;
    if (this.model) {
      this.mixer.stopAllAction();
      this.model.removeFromParent();
      for (const material of this.materials) material.dispose();
    }
    this.model = model;
    this.model.rotation.y = turned;
    this.clips = clips;
    // Each avatar gets its own materials, so it can light up on its own when hovered.
    this.materials = [];
    model.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      const material = (mesh.material as MeshStandardMaterial).clone();
      mesh.material = material;
      this.materials.push(material);
    });
    this.setHighlight(this.highlighted, true);
    this.body.add(model);
    this.mixer = new AnimationMixer(model);
    this.actions = {
      idle: this.mixer.clipAction(clips.idle),
      walk: this.mixer.clipAction(clips.walk),
      sit: this.mixer.clipAction(clips.sit),
      study: this.mixer.clipAction(clips.study),
      dance: this.mixer.clipAction(clips.dance),
    };
    // All of them always play; their weights follow what the body does (see `animate`).
    for (const action of Object.values(this.actions)) action.play().setEffectiveWeight(0);
    this.actions.idle.setEffectiveWeight(1);
    this.gesture = null;
  }

  get isMoving(): boolean {
    return this.speed > 0 || this.route.length > 0 || this.steering !== null;
  }

  get position(): { x: number; z: number } {
    return { x: this.root.position.x, z: this.root.position.z };
  }

  setLook(look: Appearance): void {
    this.wear(this.kit.create(look));
  }

  get isSeated(): boolean {
    return this.pose === 'sit';
  }

  /** Whether the person sits at a table (studying) or on a sofa; null when standing. */
  get seatKind(): Seat['kind'] | null {
    return this.isSeated ? (this.seat?.kind ?? null) : null;
  }

  get isDancing(): boolean {
    return this.dancing;
  }

  /** Dances in place while standing; walking or sitting down ends it. */
  setDancing(on: boolean): void {
    this.dancing = on;
  }

  /** Plays a one-off gesture over whatever the body is doing. */
  play(gesture: Gesture): void {
    const action = this.mixer.clipAction(this.clips[gesture]);
    action.reset().setLoop(LoopOnce, 1).setEffectiveWeight(1).play();
    action.clampWhenFinished = false;
    this.gesture = action;
  }

  /** Lights the body up softly, e.g. while the mouse is over someone who can be tapped. */
  setHighlight(on: boolean, force = false): void {
    if (on === this.highlighted && !force) return;
    this.highlighted = on;
    for (const material of this.materials) material.emissive.setHex(on ? HIGHLIGHT : 0);
  }

  /** Someone poked this person: a little shake and a note over the head (for them alone). */
  poked(by: string, mine: boolean): void {
    this.joltFor = JOLT_SECONDS;
    if (!mine) return;
    window.clearTimeout(this.pokeTimer);
    const icon = document.createElement('img');
    icon.src = 'emotes/poke.png';
    icon.alt = '';
    const text = document.createElement('span');
    text.textContent = t('poke.over', { name: by });
    this.pokeNote.replaceChildren(icon, text);
    this.pokeNote.classList.add('avatar-poke--visible');
    this.pokeTimer = window.setTimeout(
      () => this.pokeNote.classList.remove('avatar-poke--visible'),
      POKED_MS,
    );
  }

  /** Spreads people out a little when several share one tile; (0, 0) is the tile's middle. */
  setSpread(x: number, z: number): void {
    this.spread.x = x;
    this.spread.z = z;
  }

  /** A box around the whole body in the world, for picking someone by any part of them. */
  get bodyBox(): { x: number; z: number; radius: number; bottom: number; top: number } {
    const height = this.isSeated ? SEATED_BODY_HEIGHT : BODY_HEIGHT;
    const { x, y, z } = this.root.position;
    return {
      x: x + this.body.position.x,
      z: z + this.body.position.z,
      radius: BODY_PICK_RADIUS,
      bottom: Math.max(FLOOR_Y, y - 0.1),
      top: y + height,
    };
  }

  /** Shows the person's activity on the table and their timer and "do not disturb" on the name tag. */
  setStatus({ activity, timer, dnd }: StudyStatus): void {
    if (activity !== this.status.activity) {
      this.props?.removeFromParent();
      this.props = activity ? this.context.props(activity) : null;
      if (this.props) {
        this.props.visible = false;
        this.root.add(this.props);
      }
    }
    this.status = {
      activity,
      dnd,
      timer: timer ? { endsAt: Date.now() + timer.remainingMs, totalMs: timer.totalMs } : null,
    };
    this.badges.textContent = `${timer ? ' ⏱' : ''}${dnd ? ' 🔕' : ''}`;
    if (this.details.classList.contains('avatar-details--visible')) this.renderDetails();
  }

  /** The announcement, activity and mood lines between the bubble and the name. */
  setLines(lines: StatusLines): void {
    this.lines = lines;
    const rows: [string, string][] = [];
    if (lines.announcement) rows.push(['📣', lines.announcement]);
    if (lines.doing)
      rows.push([
        DOING_ICON[lines.doing],
        [t(`doing.${lines.doing}`), lines.doingNote].filter(Boolean).join(' · '),
      ]);
    if (lines.mood)
      rows.push([
        MOOD_ICON[lines.mood],
        [t(`mood.${lines.mood}`), lines.moodNote].filter(Boolean).join(' · '),
      ]);
    this.linesBox.replaceChildren(
      ...rows.map(([icon, text]) => {
        const row = document.createElement('span');
        row.className = 'avatar-line';
        const i = document.createElement('i');
        i.textContent = icon;
        const span = document.createElement('span');
        span.className = 'avatar-line-text';
        span.textContent = text;
        row.append(i, span);
        return row;
      }),
    );
    this.updateLinesFold();
  }

  get statusLines(): StatusLines {
    return this.lines;
  }

  /** Folds the lines into one icon row when people crowd together; your own always stay open. */
  setCrowded(crowded: boolean): void {
    if (crowded === this.crowded) return;
    this.crowded = crowded;
    this.updateLinesFold();
  }

  /** Friends get a ⭐ on their name tag and keep their lines open in a crowd, like your own. */
  setFriend(friend: boolean): void {
    if (friend === this.friend) return;
    this.friend = friend;
    this.label.element.classList.toggle('avatar-label--friend', friend);
    this.updateLinesFold();
  }

  private pinLines(): void {
    window.clearTimeout(this.linesOpenTimer);
    this.linesPinned = true;
    this.updateLinesFold();
    this.linesOpenTimer = window.setTimeout(() => {
      this.linesPinned = false;
      this.updateLinesFold();
    }, LINES_OPEN_MS);
  }

  private updateLinesFold(): void {
    const folded = this.crowded && !this.isSelf && !this.friend && !this.linesPinned;
    this.linesBox.classList.toggle('avatar-lines--folded', folded);
  }

  /**
   * A feeling over the head: a pixel bubble that pops up, with its own little
   * effect (hearts rising, stars bursting, z's floating) and a gesture. Where
   * effects are off (the library) it is small and still.
   */
  emote(emote: Emote, subtle: boolean): void {
    this.stopEmote?.();
    this.stopEmote = showEmote(this.emoteIcon, emote, subtle);
    if (subtle) return;
    const gesture = EMOTE_GESTURE[emote];
    if (gesture && !this.isMoving) this.play(gesture);
    if (HOPPING.has(emote) && !this.isSeated) this.hopFor = HOP_SECONDS;
  }

  /** The name tag on screen, to tell when people crowd together. */
  nameRect(): DOMRect {
    return this.nameTag.getBoundingClientRect();
  }

  /** The speech bubble's screen box as if it were not moved aside, or null when hidden. */
  bubbleRect(): DOMRect | null {
    if (!this.bubble.classList.contains('avatar-bubble--visible')) return null;
    const rect = this.bubble.getBoundingClientRect();
    return new DOMRect(rect.x, rect.y + this.bubbleShift, rect.width, rect.height);
  }

  get bubbleFolded(): boolean {
    return this.bubble.classList.contains('avatar-bubble--folded');
  }

  /** Moves the bubble up out of a neighbor's way, or folds it to 💬 when there is no room left. */
  placeBubble(shift: number, folded: boolean): void {
    if (shift !== this.bubbleShift) {
      this.bubbleShift = shift;
      this.bubble.style.translate = shift ? `0 ${-shift}px` : '';
    }
    this.bubble.classList.toggle('avatar-bubble--folded', folded);
  }

  clearActivity(): void {
    this.props?.removeFromParent();
    this.props = null;
    this.status = { ...this.status, activity: null };
  }

  /** Opens the small card above the name with activity, timer and "do not disturb". */
  toggleDetails(): void {
    window.clearTimeout(this.detailsTimer);
    if (this.details.classList.toggle('avatar-details--visible')) {
      this.renderDetails();
      this.detailsTimer = window.setTimeout(
        () => this.details.classList.remove('avatar-details--visible'),
        DETAILS_MS,
      );
    }
  }

  /** Where the body is now, in tiles. */
  get floorPosition(): FloorPoint {
    return { x: this.root.position.x, y: this.root.position.z };
  }

  /** Walks through these points (in tiles) from wherever the body is, without stopping in between. */
  follow(route: readonly FloorPoint[]): void {
    this.route = route.map((p) => ({ ...p }));
  }

  /** Stops following a route; the body brakes to a halt where it is. */
  halt(): void {
    this.route = [];
    this.steering = null;
  }

  /**
   * Steers with the keys: a direction in tiles (normalized), or null when the
   * keys are let go. Letting go brakes onto the middle of the tile ahead, so
   * the body always rests on a tile (and sits when that tile is a chair).
   * Returns that tile when letting go.
   */
  steer(direction: FloorPoint | null): Point | null {
    if (direction) {
      this.route = [];
      if (!this.steering) this.steerStart = { ...this.tile };
      this.steering = direction;
      return null;
    }
    if (!this.steering) return null;
    const held = this.steering;
    this.steering = null;
    const brake = (this.speed * this.speed) / (2 * DECELERATION);
    const ahead = {
      x: Math.floor(this.root.position.x + this.velocityDir.x * brake),
      y: Math.floor(this.root.position.z + this.velocityDir.y * brake),
    };
    let rest = this.context.walkable(ahead) ? ahead : this.tile;
    const start = this.steerStart;
    if (start && rest.x === start.x && rest.y === start.y) rest = this.stepFrom(start, held);
    this.route = [{ x: rest.x + 0.5, y: rest.y + 0.5 }];
    return rest;
  }

  /** The neighboring tile in a direction, if the body can step there; otherwise `from` itself. */
  private stepFrom(from: Point, direction: FloorPoint): Point {
    const dx = Math.round(direction.x * 1.4);
    const dy = Math.round(direction.y * 1.4);
    const walkable = this.context.walkable;
    const next = { x: from.x + dx, y: from.y + dy };
    const corners =
      dx === 0 ||
      dy === 0 ||
      (walkable({ x: from.x + dx, y: from.y }) && walkable({ x: from.x, y: from.y + dy }));
    return walkable(next) && corners ? next : from;
  }

  teleport(tile: Point): void {
    this.halt();
    this.speed = 0;
    this.tile = { ...tile };
    const { x, z } = tileCenter(tile);
    this.root.position.set(x, FLOOR_Y, z);
  }

  face(dx: number, dz: number): void {
    this.heading = Math.atan2(dx, dz);
  }

  say(text: string): void {
    this.bubble.textContent = text;
    this.bubble.title = text;
    // A new message gets a fresh chance at a spot of its own.
    this.placeBubble(0, false);
    this.bubble.classList.add('avatar-bubble--visible');
    window.clearTimeout(this.bubbleTimer);
    const visibleMs = MathUtils.clamp(text.length * 80, BUBBLE_MIN_MS, BUBBLE_MAX_MS);
    this.bubbleTimer = window.setTimeout(
      () => this.bubble.classList.remove('avatar-bubble--visible'),
      visibleMs,
    );
  }

  /** Advances movement and animation. Returns the tile the body stepped onto this frame, if any. */
  update(delta: number): Point | null {
    if (this.steering) this.steerStep(delta);
    else this.routeStep(delta);

    const position = this.root.position;
    const now = { x: Math.floor(position.x), y: Math.floor(position.z) };
    let entered: Point | null = null;
    if (now.x !== this.tile.x || now.y !== this.tile.y) {
      this.tile = now;
      entered = { ...now };
    }

    this.stillFor = this.isMoving ? 0 : this.stillFor + delta;
    if (this.isMoving) {
      this.pose = 'walk';
      this.dancing = false;
    } else if (this.stillFor >= SETTLE_SECONDS) {
      this.seat = this.context.seats(this.tile);
      if (this.seat) {
        this.face(this.seat.facing.x, this.seat.facing.y);
        this.dancing = false;
      }
      this.pose = this.seat ? 'sit' : 'idle';
    }
    const seat = this.pose === 'sit' ? this.seat : null;
    this.animate(delta);
    this.settle(delta, seat);
    this.placeProps(seat?.kind === 'chair' ? seat.facing : null);
    if (this.status.timer && this.details.classList.contains('avatar-details--visible')) {
      this.renderDetails();
    }

    const turn =
      MathUtils.euclideanModulo(this.heading - this.model.rotation.y + Math.PI, Math.PI * 2) -
      Math.PI;
    this.model.rotation.y += turn * Math.min(1, TURN_SPEED * delta);
    this.hopFor = Math.max(0, this.hopFor - delta);
    this.model.position.y =
      this.hopFor > 0
        ? HOP_HEIGHT * Math.abs(Math.sin((this.hopFor / HOP_SECONDS) * Math.PI * 3))
        : 0;
    // A poke makes the body wobble side to side, fading out.
    this.joltFor = Math.max(0, this.joltFor - delta);
    this.model.rotation.z =
      this.joltFor > 0 ? Math.sin(this.joltFor * 38) * 0.16 * (this.joltFor / JOLT_SECONDS) : 0;
    // People sharing a tile slide apart; seated or walking bodies keep to the middle.
    const spreading = this.isMoving || this.isSeated ? 0 : 1;
    const ease = 1 - Math.exp(-SPREAD_EASE * delta);
    this.body.position.x += (this.spread.x * spreading - this.body.position.x) * ease;
    this.body.position.z += (this.spread.z * spreading - this.body.position.z) * ease;
    this.mixer.update(delta);
    return entered;
  }

  /** Follows the route: speeds up, keeps pace through corners and brakes to stop on the last point. */
  private routeStep(delta: number): void {
    const position = this.root.position;
    const target = this.route[0];
    if (!target) {
      this.speed = 0;
      return;
    }
    // Distance left to the final stop, so braking starts just in time.
    let remaining = Math.hypot(target.x - position.x, target.y - position.z);
    for (let i = 1; i < this.route.length; i++) {
      const a = this.route[i - 1] as FloorPoint;
      const b = this.route[i] as FloorPoint;
      remaining += Math.hypot(b.x - a.x, b.y - a.y);
    }
    const stoppable = Math.sqrt(2 * DECELERATION * remaining);
    const wanted = Math.min(WALK_SPEED, stoppable);
    this.speed =
      wanted > this.speed
        ? Math.min(wanted, this.speed + ACCELERATION * delta)
        : Math.max(wanted, this.speed - DECELERATION * delta * 1.5);
    // Never crawl to a stop: the last few centimeters are walked at a gentle pace.
    let step = Math.max(this.speed, 0.4) * delta;

    while (step > 0 && this.route.length > 0) {
      const next = this.route[0] as FloorPoint;
      const dx = next.x - position.x;
      const dz = next.y - position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > ARRIVE_EPSILON) {
        this.velocityDir.x = dx / distance;
        this.velocityDir.y = dz / distance;
        this.heading = Math.atan2(dx, dz);
      }
      if (distance <= step) {
        position.x = next.x;
        position.z = next.y;
        step -= distance;
        this.route.shift();
      } else {
        position.x += (dx / distance) * step;
        position.z += (dz / distance) * step;
        step = 0;
      }
    }
    if (this.route.length === 0) this.speed = 0;
  }

  /** Walks where the keys point, sliding along walls instead of stopping dead. */
  private steerStep(delta: number): void {
    const direction = this.steering as FloorPoint;
    this.speed = Math.min(WALK_SPEED, this.speed + ACCELERATION * delta);
    this.velocityDir.x = direction.x;
    this.velocityDir.y = direction.y;
    this.heading = Math.atan2(direction.x, direction.y);
    const step = this.speed * delta;
    const position = this.root.position;
    const nextX = position.x + direction.x * step;
    if (this.fits(nextX, position.z)) position.x = nextX;
    const nextZ = position.z + direction.y * step;
    if (this.fits(position.x, nextZ)) position.z = nextZ;
  }

  /** True when a body standing at (x, z) touches nothing blocked. */
  private fits(x: number, z: number): boolean {
    for (const ox of [-BODY_RADIUS, BODY_RADIUS]) {
      for (const oz of [-BODY_RADIUS, BODY_RADIUS]) {
        if (!this.context.walkable({ x: Math.floor(x + ox), y: Math.floor(z + oz) })) return false;
      }
    }
    return true;
  }

  /**
   * Blends the clips by what the body does: idle and walk by speed (the steps
   * slow down with the body), and the sit pose in and out over a moment.
   */
  private animate(delta: number): void {
    const sitTarget = this.pose === 'sit' ? 1 : 0;
    const fade = delta / SIT_FADE_SECONDS;
    this.sitBlend =
      sitTarget > this.sitBlend
        ? Math.min(1, this.sitBlend + fade)
        : Math.max(0, this.sitBlend - fade * 1.5);
    const pace = MathUtils.clamp(this.speed / WALK_SPEED, 0, 1);
    // Ease in so a slow start already swings the legs a little.
    const walking = Math.sqrt(pace);
    // A gesture takes over the body while it plays, then hands it back.
    let gesture = 0;
    if (this.gesture) {
      const { time } = this.gesture;
      const duration = this.gesture.getClip().duration;
      if (!this.gesture.isRunning() || time >= duration) {
        this.gesture.stop();
        this.gesture = null;
      } else {
        gesture = Math.min(
          1,
          time / GESTURE_FADE_SECONDS,
          (duration - time) / GESTURE_FADE_SECONDS,
        );
        this.gesture.setEffectiveWeight(gesture);
      }
    }
    const rest = 1 - gesture;
    const standing = (1 - this.sitBlend) * rest;
    const studying = this.seat?.kind === 'chair';
    const dancing = this.dancing && !this.isMoving ? 1 : 0;
    this.actions.study.setEffectiveWeight(studying ? this.sitBlend * rest : 0);
    this.actions.sit.setEffectiveWeight(studying ? 0 : this.sitBlend * rest);
    this.actions.walk.setEffectiveWeight(standing * walking);
    this.actions.dance.setEffectiveWeight(standing * (1 - walking) * dancing);
    this.actions.idle.setEffectiveWeight(standing * (1 - walking) * (1 - dancing));
    this.actions.walk.timeScale = WALK_TEMPO_AT_FULL_PACE * Math.max(pace, 0.55);
  }

  /** Eases the body onto the chair or sofa while seated, and back to the floor otherwise. */
  private settle(delta: number, seat: Seat | null): void {
    const ease = 1 - Math.exp(-SEAT_EASE * delta);
    const position = this.root.position;
    if (seat) {
      const { x, z } = tileCenter(this.tile);
      const chair = seat.kind === 'chair';
      const inset = chair ? SIT_INSET : SOFA_INSET;
      const cushion = chair ? SEAT_HEIGHT : SOFA_SEAT_HEIGHT;
      const y = FLOOR_Y + cushion + HIP_ABOVE_SEAT - this.kit.seatedHipHeight;
      this.settleTarget.set(x + seat.facing.x * inset, y, z + seat.facing.y * inset);
      position.lerp(this.settleTarget, ease);
    } else {
      position.y = MathUtils.lerp(position.y, FLOOR_Y, ease);
    }
    const labelHeight = this.pose === 'sit' ? SEATED_LABEL_HEIGHT : LABEL_HEIGHT;
    this.label.position.y = MathUtils.lerp(this.label.position.y, labelHeight, ease);
  }

  /** Keeps the props still on the table while the body eases into the chair. */
  private placeProps(toTable: Point | null): void {
    if (!this.props) return;
    const show = this.pose === 'sit' && toTable !== null && this.stillFor > PROPS_AFTER_SECONDS;
    this.props.visible = show;
    if (!show) return;
    const { x, z } = tileCenter(this.tile);
    const root = this.root.position;
    this.props.position.set(
      x + toTable.x * PROP_REACH - root.x,
      FLOOR_Y + TABLE_HEIGHT - root.y,
      z + toTable.y * PROP_REACH - root.z,
    );
    this.props.rotation.y = facing(toTable.x, toTable.y);
  }

  private renderDetails(): void {
    const { activity, timer, dnd } = this.status;
    const lines: string[] = [];
    if (activity && this.isSeated)
      lines.push(`${ACTIVITY_ICON[activity]} ${t(`activity.${activity}`)}`);
    if (timer) {
      const left = timer.endsAt - Date.now();
      lines.push(
        left > 0 ? `⏱ ${formatClock(left)} ${t('details.left')}` : `⏱ ${t('details.done')}`,
      );
    }
    if (dnd) lines.push(`🔕 ${t('details.dnd')}`);
    if (lines.length === 0) lines.push(t(this.isSeated ? 'details.sitting' : 'details.around'));
    const text = lines.join('\n');
    if (this.details.textContent !== text) this.details.textContent = text;
  }

  dispose(): void {
    window.clearTimeout(this.bubbleTimer);
    window.clearTimeout(this.detailsTimer);
    this.stopEmote?.();
    window.clearTimeout(this.pokeTimer);
    window.clearTimeout(this.linesOpenTimer);
    this.mixer.stopAllAction();
    for (const material of this.materials) material.dispose();
    this.label.element.remove();
    this.root.removeFromParent();
  }
}
