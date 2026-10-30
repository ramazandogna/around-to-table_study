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
  /** The street entrance: where new arrivals come in. Drawn as a door, never walked through. */
  entrance: 'O',
  /** A notice board with the rules and this week's events; opens when someone stands next to it. */
  noticeBoard: 'N',
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
