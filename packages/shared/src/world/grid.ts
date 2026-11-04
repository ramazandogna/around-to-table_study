import type { AreaDefinition, AreaId, Rect } from './areas';
import { AREAS, isRoomArea } from './areas';
import { TILE, isWalkableTile } from './tiles';

export type Point = { x: number; y: number };

export type BlockReason = 'wall' | 'renovation' | 'elevator' | 'stage';

/** Somewhere to sit: a chair at a table (for studying) or a sofa (for resting). */
export type Seat = {
  kind: 'chair' | 'sofa';
  /** The way a seated person faces: towards the table, or out into the room. */
  facing: Point;
  /** A theatre chair in the conference hall: sat on like a sofa, chair-high. */
  theater?: true;
};

const DIRECTIONS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

function inRect(p: Point, r: Rect): boolean {
  return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
}

/** Walkability and door lookup for one area. Shared by client and server. */
export class AreaGrid {
  readonly width: number;
  readonly height: number;

  constructor(
    readonly area: AreaDefinition,
    /** How many strips of the renovation have opened so far. */
    readonly opened = 0,
    /**
     * The conference hall's stage is closed to this person: only the host of
     * the approved event on now (and admins) may step onto it.
     */
    readonly stageClosed = false,
  ) {
    this.height = area.layout.length;
    this.width = area.layout[0]?.length ?? 0;
  }

  tileAt({ x, y }: Point): string {
    return this.area.layout[y]?.[x] ?? TILE.wall;
  }

  isLockedRenovation(p: Point): boolean {
    const zone = this.area.renovation;
    return (
      !!zone &&
      inRect(p, zone) &&
      !zone.expansions.slice(0, this.opened).some((strip) => inRect(p, strip))
    );
  }

  blockReason(p: Point): BlockReason | null {
    const tile = this.tileAt(p);
    if (tile === TILE.elevator) return 'elevator';
    if (this.isLockedRenovation(p)) return 'renovation';
    if (this.stageClosed && (tile === TILE.stage || tile === TILE.microphone)) return 'stage';
    return isWalkableTile(tile) ? null : 'wall';
  }

  /** The same room with the stage closed (or open) to the person walking. */
  withStageClosed(closed: boolean): AreaGrid {
    return closed === this.stageClosed ? this : new AreaGrid(this.area, this.opened, closed);
  }

  isWalkable(p: Point): boolean {
    return this.blockReason(p) === null;
  }

  /** For a chair tile, the direction towards the table it belongs to. */
  seatFacing(p: Point): Point | null {
    if (this.tileAt(p) !== TILE.seat) return null;
    return (
      DIRECTIONS.find((d) => this.tileAt({ x: p.x + d.x, y: p.y + d.y }) === TILE.table) ?? null
    );
  }

  /** True for anything one sits on: chairs and sofas. Only one person fits. */
  isSeat(p: Point): boolean {
    const tile = this.tileAt(p);
    return tile === TILE.seat || tile === TILE.bench || tile === TILE.theaterSeat;
  }

  /** The conference hall's stage, where a presenter stands. */
  isStage(p: Point): boolean {
    return this.tileAt(p) === TILE.stage;
  }

  /** The chair or sofa on a tile, and which way someone sitting there faces. */
  seatAt(p: Point): Seat | null {
    const tile = this.tileAt(p);
    // Theatre chairs all face the stage, at the north wall.
    if (tile === TILE.theaterSeat) return { kind: 'sofa', facing: { x: 0, y: -1 }, theater: true };
    if (tile === TILE.bench) {
      // Sofas face the middle of the room, away from the wall behind them.
      return { kind: 'sofa', facing: { x: 0, y: p.y < this.height / 2 ? 1 : -1 } };
    }
    const facing = this.seatFacing(p);
    return facing ? { kind: 'chair', facing } : null;
  }

  /** Every free-standing chair at a table that is open, for counting room. */
  openChairs(): Point[] {
    const chairs: Point[] = [];
    this.area.layout.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c === TILE.seat && this.isWalkable({ x, y })) chairs.push({ x, y });
      }),
    );
    return chairs;
  }

  doorTarget(p: Point): AreaId | null {
    return this.area.doors[this.tileAt(p)] ?? null;
  }

  /** The area behind a door right next to `p`, if there is one. */
  doorNextTo(p: Point): AreaId | null {
    for (const d of DIRECTIONS) {
      const to = this.doorTarget({ x: p.x + d.x, y: p.y + d.y });
      if (to) return to;
    }
    return null;
  }

  neighbors(p: Point): Point[] {
    return DIRECTIONS.map((d) => ({ x: p.x + d.x, y: p.y + d.y })).filter((n) =>
      this.isWalkable(n),
    );
  }

  /**
   * The tile just inside the door that leads to `from`, so arrivals do not
   * immediately trigger the door again. Falls back to the area spawn.
   */
  arrivalPoint(from: AreaId): Point {
    const doorChar = Object.entries(this.area.doors).find(([, to]) => to === from)?.[0];
    if (doorChar) {
      const doorTiles: Point[] = [];
      this.area.layout.forEach((row, y) =>
        [...row].forEach((c, x) => c === doorChar && doorTiles.push({ x, y })),
      );
      const door = doorTiles[Math.floor((doorTiles.length - 1) / 2)];
      const inside = door && this.neighbors(door).find((n) => !this.doorTarget(n));
      if (inside) return inside;
    }
    // Back from a private room: out of the elevator.
    if (isRoomArea(from)) {
      const elevator = this.area.layout
        .flatMap((row, y) => [...row].map((c, x) => ({ c, x, y })))
        .find(({ c }) => c === TILE.elevator);
      const out = elevator && this.neighbors(elevator)[0];
      if (out) return out;
    }
    return { ...this.area.spawn };
  }
}

export function createAreaGrid(id: AreaId, opened = 0): AreaGrid {
  return new AreaGrid(AREAS[id], opened);
}

/**
 * How many renovation strips should be open with `people` in the room: one
 * more each time everyone would not find a chair, never fewer than already open.
 */
export function stripsNeeded(id: AreaId, people: number, opened: number): number {
  const strips = AREAS[id].renovation?.expansions.length ?? 0;
  let count = opened;
  while (count < strips && people > new AreaGrid(AREAS[id], count).openChairs().length) count++;
  return count;
}
