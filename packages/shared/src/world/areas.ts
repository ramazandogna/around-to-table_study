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
    rugs: [{ x: 13, y: 1, w: 4, h: 10 }],
  },
  library: {
    id: 'library',
    layout: [
      '##############################',
      '#BBBB.BBBB.BBBB.BBBB.BBBB.BBB#',
      '#............................#',
      '#P..........................P#',
      '#............................#',
      '#............................#',
      '#............................#',
      '#.......SSSSSSSSSSSSSS.......#',
      '#......STTTTTTTTTTTTTTS......#',
      '#.......SSSSSSSSSSSSSS.......#',
      '#............................#',
      '#............................#',
      '#B..........................B#',
      '#B..........................B#',
      '#B..........................B#',
      '#............................#',
      '######HH######################',
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
      '#.....A........H',
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
