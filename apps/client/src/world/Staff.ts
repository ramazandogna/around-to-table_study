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
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { t, type MessageKey } from '../i18n/t';
import { Avatar, type AvatarContext } from './Avatar';
import type { CharacterKit } from './characters';

/**
 * The people behind the desks: the librarians and the receptionists. Who sits
 * there follows the shifts (see shared `SHIFTS`): a woman in the library from
 * 9 to 15, a man from 15 to 22, nobody at night; the reception has a day and a
 * night receptionist.
 *
 * What they do is worked out from the clock in slots of a few seconds, each
 * picked by a seeded random, so it never repeats like a loop and yet every
 * visitor sees the same person at the same shelf at the same moment. Mostly
 * they stay at the desk (typing, a coffee, a stretch, a yawn in the late
 * hours); now and then they run an errand. The receptionist also walks
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

type Spot = { stand: Point; facing: Point };

/** Where a staff member is wanted right now. */
type Wanted = { at: 'desk' } | { at: 'errand'; spot: number } | { at: 'escort' };

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

  /**
   * Whoever is on duty at a desk in this room right now, or null (no desk, or
   * nobody on this shift). `hour` is the viewer's local hour.
   */
  static create(
    kit: CharacterKit,
    grid: AreaGrid,
    context: AvatarContext,
    hour: number,
  ): Staff | null {
    const chair = staffChair(grid);
    const id = onDuty(grid.area.id, hour);
    return chair && id ? new Staff(kit, grid, chair, context, id) : null;
  }

  private constructor(
    kit: CharacterKit,
    private readonly grid: AreaGrid,
    chair: Point,
    context: AvatarContext,
    readonly id: StaffId,
  ) {
    this.person = PEOPLE[id];
    this.chair = chair;
    const desk = deskBeside(grid, chair);
    const facing = { x: desk.x - chair.x, y: desk.y - chair.y };
    this.aisle = { x: chair.x - facing.x, y: chair.y - facing.y };
    this.errands = this.person.kind === 'librarian' ? shelvesIn(grid) : receptionErrands(grid);
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
    const key = wanted.at === 'errand' ? `errand:${wanted.spot}` : wanted.at;
    if (key !== this.at) this.go(wanted, this.at === null);
    this.at = key;

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
      this.reachIn -= delta;
      if (this.reachIn <= 0 && wanted.at === 'errand') {
        this.reachIn = REACH_SECONDS;
        this.avatar.play('poke');
      }
    }
    this.avatar.update(delta);
  }

  /** Where the clock (or the player's room) wants them this slot. */
  private wanted(slot: number): Wanted {
    if (this.escortLeft > 0) return { at: 'escort' };
    if (this.errands.length === 0) return { at: 'desk' };
    const block = Math.floor(slot / BLOCK);
    const salt = this.id.length * 977;
    // Per block (a minute) one roll for an errand, one for when it starts and one for where.
    if (chance(block * 3 + salt) >= this.person.errands) return { at: 'desk' };
    const start = Math.floor(chance(block * 3 + 1 + salt) * (BLOCK - ERRAND_SLOTS + 1));
    const offset = slot - block * BLOCK;
    if (offset < start || offset >= start + ERRAND_SLOTS) return { at: 'desk' };
    const spot = Math.floor(chance(block * 3 + 2 + salt) * this.errands.length);
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
    const spot =
      to.at === 'errand' ? this.errands[to.spot] : to.at === 'escort' ? this.elevator : null;
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
    this.avatar.dispose();
  }
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
