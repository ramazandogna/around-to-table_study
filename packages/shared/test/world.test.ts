import { describe, expect, it } from 'vitest';
import {
  AREA_RULES,
  AREAS,
  TILE,
  createAreaGrid,
  findPath,
  hasClearLine,
  resolveWalkTarget,
  smoothPath,
  stripsNeeded,
  type AreaId,
} from '../src';

const areaIds = Object.keys(AREAS) as AreaId[];

describe('area layouts', () => {
  it.each(areaIds)('%s has rectangular rows', (id) => {
    const { layout } = AREAS[id];
    const width = layout[0]?.length;
    expect(layout.every((row) => row.length === width)).toBe(true);
  });

  it.each(areaIds)('%s spawn is walkable', (id) => {
    expect(createAreaGrid(id).isWalkable(AREAS[id].spawn)).toBe(true);
  });

  it.each(areaIds)('%s doors lead to areas that have a way back', (id) => {
    for (const to of Object.values(AREAS[id].doors)) {
      if (!to) continue;
      const target = createAreaGrid(to);
      const arrival = target.arrivalPoint(id);
      expect(target.isWalkable(arrival)).toBe(true);
      expect(target.doorTarget(arrival)).toBeNull();
      expect(arrival).not.toEqual(AREAS[to].spawn);
    }
  });

  it.each(areaIds)('%s spawn can reach every door', (id) => {
    const grid = createAreaGrid(id);
    const doorChars = Object.keys(AREAS[id].doors);
    AREAS[id].layout.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (doorChars.includes(c)) {
          expect(findPath(grid, AREAS[id].spawn, { x, y })).not.toBeNull();
        }
      }),
    );
  });
});

describe('renovation zone', () => {
  const zone = AREAS.library.renovation;
  if (!zone) throw new Error('library must have a renovation zone');
  const inside = { x: zone.x + zone.w - 2, y: 8 };
  const firstStrip = zone.expansions[0];
  if (!firstStrip) throw new Error('library renovation must open in strips');
  const inFirstStrip = { x: firstStrip.x + 1, y: 8 };

  it('blocks the right side of the library while closed', () => {
    const grid = createAreaGrid('library', 0);
    expect(grid.blockReason(inside)).toBe('renovation');
    expect(findPath(grid, AREAS.library.spawn, inFirstStrip)).toBeNull();
  });

  it('opens strip by strip, each reachable from the open room', () => {
    for (let opened = 1; opened <= zone.expansions.length; opened++) {
      const grid = createAreaGrid('library', opened);
      const strip = zone.expansions[opened - 1];
      if (!strip) continue;
      expect(findPath(grid, AREAS.library.spawn, { x: strip.x + 1, y: 8 })).not.toBeNull();
    }
    expect(createAreaGrid('library', zone.expansions.length).isWalkable(inside)).toBe(true);
  });

  it('starts with twelve chairs; the strips add a table for four, then two desks for two', () => {
    const chairs = [0, 1, 2, 3].map((opened) => createAreaGrid('library', opened).openChairs());
    expect(chairs.map((open) => open.length)).toEqual([12, 16, 18, 20]);
    expect(zone.expansions).toHaveLength(3);
  });

  it('keeps twenty chairs in all: two tables for four and two desks for two open, the rest behind', () => {
    const seats = AREAS.library.layout
      .join('')
      .split('')
      .filter((c) => c === 'S');
    expect(seats).toHaveLength(20);
  });

  it('opens a desk when the thirteenth person comes in, and never closes it again', () => {
    expect(stripsNeeded('library', 12, 0)).toBe(0);
    expect(stripsNeeded('library', 13, 0)).toBe(1);
    expect(stripsNeeded('library', 17, 1)).toBe(2);
    expect(stripsNeeded('library', 2, 2)).toBe(2);
    expect(stripsNeeded('library', 500, 0)).toBe(zone.expansions.length);
    expect(stripsNeeded('hall', 500, 0)).toBe(0);
  });
});

describe('seatAt', () => {
  it('turns sofas towards the middle of the room', () => {
    const smoking = createAreaGrid('smoking');
    expect(smoking.seatAt({ x: 3, y: 2 })).toEqual({ kind: 'sofa', facing: { x: 0, y: 1 } });
    expect(smoking.seatAt({ x: 3, y: 7 })).toEqual({ kind: 'sofa', facing: { x: 0, y: -1 } });
    expect(smoking.isWalkable({ x: 3, y: 7 })).toBe(true);
  });

  it('knows chairs from sofas and floor', () => {
    const library = createAreaGrid('library');
    expect(library.seatAt({ x: 3, y: 6 })?.kind).toBe('chair');
    expect(library.seatAt({ x: 1, y: 14 })?.kind).toBe('sofa');
    expect(library.seatAt(AREAS.library.spawn)).toBeNull();
  });
});

describe('seatFacing', () => {
  const grid = createAreaGrid('library');

  it('points every library seat at the table', () => {
    AREAS.library.layout.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c !== 'S') return;
        const toTable = grid.seatFacing({ x, y });
        expect(toTable).not.toBeNull();
        if (toTable) expect(grid.tileAt({ x: x + toTable.x, y: y + toTable.y })).toBe('T');
      }),
    );
  });

  it('ignores tiles that are not seats', () => {
    expect(grid.seatFacing(AREAS.library.spawn)).toBeNull();
  });
});

describe('findPath', () => {
  const grid = createAreaGrid('hall');

  it('returns steps excluding start and including goal', () => {
    const path = findPath(grid, { x: 2, y: 2 }, { x: 4, y: 2 });
    expect(path).toEqual([
      { x: 3, y: 2 },
      { x: 4, y: 2 },
    ]);
  });

  it('walks around the reception desk', () => {
    const path = findPath(grid, { x: 11, y: 8 }, { x: 14, y: 8 });
    expect(path?.length).toBeGreaterThan(2);
    expect(path?.every((p) => grid.isWalkable(p))).toBe(true);
  });

  it('walks around chairs on the way to a seat', () => {
    const library = createAreaGrid('library');
    const goal = { x: 8, y: 6 };
    const path = findPath(library, { x: 8, y: 10 }, goal);
    expect(path?.at(-1)).toEqual(goal);
    expect(path?.slice(0, -1).some((p) => library.tileAt(p) === 'S')).toBe(false);
  });

  it('steps diagonally across open floor', () => {
    const path = findPath(grid, { x: 2, y: 2 }, { x: 4, y: 4 });
    expect(path).toEqual([
      { x: 3, y: 3 },
      { x: 4, y: 4 },
    ]);
  });

  it('never cuts the corner of a blocked tile', () => {
    const path = findPath(grid, { x: 11, y: 8 }, { x: 14, y: 8 }) ?? [];
    let from = { x: 11, y: 8 };
    for (const step of path) {
      if (step.x !== from.x && step.y !== from.y) {
        expect(grid.isWalkable({ x: step.x, y: from.y })).toBe(true);
        expect(grid.isWalkable({ x: from.x, y: step.y })).toBe(true);
      }
      from = step;
    }
  });

  it('reports the elevator as blocked', () => {
    expect(grid.blockReason({ x: 17, y: 5 })).toBe('elevator');
  });
});

describe('resolveWalkTarget', () => {
  it('picks a walkable neighbor next to a blocked tile', () => {
    const grid = createAreaGrid('hall');
    const target = resolveWalkTarget(grid, { x: 8, y: 8 }, { x: 12, y: 8 });
    expect(target).toEqual({ x: 11, y: 8 });
  });
});

describe('notice boards', () => {
  it('stands in the hall and the library, beside the way in', () => {
    for (const id of ['hall', 'library'] as const) {
      const grid = createAreaGrid(id);
      const boards: { x: number; y: number }[] = [];
      grid.area.layout.forEach((row, y) =>
        [...row].forEach((c, x) => c === TILE.noticeBoard && boards.push({ x, y })),
      );
      expect(boards).toHaveLength(1);
      const board = boards[0] ?? { x: 0, y: 0 };
      expect(grid.isWalkable(board)).toBe(false);
      // Someone can stand next to it to read it.
      expect(resolveWalkTarget(grid, grid.area.spawn, board)).not.toBeNull();
    }
  });
});

describe('smoothPath', () => {
  const grid = createAreaGrid('hall');

  it('walks open floor in one straight line', () => {
    const path = findPath(grid, { x: 2, y: 2 }, { x: 7, y: 4 }) ?? [];
    expect(smoothPath(grid, { x: 2.5, y: 2.5 }, path)).toEqual([{ x: 7.5, y: 4.5 }]);
  });

  it('keeps corners where a straight line would hit something', () => {
    const from = { x: 11, y: 8 };
    const path = findPath(grid, from, { x: 14, y: 8 }) ?? [];
    const route = smoothPath(grid, { x: 11.5, y: 8.5 }, path);
    expect(route.length).toBeGreaterThan(1);
    let at = { x: 11.5, y: 8.5 };
    for (const point of route) {
      expect(hasClearLine(grid, at, point, { x: 14, y: 8 })).toBe(true);
      at = point;
    }
  });

  it('does not cut through chairs on the way to a seat', () => {
    const library = createAreaGrid('library');
    const goal = { x: 8, y: 6 };
    const path = findPath(library, { x: 11, y: 9 }, goal) ?? [];
    let at = { x: 11.5, y: 9.5 };
    for (const point of smoothPath(library, at, path)) {
      expect(hasClearLine(library, at, point, goal)).toBe(true);
      at = point;
    }
    expect(at).toEqual({ x: 8.5, y: 6.5 });
  });
});

describe('the librarian and pets', () => {
  it('keeps the chair behind the librarian desk for her alone', () => {
    const grid = createAreaGrid('library');
    const chair = { x: 11, y: 13 };
    expect(grid.tileAt(chair)).toBe(TILE.staffChair);
    expect(grid.isWalkable(chair)).toBe(false);
    expect(grid.isSeat(chair)).toBe(false);
    expect(grid.tileAt({ x: 11, y: 12 })).toBe(TILE.receptionDesk);
  });

  it('keeps pets out of the library only', () => {
    expect(AREA_RULES.library.pets).toBe(false);
    expect(AREA_RULES.hall.pets).toBe(true);
    expect(AREA_RULES.smoking.pets).toBe(true);
  });
});

describe('the smoking room games', () => {
  it('stands the machines against the north wall, each with room to play in front', () => {
    const grid = createAreaGrid('smoking');
    for (const [char, x] of [
      [TILE.vendingMachine, 7],
      [TILE.arcade, 11],
      [TILE.clawMachine, 12],
    ] as const) {
      expect(grid.tileAt({ x, y: 1 })).toBe(char);
      expect(grid.isWalkable({ x, y: 1 })).toBe(false);
      expect(grid.isWalkable({ x, y: 2 })).toBe(true);
    }
  });
});
