import type { Point } from '@att/shared';

/**
 * How far above the floor the ground is on a tile: the conference hall's
 * stage is a step up. People and pets stand on it; elsewhere it is zero.
 * The world sets it for the room it builds.
 */
let lift: (tile: Point) => number = () => 0;

export function setGround(fn: (tile: Point) => number): void {
  lift = fn;
}

export function groundAt(tile: Point): number {
  return lift(tile);
}

/** The same for a position in the world, rounding down to its tile. */
export function groundUnder(x: number, z: number): number {
  return lift({ x: Math.floor(x), y: Math.floor(z) });
}
