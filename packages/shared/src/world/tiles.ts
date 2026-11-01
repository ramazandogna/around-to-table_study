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
  /** One half of a sofa; people can sit on it like a chair, facing the room. */
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
  /** The chair behind the librarian's desk: hers, so nobody else walks or sits there. */
  staffChair: 'Q',
  /** Things to play with in the smoking room, against a wall. */
  arcade: 'G',
  clawMachine: 'J',
  vendingMachine: 'V',
  /** A dartboard in its cabinet against the wall: two to four people play darts. */
  dartboard: 'X',
  /** A round card table with dice: the smoking room's table games. */
  gameTable: 'D',
  /** The jukebox: people queue songs for the room. */
  jukebox: 'U',
  /** An umbrella stand by the door, a few umbrellas in it. */
  umbrellaStand: 'R',
  /** The lost-and-found box: things members forgot. */
  lostBox: 'Y',
  /** A small round table with games on it, in private rooms that allow games. */
  roomGameTable: 'Z',
} as const;

export type TileChar = (typeof TILE)[keyof typeof TILE];

const WALKABLE: ReadonlySet<string> = new Set([
  TILE.floor,
  TILE.seat,
  TILE.bench,
  TILE.doorToHall,
  TILE.doorToLibrary,
  TILE.doorToSmoking,
]);

export function isWalkableTile(char: string): boolean {
  return WALKABLE.has(char);
}
