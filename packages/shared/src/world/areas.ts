import { TILE } from './tiles';

export type AreaId = 'hall' | 'library' | 'smoking';

export type Rect = { x: number; y: number; w: number; h: number };

export type RenovationZone = Rect & {
  /** The zone opens once the community reaches this many users. */
  unlockAtUsers: number;
};

export type AreaDefinition = {
  id: AreaId;
  layout: readonly string[];
  /** Door tile char → the area it leads to. */
  doors: Partial<Record<string, AreaId>>;
  /** Where new arrivals stand when they did not come through a door. */
  spawn: { x: number; y: number };
  renovation: readonly RenovationZone[];
  /** Decorative carpets; walkable, drawn under furniture. */
  rugs: readonly Rect[];
};

export const AREAS: Record<AreaId, AreaDefinition> = {
  hall: {
    id: 'hall',
    // People come in from the street (bottom) and walk the rug straight to the library's
    // glass doors, so arriving and leaving never cross. Reception sits front right, facing
    // the people coming in, on the way to the elevator; the smoking room and sofas are left.
    // The notice board stands left of the rug, passed on the way in; the door frame would hide it lower down.
    layout: [
      '#######LLLL#######',
      '#P..............P#',
      '#................#',
      '#................#',
      '#................#',
      'K................E',
      '#.....N..........E',
      '#...........C....#',
      '#..bbbb.....C....#',
      '#P..........C...P#',
      '#######OOOO#######',
    ],
    doors: { [TILE.doorToLibrary]: 'library', [TILE.doorToSmoking]: 'smoking' },
    spawn: { x: 8, y: 8 },
    renovation: [],
    rugs: [{ x: 7, y: 1, w: 4, h: 9 }],
  },
  library: {
    id: 'library',
    // The long table is the heart of the room. Around it the room reads as a library:
    // two back-to-back stacks behind the table, wall shelves, a librarian's desk facing
    // the way in, and a reading corner with a sofa by the door. The path from the door
    // to the table stays open, with the notice board beside it.
    layout: [
      '##############################',
      '#BBBB.BBBB.BBBB.BBBB.BBBB.BBB#',
      '#............................#',
      '#P.BBBB..BBBB................#',
      '#..BBBB..BBBB................#',
      '#............................#',
      '#............................#',
      '#.......SSSSSSSSSSSSSS.......#',
      '#......STTTTTTTTTTTTTTS......#',
      '#.......SSSSSSSSSSSSSS.......#',
      '#............................#',
      '#B...........................#',
      '#B..N.....CCC................#',
      '#B...........................#',
      '#bbA.........................#',
      '#P............P..............#',
      '#####HHHH#####################',
    ],
    doors: { [TILE.doorToHall]: 'hall' },
    spawn: { x: 6, y: 14 },
    // Only the left end of the table is open at launch; seats sit shoulder to shoulder.
    renovation: [{ x: 16, y: 2, w: 13, h: 14, unlockAtUsers: 50 }],
    rugs: [{ x: 5, y: 6, w: 20, h: 5 }],
  },
  smoking: {
    id: 'smoking',
    layout: [
      '################',
      '#P............P#',
      '#..bb....bb....#',
      '#..............#',
      '#.....A........H',
      '#.....A........#',
      '#..............#',
      '#..bb....bb....#',
      '#P............P#',
      '################',
    ],
    doors: { [TILE.doorToHall]: 'hall' },
    spawn: { x: 8, y: 5 },
    renovation: [],
    rugs: [{ x: 4, y: 3, w: 6, h: 4 }],
  },
};
