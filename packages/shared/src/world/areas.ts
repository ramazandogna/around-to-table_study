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
};

export const AREAS: Record<AreaId, AreaDefinition> = {
  hall: {
    id: 'hall',
    layout: [
      '##############LL##############',
      '#P..........................P#',
      '#............................#',
      '#...CCCCCCC..................#',
      '#............................#',
      'K............................E',
      'K............................E',
      '#............................#',
      '#............................#',
      '#............................#',
      '#...................bbbb.....#',
      '#P..........................P#',
      '##############################',
    ],
    doors: { [TILE.doorToLibrary]: 'library', [TILE.doorToSmoking]: 'smoking' },
    spawn: { x: 14, y: 7 },
    renovation: [],
  },
  library: {
    id: 'library',
    layout: [
      '########################################',
      '#BBBB.BBBB.BBBB.BBBBBBBB.BBBB.BBBB.BBBB#',
      '#......................................#',
      '#P....................................P#',
      '#......................................#',
      '#...........S.S.S.S..S.S.S.S...........#',
      '#.......S.S.TTTTTTTTTTTTTTTT.S.S.......#',
      '#.......TTTTTTTTTTTTTTTTTTTTTTTT.......#',
      '#.....STTTTTTTTTTTTTTTTTTTTTTTTTTS.....#',
      '#.......TTTTTTTTTTTTTTTTTTTTTTTT.......#',
      '#.......S.S.TTTTTTTTTTTTTTTT.S.S.......#',
      '#...........S.S.S.S..S.S.S.S...........#',
      '#B....................................B#',
      '#B....................................B#',
      '#B....................................B#',
      '#......................................#',
      '######HH################################',
    ],
    doors: { [TILE.doorToHall]: 'hall' },
    spawn: { x: 6, y: 14 },
    // Only the left end of the table is open at launch.
    renovation: [{ x: 16, y: 2, w: 23, h: 14, unlockAtUsers: 50 }],
  },
  smoking: {
    id: 'smoking',
    layout: [
      '################',
      '#P............P#',
      '#..bb....bb....#',
      '#..............#',
      '#.....A........H',
      '#.....A........H',
      '#..............#',
      '#..bb....bb....#',
      '#P............P#',
      '################',
    ],
    doors: { [TILE.doorToHall]: 'hall' },
    spawn: { x: 8, y: 5 },
    renovation: [],
  },
};
