import type { AreaGrid, Point } from './grid';

const key = (p: Point) => `${p.x},${p.y}`;
const manhattan = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/**
 * 4-directional A*. Returns the steps from `start` (exclusive) to `goal`
 * (inclusive), or null when the goal cannot be reached.
 */
export function findPath(grid: AreaGrid, start: Point, goal: Point): Point[] | null {
  if (!grid.isWalkable(goal)) return null;
  if (start.x === goal.x && start.y === goal.y) return [];

  const open = new Map<string, Point>([[key(start), start]]);
  const cameFrom = new Map<string, Point>();
  const g = new Map<string, number>([[key(start), 0]]);
  const f = new Map<string, number>([[key(start), manhattan(start, goal)]]);

  while (open.size > 0) {
    let current: Point | undefined;
    let best = Infinity;
    for (const [k, p] of open) {
      const score = f.get(k) ?? Infinity;
      if (score < best) [best, current] = [score, p];
    }
    if (!current) break;

    const currentKey = key(current);
    if (current.x === goal.x && current.y === goal.y) {
      const path: Point[] = [current];
      let step = cameFrom.get(currentKey);
      while (step && key(step) !== key(start)) {
        path.unshift(step);
        step = cameFrom.get(key(step));
      }
      return path;
    }

    open.delete(currentKey);
    for (const next of grid.neighbors(current)) {
      const nextKey = key(next);
      const tentative = (g.get(currentKey) ?? Infinity) + 1;
      if (tentative < (g.get(nextKey) ?? Infinity)) {
        cameFrom.set(nextKey, current);
        g.set(nextKey, tentative);
        f.set(nextKey, tentative + manhattan(next, goal));
        open.set(nextKey, next);
      }
    }
  }
  return null;
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
