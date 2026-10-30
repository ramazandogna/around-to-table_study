import {
  EMPTY_LINES,
  IDLE_STATUS,
  type Appearance,
  type Emote,
  type Point,
  type StatusLines,
  type StudyStatus,
} from '@att/shared';
import { AnimationMixer, Group, MathUtils, Vector3, type AnimationAction } from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { t } from '../i18n/t';
import { ACTIVITY_ICON, DOING_ICON, EMOTE_ICON, formatClock, MOOD_ICON } from '../state/study';
import { CHAIR_INSET, FLOOR_Y, SEAT_HEIGHT, TABLE_HEIGHT } from './buildArea';
import type { CharacterKit } from './characters';
import { facing } from './instancing';
import type { TableProps } from './tableProps';

const TILES_PER_SECOND = 1.9;
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
/** Where the bottom of the name tag sits; lines and bubbles grow upwards from it. */
const LABEL_HEIGHT = 1.85;
const SEATED_LABEL_HEIGHT = 1.45;
const BUBBLE_MIN_MS = 3000;
const BUBBLE_MAX_MS = 9000;
/** Props lie this far from the seat's center, towards the table. */
const PROP_REACH = 0.68;
/** Props appear once the person has settled into the chair. */
const PROPS_AFTER_SECONDS = 0.6;
const DETAILS_MS = 8000;
const EMOTE_MS = 2400;
/** Lively emotes make the body hop for a moment, where effects are allowed. */
const HOPPING: ReadonlySet<Emote> = new Set(['wave', 'cheer', 'laugh']);
const HOP_SECONDS = 0.9;
const HOP_HEIGHT = 0.12;
/** A tapped icon row stays open this long. */
const LINES_OPEN_MS = 6000;

const tileCenter = (t: Point) => ({ x: t.x + 0.5, z: t.y + 0.5 });

/** Direction from a seat tile towards its table, or null if the tile is not a seat. */
export type SeatLookup = (tile: Point) => Point | null;

/** What every avatar in an area shares. */
export type AvatarContext = { seats: SeatLookup; props: TableProps };

/** A study status with the timer on this device's clock. */
type LocalStatus = Omit<StudyStatus, 'timer'> & {
  timer: { endsAt: number; totalMs: number } | null;
};

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
  private readonly details: HTMLDivElement;
  private readonly badges: HTMLSpanElement;
  private readonly emoteIcon: HTMLDivElement;
  private readonly linesBox: HTMLDivElement;
  private readonly nameTag: HTMLButtonElement;
  private emoteTimer = 0;
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

    this.model = kit.create(look);
    this.root.add(this.model);
    this.mixer = new AnimationMixer(this.model);
    this.actions = {
      idle: this.mixer.clipAction(kit.clips.idle),
      walk: this.mixer.clipAction(kit.clips.walk),
      sit: this.mixer.clipAction(kit.clips.sit),
    };
    // Plays the walk exactly as fast as the body moves, so planted feet do not slide.
    this.actions.walk.timeScale = TILES_PER_SECOND / kit.walkSpeed;
    this.actions.idle.play();
    this.seatedY = FLOOR_Y + SEAT_HEIGHT + HIP_ABOVE_SEAT - kit.seatedHipHeight;

    const element = document.createElement('div');
    element.className = `avatar-label${isSelf ? ' avatar-label--self' : ''}`;
    this.bubble = document.createElement('div');
    this.bubble.className = 'avatar-bubble';
    this.details = document.createElement('div');
    this.details.className = 'avatar-details';
    // The name tag is a button: tapping it shows what this person is up to.
    this.emoteIcon = document.createElement('div');
    this.emoteIcon.className = 'avatar-emote';
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
    element.append(this.emoteIcon, this.bubble, this.details, this.linesBox, nameTag);
    this.label = new CSS2DObject(element);
    // Anchored at the bottom, so a bubble or lines appearing never push the name around.
    this.label.center.set(0.5, 1);
    this.label.position.set(0, LABEL_HEIGHT, 0);
    this.root.add(this.label);
  }

  get isMoving(): boolean {
    return this.stepping || this.path.length > 0;
  }

  get position(): { x: number; z: number } {
    return { x: this.root.position.x, z: this.root.position.z };
  }

  setLook(look: Appearance): void {
    this.kit.dress(this.model, look);
  }

  get isSeated(): boolean {
    return this.pose === 'sit';
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

  /** A feeling over the head. Where effects are off (the library) it is small and still. */
  emote(emote: Emote, subtle: boolean): void {
    this.emoteIcon.textContent = EMOTE_ICON[emote];
    this.emoteIcon.className = `avatar-emote avatar-emote--${subtle ? 'subtle' : 'big'}`;
    window.clearTimeout(this.emoteTimer);
    this.emoteTimer = window.setTimeout(() => {
      this.emoteIcon.className = 'avatar-emote';
      this.emoteIcon.textContent = '';
    }, EMOTE_MS);
    if (!subtle && HOPPING.has(emote) && !this.isSeated) this.hopFor = HOP_SECONDS;
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
    const toTable = this.isMoving ? null : this.context.seats(this.tile);
    if (this.isMoving || this.stillFor < SETTLE_SECONDS) {
      if (this.isMoving) this.play('walk');
    } else if (toTable) {
      this.face(toTable.x, toTable.y);
      this.play('sit');
    } else {
      this.play('idle');
    }
    this.settle(delta, toTable);
    this.placeProps(toTable);
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
    window.clearTimeout(this.emoteTimer);
    window.clearTimeout(this.linesOpenTimer);
    this.mixer.stopAllAction();
    this.label.element.remove();
    this.root.removeFromParent();
  }
}
