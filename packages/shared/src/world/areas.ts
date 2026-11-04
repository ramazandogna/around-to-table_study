import { TILE } from './tiles';

/** The building's shared rooms. */
export const PUBLIC_AREAS = ['hall', 'library', 'smoking', 'conference'] as const;
export type PublicAreaId = (typeof PUBLIC_AREAS)[number];

/**
 * Private rooms anyone can open: one layout per size. Bigger and decorated
 * rooms are for later (and may need premium).
 */
export const ROOM_SIZES = [3, 5, 9] as const;
export type RoomSize = (typeof ROOM_SIZES)[number];
export type RoomAreaId = `room${RoomSize}`;
export const ROOM_AREAS = ROOM_SIZES.map((size) => `room${size}` as RoomAreaId);

export type AreaId = PublicAreaId | RoomAreaId;

export const isRoomArea = (id: string): id is RoomAreaId =>
  (ROOM_AREAS as readonly string[]).includes(id);
export const roomArea = (size: RoomSize): RoomAreaId => `room${size}`;

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * The closed part of a room. It opens strip by strip as the room fills up:
 * whenever more people are inside than there are open seats, the next strip
 * (each holding a desk for two) opens, and it stays open.
 */
export type Renovation = Rect & { expansions: readonly Rect[] };

export type AreaDefinition = {
  id: AreaId;
  layout: readonly string[];
  /** Door tile char → the area it leads to. */
  doors: Partial<Record<string, AreaId>>;
  /** Where new arrivals stand when they did not come through a door. */
  spawn: { x: number; y: number };
  renovation: Renovation | null;
  /** Decorative carpets; walkable, drawn under furniture. */
  rugs: readonly Rect[];
};

export const AREAS: Record<AreaId, AreaDefinition> = {
  hall: {
    id: 'hall',
    // People come in from the street (bottom) and walk the rug straight to the library's
    // glass doors, so arriving and leaving never cross. Reception sits front right, facing
    // the people coming in, on the way to the elevator. On the left wall the smoking room's
    // door sits up in the corner, and the conference hall's double door lower down.
    // The notice board stands left of the rug, passed on the way in; the door frame would hide it lower down.
    // The receptionist's chair is behind the desk, on the elevator's side.
    layout: [
      '#######LLLL#######',
      '#P..............P#',
      'K................#',
      '#................#',
      '#................#',
      '#................E',
      'M.....N..........E',
      'M.A.........C....#',
      '#..bbbb.....CQ...#',
      '#P..........C...P#',
      '#######OOOO#######',
    ],
    doors: {
      [TILE.doorToLibrary]: 'library',
      [TILE.doorToSmoking]: 'smoking',
      [TILE.doorToConference]: 'conference',
    },
    spawn: { x: 8, y: 8 },
    renovation: null,
    rugs: [{ x: 7, y: 1, w: 4, h: 9 }],
  },
  library: {
    id: 'library',
    // Desks for two, in two loose rows that face each other across an aisle, so
    // people study side by side and see each other. Around them the room reads as a
    // library: three back-to-back stacks, wall shelves, a librarian's desk facing the
    // way in, and a reading corner with a sofa by the door. The right side is closed
    // for renovation and opens a desk at a time as the room fills up.
    layout: [
      '##############################',
      '#BBBB.BBBB.BBBB.BBBB.BBBB.BBB#',
      '#............................#',
      '#P.BBBB..BBBB..BBB...........#',
      '#..BBBB..BBBB..BBB...........#',
      '#............................#',
      '#..SS...SS....SS.....SS...SS.#',
      '#..TT...TT....TT.....TT...TT.#',
      '#............................#',
      '#....TT....TT...TT.TT...TT...#',
      '#....SS....SS...SS.SS...SS...#',
      '#B...........................#',
      '#B..N.....CCC................#',
      '#B.........Q.................#',
      '#bbA.........................#',
      '#P..R.....Y...P..............#',
      '#####HHHH#####################',
    ],
    doors: { [TILE.doorToHall]: 'hall' },
    spawn: { x: 6, y: 14 },
    renovation: {
      x: 18,
      y: 2,
      w: 11,
      h: 14,
      expansions: [
        { x: 18, y: 2, w: 3, h: 14 },
        { x: 21, y: 2, w: 3, h: 14 },
        { x: 24, y: 2, w: 2, h: 14 },
        { x: 26, y: 2, w: 3, h: 14 },
      ],
    },
    rugs: [{ x: 2, y: 5, w: 16, h: 7 }],
  },
  smoking: {
    id: 'smoking',
    layout: [
      '################',
      '#P....XV...GJ.P#',
      '#..bb....bb....#',
      '#..............#',
      '#.....A........H',
      '#U....A.....D..#',
      '#..............#',
      '#..bb....bb....#',
      '#P............P#',
      '################',
    ],
    doors: { [TILE.doorToHall]: 'hall' },
    spawn: { x: 8, y: 5 },
    renovation: null,
    rugs: [{ x: 4, y: 3, w: 6, h: 4 }],
  },

  conference: {
    id: 'conference',
    // As big as the library: a stage with a microphone along the back wall, a big
    // screen above it, and rows of theatre chairs facing it with an aisle down the
    // middle. Talks, concerts and screenings; for now it opens only for events.
    layout: [
      '##############################',
      '#P......^^^^^^^^^^^^^^......P#',
      '#.......^^^^^^^^^^^^^^.......#',
      '#.......^^^^^^I^^^^^^^.......#',
      '#............................#',
      '#..WWWWWWWWWWW..WWWWWWWWWWW..#',
      '#............................#',
      '#..WWWWWWWWWWW..WWWWWWWWWWW..#',
      '#............................#',
      '#..WWWWWWWWWWW..WWWWWWWWWWW..#',
      '#............................#',
      '#..WWWWWWWWWWW..WWWWWWWWWWW..#',
      '#............................#',
      '#..WWWWWWWWWWW..WWWWWWWWWWW..#',
      '#............................#',
      '#P..........................P#',
      '#############HHHH#############',
    ],
    doors: { [TILE.doorToHall]: 'hall' },
    spawn: { x: 14, y: 14 },
    renovation: null,
    rugs: [{ x: 14, y: 4, w: 2, h: 12 }],
  },

  // Private rooms: a table for everyone, a sofa, shelves, and a door back to the hall.
  room3: {
    id: 'room3',
    layout: [
      '#########',
      '#P..B..P#',
      '#..SSS..#',
      '#..TTT..#',
      '#.......#',
      '#.bb..Z.#',
      '####H####',
    ],
    doors: { [TILE.doorToHall]: 'hall' },
    spawn: { x: 4, y: 4 },
    renovation: null,
    rugs: [],
  },
  room5: {
    id: 'room5',
    layout: [
      '###########',
      '#P..BBB..P#',
      '#...SSS...#',
      '#...TTT...#',
      '#Z..S.S...#',
      '#.........#',
      '#.bb...bb.#',
      '#####H#####',
    ],
    doors: { [TILE.doorToHall]: 'hall' },
    spawn: { x: 5, y: 5 },
    renovation: null,
    rugs: [],
  },
  room9: {
    id: 'room9',
    layout: [
      '#############',
      '#P..BBBBB..P#',
      '#..SSS..SS..#',
      '#..TTT..TT..#',
      '#Z.SS...SS..#',
      '#...........#',
      '#.bb.....bb.#',
      '######H######',
    ],
    doors: { [TILE.doorToHall]: 'hall' },
    spawn: { x: 6, y: 5 },
    renovation: null,
    rugs: [],
  },
};
