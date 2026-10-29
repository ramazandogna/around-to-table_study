import { TILE_SIZE } from '@att/shared';

/** How many tiles should fit across the shorter side of the screen. */
const TILES_ON_SHORT_SIDE = 14;
const MIN_ZOOM = 2;
const MAX_ZOOM = 6;

/** Integer zoom keeps pixels square and crisp on every screen size. */
export function zoomFor(width: number, height: number): number {
  const zoom = Math.floor(Math.min(width, height) / (TILES_ON_SHORT_SIDE * TILE_SIZE));
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * Camera center on one axis: follow the target, but never show past the map edge.
 * When the map is smaller than the view, keep it centered instead.
 */
export function cameraCenter(target: number, mapSize: number, viewSize: number): number {
  if (mapSize <= viewSize) return mapSize / 2;
  return Math.min(mapSize - viewSize / 2, Math.max(viewSize / 2, target));
}
