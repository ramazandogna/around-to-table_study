/**
 * One character per tile in the ASCII area layouts.
 * Placeholder art draws each kind with flat colors until real tilesets arrive.
 */
export const TILE = {
  floor: '.',
  wall: '#',
  bookcase: 'B',
  table: 'T',
  seat: 'S',
  plant: 'P',
  receptionDesk: 'C',
  bench: 'b',
  ashtray: 'A',
  elevator: 'E',
  doorToHall: 'H',
  doorToLibrary: 'L',
  doorToSmoking: 'K',
} as const;

export type TileChar = (typeof TILE)[keyof typeof TILE];

const WALKABLE: ReadonlySet<string> = new Set([
  TILE.floor,
  TILE.seat,
  TILE.doorToHall,
  TILE.doorToLibrary,
  TILE.doorToSmoking,
]);

export function isWalkableTile(char: string): boolean {
  return WALKABLE.has(char);
}
