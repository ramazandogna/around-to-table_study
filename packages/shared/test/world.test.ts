import { describe, expect, it } from 'vitest';
import { AREAS, createAreaGrid, findPath, resolveWalkTarget, type AreaId } from '../src';

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
  const [zone] = AREAS.library.renovation;
  if (!zone) throw new Error('library must have a renovation zone');
  const inside = { x: zone.x + 2, y: 4 };

  it('blocks the right side of the library while locked', () => {
    const grid = createAreaGrid('library', 0);
    expect(grid.blockReason(inside)).toBe('renovation');
    expect(findPath(grid, AREAS.library.spawn, inside)).toBeNull();
  });

  it('opens once enough users have joined', () => {
    const grid = createAreaGrid('library', zone.unlockAtUsers);
    expect(grid.isWalkable(inside)).toBe(true);
    expect(findPath(grid, AREAS.library.spawn, inside)).not.toBeNull();
  });

  it('leaves some seats usable at launch', () => {
    const grid = createAreaGrid('library', 0);
    let openSeats = 0;
    AREAS.library.layout.forEach((row, y) =>
      [...row].forEach((c, x) => c === 'S' && grid.isWalkable({ x, y }) && openSeats++),
    );
    expect(openSeats).toBeGreaterThanOrEqual(6);
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
    const path = findPath(grid, { x: 6, y: 2 }, { x: 6, y: 4 });
    expect(path?.length).toBeGreaterThan(2);
    expect(path?.every((p) => grid.isWalkable(p))).toBe(true);
  });

  it('reports the elevator as blocked', () => {
    expect(grid.blockReason({ x: 29, y: 5 })).toBe('elevator');
  });
});

describe('resolveWalkTarget', () => {
  it('picks a walkable neighbor next to a blocked tile', () => {
    const grid = createAreaGrid('hall');
    const target = resolveWalkTarget(grid, { x: 6, y: 6 }, { x: 6, y: 3 });
    expect(target).toEqual({ x: 6, y: 4 });
  });
});
