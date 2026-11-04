import {
  chance,
  findPath,
  onDuty,
  smoothPath,
  TILE,
  type Appearance,
  type AreaGrid,
  type Emote,
  type Point,
  type StaffId,
} from '@att/shared';
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Material,
} from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { t, type MessageKey } from '../i18n/t';
import { Avatar, type AvatarContext } from './Avatar';
import { FLOOR_Y } from './buildArea';
import type { CharacterKit } from './characters';

/**
 * The people behind the desks: the librarians and the receptionists. Who sits
 * there follows the shifts (see shared `SHIFTS`): a woman in the library from
 * 9 to 15, a man from 15 to 22, and a sleepy night librarian who keeps dozing
 * off at the desk until morning; the reception has a day and a night receptionist.
 *
 * What they do is worked out from the clock in slots of a few seconds, each
 * picked by a seeded random, so it never repeats like a loop and yet every
 * visitor sees the same person at the same shelf at the same moment. Mostly
 * they stay at the desk (typing, a coffee, a stretch, a yawn in the late
 * hours); now and then they run an errand, and the librarian mops a stretch
 * of floor and leaves a wet floor sign for a while. The receptionist also walks
 * someone to the elevator when they open a private room (on that person's
 * screen). Staff are not players: they take no seat and count in no numbers.
 */

type Kind = 'librarian' | 'receptionist';

type Person = {
  kind: Kind;
  look: Appearance;
  name: MessageKey;
  lines: readonly MessageKey[];
  /** Chance per minute of an errand away from the desk. */
  errands: number;
  /** Chance per slot of a yawn. */
  sleepy: number;
  /** Dozes off at the desk most of the time and walks sleepily (the night shift). */
  drowsy?: boolean;
};

const PEOPLE: Record<StaffId, Person> = {
  librarianDay: {
    kind: 'librarian',
    look: { character: 3, top: 3, bottom: 7, hair: 1 },
    name: 'staff.librarianDay',
    lines: ['staff.librarianDay.1', 'staff.librarianDay.2', 'staff.librarianDay.3'],
    errands: 0.5,
    sleepy: 0.04,
  },
  librarianEvening: {
    kind: 'librarian',
    look: { character: 8, top: 5, bottom: 2, hair: 4 },
    name: 'staff.librarianEvening',
    lines: ['staff.librarianEvening.1', 'staff.librarianEvening.2', 'staff.librarianEvening.3'],
    errands: 0.45,
    sleepy: 0.1,
  },
  librarianNight: {
    kind: 'librarian',
    look: { character: 6, top: 2, bottom: 5, hair: 6 },
    name: 'staff.librarianNight',
    lines: [
      'staff.librarianNight.1',
      'staff.librarianNight.2',
      'staff.librarianNight.3',
      'staff.librarianNight.4',
    ],
    errands: 0.25,
    sleepy: 0.3,
    drowsy: true,
  },
  receptionDay: {
    kind: 'receptionist',
    look: { character: 1, top: 9, bottom: 4, hair: 3 },
    name: 'staff.receptionDay',
    lines: ['staff.receptionDay.1', 'staff.receptionDay.2', 'staff.receptionDay.3'],
    errands: 0.22,
    sleepy: 0.02,
  },
  receptionNight: {
    kind: 'receptionist',
    look: { character: 10, top: 1, bottom: 6, hair: 2 },
    name: 'staff.receptionNight',
    lines: ['staff.receptionNight.1', 'staff.receptionNight.2', 'staff.receptionNight.3'],
    errands: 0.15,
    sleepy: 0.16,
  },
};

/** One slot of a staff member's day, in seconds. */
const SLOT = 12;
/** Slots in a block; a block has at most one errand. */
const BLOCK = 5;
/** An errand takes this many slots, there and back. */
const ERRAND_SLOTS = 2;
/** How long the receptionist waits at the elevator for someone. */
const ESCORT_SECONDS = 9;
/** At a shelf, a reach for a book every so often. */
const REACH_SECONDS = 4.5;

/** Small things done at the desk: an emote over the head, or a gesture. */
const DESK_MOMENTS: readonly (Emote | 'stretch' | 'type' | 'look')[] = [
  'type',
  'type',
  'type',
  'look',
  'thinking',
  'coffee',
  'stretch',
  'type',
];

/** A place to go; a window spot also says which window, to open or shut it there. */
type Spot = { stand: Point; facing: Point; window?: number };

/** A job to do somewhere, e.g. pushing a chair back under its table. */
export type Chore = { stand: Point; facing: Point; done: () => void };

/** What a room tells its staff about: its windows, and how to open or shut one. */
export type StaffRoom = {
  windows: readonly { stand: Point; facing: Point }[];
  toggleWindow: (index: number) => void;
  /** Windows are only opened by day. */
  daytime: () => boolean;
};

/** Where a staff member is wanted right now. */
type Wanted =
  | { at: 'desk' }
  | { at: 'errand'; spot: number }
  | { at: 'escort' }
  | { at: 'chore' }
  | { at: 'mop'; stretch: number; leg: number };

/** A chore takes this long once there: a push, a little tidy. */
const CHORE_SECONDS = 1.1;
/** The night librarian gets round to a chore only after this long, yawning. */
const NIGHT_CHORE_DELAY = 45;

/**
 * Mopping: the clock is cut into windows of this many slots; in some of them
 * the librarian mops one stretch of floor, back and forth, for `MOP_LEGS`
 * slots, and the wet floor sign stays up for the rest of the window.
 */
const MOP_WINDOW = 25;
const MOP_LEGS = 4;
const MOP_CHANCE = 0.25;
/** Of the night librarian's slots at the desk, this share is spent asleep. */
const DOZE_SHARE = 0.65;

export class Staff {
  readonly avatar: Avatar;
  private readonly person: Person;
  private readonly chair: Point;
  /** The open floor beside the chair, where they step out. */
  private readonly aisle: Point;
  private readonly errands: Spot[];
  private readonly elevator: Spot | null;
  private at: string | null = null;
  private lastSlot = -1;
  private reachIn = REACH_SECONDS;
  private lineIndex = 0;
  private escortLeft = 0;
  private readonly chores: Chore[] = [];
  private choreLeft = CHORE_SECONDS;
  /** The window opened or shut on this visit, so it happens once per trip. */
  private windowDone = false;
  private readonly windowCount: number;
  /** Straight stretches of open floor to mop: from one end to the other. */
  private readonly stretches: { a: Point; b: Point }[];
  /** The mop, its bucket and the wet floor sign, put in the room by `AreaWorld`. */
  readonly props = new Group();
  private readonly mop: Group;
  private readonly bucket: Group;
  private readonly wetSign: Group;
  /** "Wet floor" over the sign, so it reads as a sign and not as something left lying around. */
  private readonly wetLabel: CSS2DObject;
  private readonly propMaterials: Material[] = [];
  /** When each waiting chore was added, for the night librarian who takes their time. */
  private readonly choreSince = new Map<Chore, number>();
  private mopTime = 0;

  /**
   * Whoever is on duty at a desk in this room right now, or null (no desk, or
   * nobody on this shift). `hour` is the viewer's local hour.
   */
  static create(
    kit: CharacterKit,
    grid: AreaGrid,
    context: AvatarContext,
    hour: number,
    room?: StaffRoom,
  ): Staff | null {
    const chair = staffChair(grid);
    const id = onDuty(grid.area.id, hour);
    return chair && id ? new Staff(kit, grid, chair, context, id, room) : null;
  }

  private constructor(
    kit: CharacterKit,
    private readonly grid: AreaGrid,
    chair: Point,
    context: AvatarContext,
    readonly id: StaffId,
    private readonly room?: StaffRoom,
  ) {
    this.person = PEOPLE[id];
    this.chair = chair;
    const desk = deskBeside(grid, chair);
    const facing = { x: desk.x - chair.x, y: desk.y - chair.y };
    this.aisle = { x: chair.x - facing.x, y: chair.y - facing.y };
    // The librarian's rounds: shelves, and the windows (opened or shut by day).
    const windows: Spot[] =
      this.person.kind === 'librarian'
        ? (room?.windows ?? []).map((w, i) => ({ ...w, window: i }))
        : [];
    this.windowCount = windows.length;
    this.errands =
      this.person.kind === 'librarian' ? [...shelvesIn(grid), ...windows] : receptionErrands(grid);
    this.elevator = elevatorFront(grid);
    const own: AvatarContext = {
      ...context,
      // The chair is a seat for them alone, facing the desk.
      seats: (tile) =>
        tile.x === chair.x && tile.y === chair.y ? { kind: 'chair', facing } : null,
      walkable: (tile) => (tile.x === chair.x && tile.y === chair.y) || grid.isWalkable(tile),
    };
    this.avatar = new Avatar(kit, this.person.look, chair, t(this.person.name), false, own);
    this.avatar.onTap = () => this.talk();
    this.avatar.setSleepy(!!this.person.drowsy);
    this.stretches = this.person.kind === 'librarian' ? mopStretches(grid) : [];
    const built = mopProps(this.propMaterials);
    this.mop = built.mop;
    this.bucket = built.bucket;
    this.wetSign = built.sign;
    this.bucket.visible = false;
    this.wetSign.visible = false;
    const label = document.createElement('div');
    label.className = 'staff-sign staff-sign--wet';
    label.textContent = `⚠️ ${t('staff.wetSign')}`;
    this.wetLabel = new CSS2DObject(label);
    this.wetLabel.position.set(0, 0.85, 0);
    this.wetLabel.visible = false;
    this.wetSign.add(this.wetLabel);
    this.props.add(this.bucket, this.wetSign);
  }

  get kind(): Kind {
    return this.person.kind;
  }

  /** Says the next of their lines. */
  talk(): void {
    const { lines } = this.person;
    const line = lines[this.lineIndex++ % lines.length];
    if (line) this.avatar.say(t(line));
  }

  /** A job for later, done when the round brings them by; the librarian tidies chairs. */
  addChore(chore: Chore): void {
    if (this.person.kind !== 'librarian') return;
    this.chores.push(chore);
    this.choreSince.set(chore, performance.now());
  }

  /** Chores waiting, e.g. to tell which chairs are already on the list. */
  get choresWaiting(): readonly Chore[] {
    return this.chores;
  }

  /** The receptionist walks over to the elevator and calls it for the player. */
  escort(): void {
    if (this.person.kind !== 'receptionist' || !this.elevator) return;
    this.escortLeft = ESCORT_SECONDS;
    this.avatar.say(t('staff.escort'));
  }

  update(delta: number, now = Date.now()): void {
    const seconds = now / 1000;
    const slot = Math.floor(seconds / SLOT);
    this.escortLeft = Math.max(0, this.escortLeft - delta);
    const wanted = this.wanted(slot);
    const chore = wanted.at === 'chore' ? this.chores[0] : undefined;
    const key =
      wanted.at === 'errand'
        ? `errand:${wanted.spot}`
        : chore
          ? `chore:${chore.stand.x},${chore.stand.y}`
          : wanted.at === 'mop'
            ? `mop:${wanted.stretch}:${wanted.leg}`
            : wanted.at;
    if (key !== this.at) {
      this.windowDone = false;
      this.choreLeft = CHORE_SECONDS;
      this.go(wanted, this.at === null);
    }
    this.at = key;
    this.updateMop(wanted, slot, delta);
    this.avatar.setDozing(
      !!this.person.drowsy &&
        wanted.at === 'desk' &&
        !this.avatar.isMoving &&
        chance(slot * 7 + 3) < DOZE_SHARE,
    );
    if (chore && !this.avatar.isMoving) {
      this.avatar.face(chore.facing.x, chore.facing.y);
      if (this.choreLeft === CHORE_SECONDS) {
        this.avatar.play('poke');
        if (this.person.drowsy) this.avatar.emote('sleepy', true);
      }
      this.choreLeft -= delta;
      if (this.choreLeft <= 0) {
        chore.done();
        this.chores.shift();
        this.choreSince.delete(chore);
      }
    }

    if (slot !== this.lastSlot) {
      this.lastSlot = slot;
      if (wanted.at === 'desk') this.deskMoment(slot);
      if (wanted.at === 'escort') this.avatar.play('poke');
    }
    const spot =
      wanted.at === 'errand'
        ? this.errands[wanted.spot]
        : wanted.at === 'escort'
          ? this.elevator
          : null;
    if (spot && !this.avatar.isMoving) {
      this.avatar.face(spot.facing.x, spot.facing.y);
      if (spot.window !== undefined && !this.windowDone) {
        this.windowDone = true;
        this.avatar.play('poke');
        this.room?.toggleWindow(spot.window);
      }
      this.reachIn -= delta;
      if (this.reachIn <= 0 && wanted.at === 'errand') {
        this.reachIn = REACH_SECONDS;
        this.avatar.play('poke');
      }
    }
    this.avatar.update(delta);
  }

  /**
   * The mop in hand and swishing while mopping; the bucket left at the
   * stretch's start, and the wet floor sign up there until the window ends.
   */
  private updateMop(wanted: Wanted, slot: number, delta: number): void {
    const mop = this.mopWindow(slot);
    const mopping = wanted.at === 'mop';
    if (mopping !== (this.mop.parent !== null)) {
      this.avatar.hold(mopping ? this.mop : null);
      if (mopping && wanted.leg === 0) this.avatar.say(t('staff.wetFloor'));
    }
    this.avatar.setSleepy(!!this.person.drowsy || mopping);
    if (mopping) {
      this.mopTime += delta;
      this.mop.rotation.y = Math.sin(this.mopTime * 5) * 0.45;
    }
    const stretch = mop ? this.stretches[mop.stretch] : undefined;
    const offset = slot % MOP_WINDOW;
    this.bucket.visible =
      !!stretch && mop !== null && offset >= mop.start && offset < mop.start + MOP_LEGS;
    this.wetSign.visible = !!stretch && mop !== null && offset >= mop.start;
    // Labels are drawn on their own: they follow the sign by hand.
    this.wetLabel.visible = this.wetSign.visible;
    if (stretch) {
      this.bucket.position.set(stretch.a.x + 0.25, FLOOR_Y, stretch.a.y + 0.75);
      const middle = { x: (stretch.a.x + stretch.b.x) / 2, y: (stretch.a.y + stretch.b.y) / 2 };
      this.wetSign.position.set(middle.x + 0.5, FLOOR_Y, middle.y + 0.2);
    }
  }

  /** This window's mopping, the same on every screen: which stretch and from which slot, or null. */
  private mopWindow(slot: number): { stretch: number; start: number } | null {
    if (this.stretches.length === 0) return null;
    const window = Math.floor(slot / MOP_WINDOW);
    if (chance(window * 11 + 5) >= MOP_CHANCE) return null;
    const start = Math.floor(chance(window * 11 + 6) * (MOP_WINDOW - MOP_LEGS - 6));
    const stretch = Math.floor(chance(window * 11 + 7) * this.stretches.length);
    return { stretch, start };
  }

  /** Where the clock (or the player's room) wants them this slot. */
  private wanted(slot: number): Wanted {
    if (this.escortLeft > 0) return { at: 'escort' };
    // A chair left out comes before the rounds (the night librarian takes a while to notice).
    const chore = this.chores[0];
    const since = chore ? (this.choreSince.get(chore) ?? 0) : 0;
    const late = this.person.drowsy ? NIGHT_CHORE_DELAY * 1000 : 0;
    if (chore && performance.now() - since >= late) return { at: 'chore' };
    const mop = this.mopWindow(slot);
    const inWindow = slot % MOP_WINDOW;
    if (mop && inWindow >= mop.start && inWindow < mop.start + MOP_LEGS) {
      return { at: 'mop', stretch: mop.stretch, leg: inWindow - mop.start };
    }
    if (this.errands.length === 0) return { at: 'desk' };
    const block = Math.floor(slot / BLOCK);
    const salt = this.id.length * 977;
    // Per block (a minute) one roll for an errand, one for when it starts and one for where.
    if (chance(block * 3 + salt) >= this.person.errands) return { at: 'desk' };
    const start = Math.floor(chance(block * 3 + 1 + salt) * (BLOCK - ERRAND_SLOTS + 1));
    const offset = slot - block * BLOCK;
    if (offset < start || offset >= start + ERRAND_SLOTS) return { at: 'desk' };
    let spot = Math.floor(chance(block * 3 + 2 + salt) * this.errands.length);
    // Windows only by day; at night that round goes to a shelf instead.
    if (this.errands[spot]?.window !== undefined && !(this.room?.daytime() ?? false)) {
      spot = Math.floor(chance(block * 3 + 2 + salt) * (this.errands.length - this.windowCount));
    }
    return { at: 'errand', spot };
  }

  /** Something small at the desk, different every slot, a yawn more likely late. */
  private deskMoment(slot: number): void {
    const salt = this.id.length * 131;
    if (chance(slot * 5 + salt) < this.person.sleepy) {
      this.avatar.emote('sleepy', true);
      return;
    }
    const roll = chance(slot * 5 + 1 + salt);
    // Most slots pass with nothing to see but the typing pose.
    if (roll > 0.45) return;
    const moment = DESK_MOMENTS[Math.floor(chance(slot * 5 + 2 + salt) * DESK_MOMENTS.length)];
    if (!moment || moment === 'type') return;
    if (moment === 'stretch') this.avatar.play('nod');
    else if (moment === 'look') this.avatar.play('wave');
    else this.avatar.emote(moment, true);
  }

  /** Walks to the desk or somewhere else; on arrival in the room they are simply already there. */
  private go(to: Wanted, now: boolean): void {
    const stretch = to.at === 'mop' ? this.stretches[to.stretch] : undefined;
    const spot =
      to.at === 'errand'
        ? this.errands[to.spot]
        : to.at === 'escort'
          ? this.elevator
          : to.at === 'chore'
            ? (this.chores[0] ?? null)
            : stretch && to.at === 'mop'
              ? { stand: to.leg % 2 === 0 ? stretch.b : stretch.a, facing: { x: 1, y: 0 } }
              : null;
    const goal = spot ? spot.stand : this.chair;
    if (now) {
      this.avatar.teleport(goal);
      return;
    }
    const from = this.avatar.tile;
    const start = from.x === this.chair.x && from.y === this.chair.y ? this.aisle : from;
    const end = spot ? spot.stand : this.aisle;
    const path = findPath(this.grid, start, end);
    if (!path) {
      this.avatar.teleport(goal);
      return;
    }
    const route = smoothPath(this.grid, this.avatar.floorPosition, [start, ...path]);
    if (!spot) route.push({ x: this.chair.x + 0.5, y: this.chair.y + 0.5 });
    this.avatar.follow(route);
  }

  dispose(): void {
    this.wetLabel.element.remove();
    this.avatar.hold(null);
    this.avatar.dispose();
    this.props.removeFromParent();
    this.props.traverse((node) => (node as Mesh).geometry?.dispose());
    this.mop.traverse((node) => (node as Mesh).geometry?.dispose());
    for (const material of this.propMaterials) material.dispose();
  }
}

/**
 * Straight runs of open floor, four to seven tiles long, away from chairs:
 * where the librarian mops. A few spread over the room.
 */
function mopStretches(grid: AreaGrid): { a: Point; b: Point }[] {
  const found: { a: Point; b: Point }[] = [];
  const clear = (p: Point) =>
    grid.isWalkable(p) &&
    !grid.isSeat(p) &&
    grid.doorTarget(p) === null &&
    !SIDES.some((d) => grid.isSeat({ x: p.x + d.x, y: p.y + d.y }));
  for (let y = 0; y < grid.height; y++) {
    let run: Point[] = [];
    for (let x = 0; x <= grid.width; x++) {
      const p = { x, y };
      if (x < grid.width && clear(p)) {
        run.push(p);
        continue;
      }
      if (run.length >= 4) {
        const a = run[0] as Point;
        found.push({ a, b: { x: a.x + Math.min(run.length, 7) - 1, y } });
      }
      run = [];
    }
  }
  return found.filter((_, i) => i % 2 === 0).slice(0, 6);
}

/** A mop (held in front, swished side to side), its bucket and a yellow wet floor sign. */
function mopProps(materials: Material[]): { mop: Group; bucket: Group; sign: Group } {
  const wood = new MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.7 });
  const strands = new MeshStandardMaterial({ color: 0xe8e2d0, roughness: 1 });
  const blue = new MeshStandardMaterial({ color: 0x3b6fb6, roughness: 0.5 });
  const water = new MeshStandardMaterial({ color: 0x8fb8c9, roughness: 0.2 });
  const yellow = new MeshStandardMaterial({ color: 0xf2c230, roughness: 0.55 });
  const ink = new MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
  materials.push(wood, strands, blue, water, yellow, ink);

  const mop = new Group();
  const handle = new Mesh(new CylinderGeometry(0.018, 0.018, 1.25, 8), wood);
  handle.rotation.x = 0.55;
  handle.position.set(0.12, 0.62, 0.32);
  const head = new Mesh(new CylinderGeometry(0.1, 0.16, 0.12, 10), strands);
  head.position.set(0.12, 0.06, 0.62);
  mop.add(handle, head);

  const bucket = new Group();
  const pail = new Mesh(new CylinderGeometry(0.19, 0.15, 0.3, 14), blue);
  pail.position.y = 0.15;
  const surface = new Mesh(new CylinderGeometry(0.17, 0.17, 0.01, 14), water);
  surface.position.y = 0.27;
  bucket.add(pail, surface);

  // An A-frame: two yellow boards leaning together, a dark band across each.
  const sign = new Group();
  for (const side of [-1, 1]) {
    const board = new Mesh(new BoxGeometry(0.34, 0.56, 0.02), yellow);
    board.position.set(0, 0.27, side * 0.09);
    board.rotation.x = side * 0.3;
    const band = new Mesh(new BoxGeometry(0.26, 0.07, 0.022), ink);
    band.position.set(0, 0.36, side * 0.064 + side * 0.006);
    band.rotation.x = side * 0.3;
    sign.add(board, band);
  }
  for (const group of [mop, bucket, sign]) {
    group.traverse((node) => {
      if ((node as Mesh).isMesh) (node as Mesh).castShadow = true;
    });
  }
  return { mop, bucket, sign };
}

/** The staff chair in a room, if it has one. */
export function staffChair(grid: AreaGrid): Point | null {
  let chair: Point | null = null;
  grid.area.layout.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === TILE.staffChair) chair = { x, y };
    }),
  );
  return chair;
}

function deskBeside(grid: AreaGrid, chair: Point): Point {
  return (
    [
      { x: chair.x, y: chair.y - 1 },
      { x: chair.x, y: chair.y + 1 },
      { x: chair.x - 1, y: chair.y },
      { x: chair.x + 1, y: chair.y },
    ].find((p) => grid.tileAt(p) === TILE.receptionDesk) ?? { x: chair.x, y: chair.y - 1 }
  );
}

/**
 * A little sign on an empty desk, e.g. "Back at 9:00", so a dark desk reads
 * as closed rather than broken.
 */
export function closedSign(grid: AreaGrid, text: string): CSS2DObject | null {
  const chair = staffChair(grid);
  if (!chair) return null;
  const desk = deskBeside(grid, chair);
  const element = document.createElement('div');
  element.className = 'staff-sign';
  element.textContent = text;
  const sign = new CSS2DObject(element);
  sign.position.set(desk.x + 0.5, 1.05, desk.y + 0.5);
  return sign;
}

const SIDES = [
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
];

/** Open floor in front of a bookcase, with the way to face it; a few spread over the room. */
function shelvesIn(grid: AreaGrid): Spot[] {
  const found: Spot[] = [];
  grid.area.layout.forEach((row, y) =>
    [...row].forEach((_, x) => {
      const stand = { x, y };
      if (!grid.isWalkable(stand) || grid.isSeat(stand)) return;
      const side = SIDES.find((d) => grid.tileAt({ x: x + d.x, y: y + d.y }) === TILE.bookcase);
      if (side) found.push({ stand, facing: side });
    }),
  );
  // Every fourth one is plenty, and keeps the trips varied.
  return found.filter((_, i) => i % 4 === 1);
}

/** The receptionist's errands: watering the plants and pinning notes on the board. */
function receptionErrands(grid: AreaGrid): Spot[] {
  const found: Spot[] = [];
  grid.area.layout.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c !== TILE.plant && c !== TILE.noticeBoard) return;
      const side = SIDES.find((d) => {
        const p = { x: x - d.x, y: y - d.y };
        return grid.isWalkable(p) && !grid.isSeat(p);
      });
      if (side) found.push({ stand: { x: x - side.x, y: y - side.y }, facing: side });
    }),
  );
  return found;
}

/** Where to stand to call the elevator, facing it. */
function elevatorFront(grid: AreaGrid): Spot | null {
  let spot: Spot | null = null;
  grid.area.layout.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (spot || c !== TILE.elevator) return;
      const side = SIDES.find((d) => grid.isWalkable({ x: x - d.x, y: y - d.y }));
      if (side) spot = { stand: { x: x - side.x, y: y - side.y }, facing: side };
    }),
  );
  return spot;
}
