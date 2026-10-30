import type { AreaGrid, AreaId } from '@att/shared';
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  type Material,
} from 'three';

/** Kenney wall pieces are this tall at one meter per tile. */
export const WALL_HEIGHT = 2.58;
const GLASS_DOOR_HEIGHT = 2.3;
const WOOD_DOOR_HEIGHT = 2.05;
const FRAME = 0.1;
/** Doors open when someone is this close to their middle. */
const OPEN_DISTANCE = 1.7;
const OPEN_EASE = 7;
/** How far a hinged door swings open (radians). */
const SWING = 1.35;

type Side = 'north' | 'west' | 'south' | 'east';
type DoorRun = { char: string; side: Side; start: number; length: number };

/** Turns a door's local frame (x along the wall, z into the room) into the world. */
const SIDE_ROTATION: Record<Side, number> = {
  north: 0,
  west: Math.PI / 2,
  south: Math.PI,
  east: -Math.PI / 2,
};

export type Person = { x: number; z: number };

type Door = { x: number; z: number; open: number; apply: (open: number) => void };

export type BuiltDoors = {
  update: (delta: number, people: readonly Person[]) => void;
  materials: MeshStandardMaterial[];
};

/**
 * Real doors for every door run in the layout: the library gets wide sliding
 * glass doors, other rooms a wooden door that swings open. Doors in the back
 * walls are complete; the front walls are not drawn, so their doors keep only
 * the frame and doormat to leave the room visible.
 */
export function buildDoors(
  grid: AreaGrid,
  root: Group,
  {
    floorY,
    wallThickness,
    plaster,
    beyond,
  }: {
    floorY: number;
    wallThickness: number;
    plaster: Material;
    /** Floor color of the room behind a door, glimpsed through it when it opens. */
    beyond: (area: AreaId) => number;
  },
): BuiltDoors {
  const isGlass = (char: string) =>
    grid.area.id === 'library' || grid.doorTarget(firstTile(grid, char)) === 'library';
  const frameWood = new MeshStandardMaterial({ color: 0x4a2f1f, roughness: 0.6 });
  const brass = new MeshStandardMaterial({ color: 0xd4a64a, roughness: 0.35, metalness: 0.6 });
  const glass = new MeshStandardMaterial({
    color: 0xbfe6f2,
    roughness: 0.05,
    metalness: 0.2,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  const doorWood = new MeshStandardMaterial({ color: 0x9a5f34, roughness: 0.7 });
  const doorInset = new MeshStandardMaterial({ color: 0x7c4826, roughness: 0.75 });
  const mat = new MeshStandardMaterial({ color: 0x3d4f3f, roughness: 1 });
  const materials = [frameWood, brass, glass, doorWood, doorInset, mat];
  const box = (w: number, h: number, d: number, material: Material, shadow = true) => {
    const mesh = new Mesh(new BoxGeometry(w, h, d), material);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    return mesh;
  };

  const doors: Door[] = [];
  for (const run of doorRuns(grid)) {
    const glassDoor = isGlass(run.char);
    const width = run.length;
    const height = glassDoor ? GLASS_DOOR_HEIGHT : WOOD_DOOR_HEIGHT;
    const back = run.side === 'north' || run.side === 'west';
    const door = new Group();
    door.rotation.y = SIDE_ROTATION[run.side];
    const middle = run.start + width / 2;
    const plane = {
      north: 1 - wallThickness / 2,
      west: 1 - wallThickness / 2,
      south: grid.height - 1,
      east: grid.width - 1,
    }[run.side];
    const along = run.side === 'north' || run.side === 'south';
    door.position.set(along ? middle : plane, floorY, along ? plane : middle);
    root.add(door);

    // Frame: two posts and a header; the wall continues above it.
    const depth = wallThickness + 0.06;
    for (const sign of [-1, 1]) {
      const post = box(FRAME, height, depth, frameWood);
      post.position.set(sign * (width / 2 - FRAME / 2), height / 2, 0);
      door.add(post);
    }
    const header = box(width, FRAME * 1.2, depth, frameWood);
    header.position.set(0, height - FRAME * 0.6, 0);
    door.add(header);
    if (back) {
      const lintel = box(width, WALL_HEIGHT - height, wallThickness, plaster);
      lintel.position.set(0, height + (WALL_HEIGHT - height) / 2, 0);
      door.add(lintel);
    }

    const mat3d = box(Math.min(width - 0.2, 2.6), 0.015, 0.55, mat, false);
    mat3d.position.set(0, 0.0075, (back ? wallThickness / 2 : 0) + 0.4);
    door.add(mat3d);

    if (!back) continue;
    const to = grid.doorTarget(firstTile(grid, run.char));
    if (to) {
      // A strip of the next room's floor, so an open door shows somewhere to go.
      const outside = new MeshStandardMaterial({ color: beyond(to), roughness: 0.9 });
      materials.push(outside);
      const floor = box(width, 0.05, 1.2, outside, false);
      floor.position.set(0, -0.025, -wallThickness / 2 - 0.6);
      door.add(floor);
    }
    const clear = width - FRAME * 2;
    const leafHeight = height - FRAME * 1.2;
    const apply = glassDoor
      ? slidingLeaves(door, clear, leafHeight, { glass, frameWood, brass }, box)
      : swingingLeaf(door, clear, leafHeight, { doorWood, doorInset, brass }, box);
    const center = door.position;
    const inward = { north: [0, 1], west: [1, 0], south: [0, -1], east: [-1, 0] }[run.side];
    doors.push({
      // Measured from just inside the room, so people walking along the wall do not open it.
      x: center.x + (inward[0] ?? 0) * 0.5,
      z: center.z + (inward[1] ?? 0) * 0.5,
      open: 0,
      apply,
    });
  }

  return {
    materials,
    update: (delta, people) => {
      const ease = 1 - Math.exp(-OPEN_EASE * delta);
      for (const door of doors) {
        const near = people.some((p) => Math.hypot(p.x - door.x, p.z - door.z) < OPEN_DISTANCE);
        const open = door.open + ((near ? 1 : 0) - door.open) * ease;
        if (Math.abs(open - door.open) < 1e-4) continue;
        door.open = open;
        door.apply(open);
      }
    },
  };
}

type Box = (w: number, h: number, d: number, material: Material, shadow?: boolean) => Mesh;

/** Two glass leaves that slide apart into the wall. */
function slidingLeaves(
  door: Group,
  clear: number,
  height: number,
  m: { glass: Material; frameWood: Material; brass: Material },
  box: Box,
): (open: number) => void {
  const width = clear / 2;
  const leaves = [-1, 1].map((sign) => {
    const leaf = new Group();
    const pane = box(width - 0.08, height - 0.1, 0.02, m.glass, false);
    pane.position.y = height / 2;
    leaf.add(pane);
    const rails: [number, number, number, number][] = [
      [width, 0.06, 0, 0.03],
      [width, 0.08, 0, height - 0.04],
      [0.05, height, -width / 2 + 0.025, height / 2],
      [0.05, height, width / 2 - 0.025, height / 2],
    ];
    for (const [w, h, x, y] of rails) {
      const rail = box(w, h, 0.04, m.frameWood);
      rail.position.set(x, y, 0);
      leaf.add(rail);
    }
    // A long brass pull on both faces, next to where the leaves meet.
    for (const face of [-1, 1]) {
      const pull = box(0.025, 0.7, 0.02, m.brass);
      pull.position.set(-sign * (width / 2 - 0.12), height * 0.48, face * 0.032);
      leaf.add(pull);
    }
    leaf.position.set((sign * width) / 2, 0, -0.01);
    door.add(leaf);
    return { leaf, sign };
  });
  return (open) => {
    for (const { leaf, sign } of leaves) leaf.position.x = sign * (width / 2 + open * width * 0.92);
  };
}

/** One wooden door with raised panels, hinged on its left and swinging into the room. */
function swingingLeaf(
  door: Group,
  clear: number,
  height: number,
  m: { doorWood: Material; doorInset: Material; brass: Material },
  box: Box,
): (open: number) => void {
  const hinge = new Group();
  hinge.position.set(-clear / 2, 0, 0);
  door.add(hinge);
  const slab = box(clear, height, 0.05, m.doorWood);
  slab.position.set(clear / 2, height / 2, 0);
  hinge.add(slab);
  for (const face of [-1, 1]) {
    for (const [y, h] of [
      [height * 0.72, height * 0.36],
      [height * 0.28, height * 0.4],
    ] as const) {
      const inset = box(clear - 0.24, h - 0.14, 0.012, m.doorInset);
      inset.position.set(clear / 2, y, face * 0.03);
      hinge.add(inset);
    }
    const knob = new Mesh(new SphereGeometry(0.035, 12, 8), m.brass);
    knob.castShadow = true;
    knob.position.set(clear - 0.1, height * 0.48, face * 0.06);
    hinge.add(knob);
  }
  return (open) => {
    hinge.rotation.y = -open * SWING;
  };
}

function firstTile(grid: AreaGrid, char: string): { x: number; y: number } {
  for (let y = 0; y < grid.height; y++) {
    const x = grid.area.layout[y]?.indexOf(char) ?? -1;
    if (x >= 0) return { x, y };
  }
  return { x: 0, y: 0 };
}

/** Each door character forms one straight run of tiles in an outer wall. */
function doorRuns(grid: AreaGrid): DoorRun[] {
  const runs: DoorRun[] = [];
  for (const char of Object.keys(grid.area.doors)) {
    const tiles: { x: number; y: number }[] = [];
    grid.area.layout.forEach((row, y) =>
      [...row].forEach((c, x) => c === char && tiles.push({ x, y })),
    );
    const first = tiles[0];
    if (!first) continue;
    const side: Side =
      first.y === 0
        ? 'north'
        : first.x === 0
          ? 'west'
          : first.y === grid.height - 1
            ? 'south'
            : 'east';
    const along = side === 'north' || side === 'south';
    runs.push({ char, side, start: along ? first.x : first.y, length: tiles.length });
  }
  return runs;
}
