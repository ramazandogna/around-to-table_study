import type { AreaGrid, Point } from './grid';
import { TILE } from './tiles';

/** Walking through a chair is allowed but avoided, unless the chair is where you're going. */
const SEAT_STEP_COST = 5;
const DIAGONAL_COST = Math.SQRT2;

const STEPS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];

const key = (p: Point) => `${p.x},${p.y}`;
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const manhattan = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
/** Exact distance on a grid with diagonal steps. */
const octile = (a: Point, b: Point) => {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return Math.max(dx, dy) + (DIAGONAL_COST - 1) * Math.min(dx, dy);
};

/** A tile a diagonal step may brush past: open floor, not furniture or a chair. */
const clearCorner = (grid: AreaGrid, p: Point) =>
  grid.isWalkable(p) && grid.tileAt(p) !== TILE.seat;

/** Neighbors in 8 directions; a diagonal step never cuts the corner of a wall, furniture or chair. */
function steps(grid: AreaGrid, p: Point): Point[] {
  const result: Point[] = [];
  for (const d of STEPS) {
    const next = { x: p.x + d.x, y: p.y + d.y };
    if (!grid.isWalkable(next)) continue;
    if (
      d.x !== 0 &&
      d.y !== 0 &&
      (!clearCorner(grid, { x: p.x + d.x, y: p.y }) || !clearCorner(grid, { x: p.x, y: p.y + d.y }))
    ) {
      continue;
    }
    result.push(next);
  }
  return result;
}

/**
 * A* in 8 directions. Returns the tiles from `start` (exclusive) to `goal`
 * (inclusive), or null when the goal cannot be reached. Paths go around seats.
 */
export function findPath(grid: AreaGrid, start: Point, goal: Point): Point[] | null {
  if (!grid.isWalkable(goal)) return null;
  if (same(start, goal)) return [];

  const open = new Map<string, Point>([[key(start), start]]);
  const cameFrom = new Map<string, Point>();
  const g = new Map<string, number>([[key(start), 0]]);
  const f = new Map<string, number>([[key(start), octile(start, goal)]]);

  while (open.size > 0) {
    let current: Point | undefined;
    let best = Infinity;
    for (const [k, p] of open) {
      const score = f.get(k) ?? Infinity;
      if (score < best) [best, current] = [score, p];
    }
    if (!current) break;

    const currentKey = key(current);
    if (same(current, goal)) {
      const path: Point[] = [current];
      let step = cameFrom.get(currentKey);
      while (step && key(step) !== key(start)) {
        path.unshift(step);
        step = cameFrom.get(key(step));
      }
      return path;
    }

    open.delete(currentKey);
    for (const next of steps(grid, current)) {
      const nextKey = key(next);
      const diagonal = next.x !== current.x && next.y !== current.y;
      const seat = !same(next, goal) && grid.tileAt(next) === TILE.seat;
      const cost = (diagonal ? DIAGONAL_COST : 1) * (seat ? SEAT_STEP_COST : 1);
      const tentative = (g.get(currentKey) ?? Infinity) + cost;
      if (tentative < (g.get(nextKey) ?? Infinity)) {
        cameFrom.set(nextKey, current);
        g.set(nextKey, tentative);
        f.set(nextKey, tentative + octile(next, goal));
        open.set(nextKey, next);
      }
    }
  }
  return null;
}

/** How far a walking body reaches to either side of its line, in tiles. */
const BODY_RADIUS = 0.3;
const LINE_SAMPLES_PER_TILE = 8;

/**
 * True when a body can walk in a straight line from `a` to `b` (positions in
 * tiles, e.g. 3.5 is the middle of tile 3) without touching anything blocked.
 * Chairs count as blocked except the `goal` tile, so lines do not cut through seats.
 */
export function hasClearLine(
  grid: AreaGrid,
  a: { x: number; y: number },
  b: { x: number; y: number },
  goal?: Point,
): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const samples = Math.max(1, Math.ceil(length * LINE_SAMPLES_PER_TILE));
  // Offsets to both sides of the line, so the shoulders clear corners too.
  const side =
    length > 0
      ? { x: (-dy / length) * BODY_RADIUS, y: (dx / length) * BODY_RADIUS }
      : { x: 0, y: 0 };
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const x = a.x + dx * t;
    const y = a.y + dy * t;
    for (const s of [-1, 0, 1]) {
      const tile = { x: Math.floor(x + side.x * s), y: Math.floor(y + side.y * s) };
      if (!grid.isWalkable(tile)) return false;
      // Chairs are small: only the middle of the body has to stay off them.
      if (s !== 0 || grid.tileAt(tile) !== TILE.seat) continue;
      if (!(goal && same(tile, goal))) {
        // The seat you stand up from is fine to leave.
        if (!same(tile, { x: Math.floor(a.x), y: Math.floor(a.y) })) return false;
      }
    }
  }
  return true;
}

/**
 * Turns a tile path into as few straight lines as possible: each corner is kept
 * only when the next one cannot be seen from the last kept point. `from` is the
 * walker's current position in tiles. Returns tile-center waypoints.
 */
export function smoothPath(
  grid: AreaGrid,
  from: { x: number; y: number },
  path: readonly Point[],
): { x: number; y: number }[] {
  const goal = path.at(-1);
  if (!goal) return [];
  const centers = path.map((p) => ({ x: p.x + 0.5, y: p.y + 0.5 }));
  const result: { x: number; y: number }[] = [];
  let anchor = from;
  let i = 0;
  while (i < centers.length) {
    // The furthest center still in a straight line from the anchor.
    let furthest = i;
    for (let j = centers.length - 1; j > i; j--) {
      if (hasClearLine(grid, anchor, centers[j] as { x: number; y: number }, goal)) {
        furthest = j;
        break;
      }
    }
    const point = centers[furthest] as { x: number; y: number };
    result.push(point);
    anchor = point;
    i = furthest + 1;
  }
  return result;
}

/**
 * Where to walk when the user taps `target`: the tile itself if walkable,
 * otherwise the closest walkable neighbor (e.g. tapping a table walks next to it).
 */
export function resolveWalkTarget(grid: AreaGrid, from: Point, target: Point): Point | null {
  if (grid.isWalkable(target)) return target;
  const candidates = [
    { x: target.x + 1, y: target.y },
    { x: target.x - 1, y: target.y },
    { x: target.x, y: target.y + 1 },
    { x: target.x, y: target.y - 1 },
  ].filter((p) => grid.isWalkable(p));
  candidates.sort((a, b) => manhattan(a, from) - manhattan(b, from));
  return candidates[0] ?? null;
}
