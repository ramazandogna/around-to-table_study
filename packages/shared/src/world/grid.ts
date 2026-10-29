import type { AreaDefinition, AreaId, Rect } from './areas';
import { AREAS } from './areas';
import { TILE, isWalkableTile } from './tiles';

export type Point = { x: number; y: number };

export type BlockReason = 'wall' | 'renovation' | 'elevator';

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
    /** Number of users counted towards unlocking renovation zones. */
    readonly userCount = 0,
  ) {
    this.height = area.layout.length;
    this.width = area.layout[0]?.length ?? 0;
  }

  tileAt({ x, y }: Point): string {
    return this.area.layout[y]?.[x] ?? TILE.wall;
  }

  isLockedRenovation(p: Point): boolean {
    return this.area.renovation.some((z) => this.userCount < z.unlockAtUsers && inRect(p, z));
  }

  blockReason(p: Point): BlockReason | null {
    const tile = this.tileAt(p);
    if (tile === TILE.elevator) return 'elevator';
    if (this.isLockedRenovation(p)) return 'renovation';
    return isWalkableTile(tile) ? null : 'wall';
  }

  isWalkable(p: Point): boolean {
    return this.blockReason(p) === null;
  }

  doorTarget(p: Point): AreaId | null {
    return this.area.doors[this.tileAt(p)] ?? null;
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
    return { ...this.area.spawn };
  }
}

export function createAreaGrid(id: AreaId, userCount = 0): AreaGrid {
  return new AreaGrid(AREAS[id], userCount);
}
