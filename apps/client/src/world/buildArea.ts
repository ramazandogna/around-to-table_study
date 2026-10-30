import { TILE, type AreaGrid, type AreaId, type Point, type RenovationZone } from '@att/shared';
import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  Shape,
  SRGBColorSpace,
} from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { t } from '../i18n/t';
import { buildDoors, WALL_HEIGHT, type Person } from './doors';
import { facing, instance, type Placement } from './instancing';
import type { Furniture, ModelTemplate } from './models';

/** Top of the floor tiles; furniture stands on this. */
export const FLOOR_Y = 0.05;

type AreaStyle = { floor: number; slab: number; wall: number; carpet: [number, number] };

const AREA_STYLE: Record<AreaId, AreaStyle> = {
  hall: { floor: 0xd8cfc0, slab: 0x5b4a3d, wall: 0xf1e6d2, carpet: [0xb2473a, 0x8a3329] },
  library: { floor: 0xa9774c, slab: 0x4a3426, wall: 0xe9dcc4, carpet: [0x4f7a5c, 0x3b5e46] },
  smoking: { floor: 0x8c5b3a, slab: 0x3b2a1e, wall: 0xd9c9ad, carpet: [0x6c5a86, 0x54456b] },
};

const WOOD = 0xd4a76c;
const RUNNER = 0xc8603e;
const DOORS: ReadonlySet<string> = new Set([
  TILE.doorToHall,
  TILE.doorToLibrary,
  TILE.doorToSmoking,
  TILE.entrance,
]);

/** Chairs are pushed this far from the tile center, so their front edge meets the table. */
export const CHAIR_INSET = 0.2;
/** Kenney's chair is tall next to its characters; a lower seat lets their feet reach the floor. */
const CHAIR_SQUASH = 0.75;
/** Top of the chair seat cushion above the floor (the model's seat is at 0.48). */
export const SEAT_HEIGHT = 0.48 * CHAIR_SQUASH;
/** Table top surface; seated forearms rest on it. */
export const TABLE_HEIGHT = 0.62;
const TABLE_DEPTH = 1.2;

const tileCenter = (x: number, y: number) => ({ x: x + 0.5, z: y + 0.5 });

/** Small deterministic noise so decoration varies per tile but never between reloads. */
const noise = (x: number, y: number, salt = 0) => {
  const n = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return n - Math.floor(n);
};

export type BuiltArea = {
  root: Group;
  /** Animates the room, e.g. doors opening for the people near them. */
  update: (delta: number, people: readonly Person[]) => void;
  dispose: () => void;
};

/** Builds the 3D room for an area from its ASCII layout and the Kenney furniture. */
export function buildArea(grid: AreaGrid, furniture: Furniture): BuiltArea {
  const root = new Group();
  const style = AREA_STYLE[grid.area.id];
  const at = (x: number, y: number) => grid.tileAt({ x, y });
  const { width: W, height: H } = grid;
  const add = (name: keyof Furniture, placements: Placement[], material?: MeshStandardMaterial) =>
    root.add(instance(furniture[name], placements, material ? { material } : {}));

  const floorMaterial = new MeshStandardMaterial({ color: style.floor, roughness: 0.9 });
  const wallMaterial = new MeshStandardMaterial({ color: style.wall, roughness: 0.95 });
  const carpet = new MeshStandardMaterial({ color: style.carpet[0], roughness: 1 });
  const carpetBorder = new MeshStandardMaterial({ color: style.carpet[1], roughness: 1 });
  const materials = [floorMaterial, wallMaterial, carpet, carpetBorder];

  // Floor tiles inside the walls plus door openings, on a dark slab for a diorama edge.
  const floor: Placement[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const inside = x > 0 && y > 0 && x < W - 1 && y < H - 1;
      if (inside || DOORS.has(at(x, y))) floor.push(tileCenter(x, y));
    }
  }
  // The floor model covers two tiles; halving it keeps the 0.05 thickness that FLOOR_Y assumes.
  const floorTiles = floor.map((p) => ({ ...p, scale: [0.5, 0.5, 0.5] as const }));
  root.add(
    instance(furniture.floorFull, floorTiles, { material: floorMaterial, castShadow: false }),
  );
  const slab = new Mesh(
    new BoxGeometry(W - 2, 0.3, H - 2),
    new MeshStandardMaterial({ color: style.slab, roughness: 1 }),
  );
  slab.position.set(W / 2, -0.15, H / 2);
  slab.receiveShadow = true;
  root.add(slab);

  const rugs = grid.area.rugs.map((rug) => ({
    x: rug.x + rug.w / 2,
    z: rug.y + rug.h / 2,
    y: FLOOR_Y,
    scale: [
      (rug.w - 0.2) / furniture.rugRectangle.size.x,
      1,
      (rug.h - 0.2) / furniture.rugRectangle.size.z,
    ] as const,
  }));
  root.add(
    instance(furniture.rugRectangle, rugs, {
      castShadow: false,
      materialsByName: { carpet, carpetDarker: carpetBorder },
    }),
  );

  buildWalls(grid, furniture, root, wallMaterial);
  const doors = buildDoors(grid, root, {
    floorY: FLOOR_Y,
    wallThickness: furniture.wall.size.z,
    plaster: wallMaterial,
    beyond: (area) => AREA_STYLE[area].floor,
  });
  materials.push(...doors.materials);

  const seats: Placement[] = [];
  const plants: Placement[] = [];
  const desks: Placement[] = [];
  const sofas: Placement[] = [];
  const sideTables: Placement[] = [];
  const bookcases: Placement[] = [];
  const books: Placement[] = [];
  const boards: Point[] = [];

  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const c = at(x, y);
      const { x: cx, z: cz } = tileCenter(x, y);
      switch (c) {
        case TILE.seat: {
          const toTable = grid.seatFacing({ x, y }) ?? { x: 0, y: 1 };
          seats.push({
            x: cx + toTable.x * CHAIR_INSET,
            z: cz + toTable.y * CHAIR_INSET,
            y: FLOOR_Y,
            // The Kenney chair's backrest is on +z, so it faces -z like the bookcase.
            rotation: facing(toTable.x, toTable.y) + Math.PI,
            scale: [1, CHAIR_SQUASH, 1],
          });
          break;
        }
        case TILE.plant:
          plants.push({ x: cx, z: cz, y: FLOOR_Y, rotation: noise(x, y) * Math.PI * 2 });
          break;
        case TILE.receptionDesk: {
          // The desk faces the middle of the room, across its run of tiles.
          const upright = at(x, y - 1) === c || at(x, y + 1) === c;
          const toRoom = (v: number, size: number) => (v < size / 2 ? 1 : -1);
          desks.push({
            x: cx,
            z: cz,
            y: FLOOR_Y,
            rotation: upright ? facing(toRoom(x, W), 0) : facing(0, toRoom(y, H)),
            scale: [1 / furniture.desk.size.x, 1, 1],
          });
          break;
        }
        case TILE.bench: {
          // A sofa covers two bench tiles; it faces the middle of the room and opens towards -z.
          let runStart = x;
          while (at(runStart - 1, y) === TILE.bench) runStart--;
          if ((x - runStart) % 2 === 1) break;
          const pair = at(x + 1, y) === TILE.bench;
          const dz = y < H / 2 ? 1 : -1;
          sofas.push({
            x: pair ? x + 1 : cx,
            z: cz,
            y: FLOOR_Y,
            rotation: facing(0, dz) + Math.PI,
            ...(pair ? {} : { scale: [0.5, 1, 1] as const }),
          });
          break;
        }
        case TILE.noticeBoard:
          boards.push({ x, y });
          break;
        case TILE.ashtray:
          sideTables.push({ x: cx, z: cz, y: FLOOR_Y, scale: [0.45, 1, 0.45] });
          break;
        case TILE.bookcase: {
          const [dx, dz] = awayFromWall(x, y, W, H);
          const depth = furniture.bookcaseClosedWide.size.z;
          const back = 0.5 - depth / 2 - 0.02;
          // Unlike chairs, the Kenney bookcase opens towards -z.
          const rotation = facing(dx, dz) + Math.PI;
          const bx = cx - dx * back;
          const bz = cz - dz * back;
          bookcases.push({
            x: bx,
            z: bz,
            y: FLOOR_Y,
            rotation,
            scale: [0.96 / furniture.bookcaseClosedWide.size.x, 1, 1],
          });
          books.push(
            ...fillShelves(furniture.bookcaseClosedWide.size.y, { bx, bz, dx, dz, rotation }, x, y),
          );
          break;
        }
      }
    }
  }
  add('chairCushion', seats);
  add('pottedPlant', plants);
  add('desk', desks);
  add('loungeSofa', sofas);
  add('tableRound', sideTables);
  add('bookcaseClosedWide', bookcases);
  add('books', books);

  const tables = buildTables(grid, furniture, root);
  materials.push(...tables);
  decorate(grid, furniture, root, desks);
  materials.push(...buildNoticeBoards(boards, root));
  for (const zone of grid.area.renovation) {
    if (grid.userCount < zone.unlockAtUsers)
      materials.push(...buildRenovation(zone, furniture, root));
  }
  addDoorSigns(grid, root);

  return {
    root,
    update: doors.update,
    dispose: () => {
      root.traverse((child) => {
        if (child instanceof CSS2DObject) child.element.remove();
      });
      root.clear();
      for (const material of materials) material.dispose();
    },
  };
}

/** Only the back walls (north and west) are built, so the camera can look into the room. */
function buildWalls(
  grid: AreaGrid,
  furniture: Furniture,
  root: Group,
  material: MeshStandardMaterial,
): void {
  const { width: W, height: H } = grid;
  const at = (x: number, y: number) => grid.tileAt({ x, y });
  const thickness = furniture.wall.size.z;
  const plain: Placement[] = [];
  const windows: Placement[] = [];
  // Sliding doors disappear into the wall next to them, so no windows there.
  const nearDoor = (x: number, y: number) =>
    [-2, -1, 1, 2].some((d) => DOORS.has(at(x + d, y)) || DOORS.has(at(x, y + d)));
  const wantsWindow = (i: number, x: number, y: number) =>
    i % 3 === 2 &&
    at(x + (y === 0 ? 0 : 1), y + (y === 0 ? 1 : 0)) !== TILE.bookcase &&
    !nearDoor(x, y);

  // Door tiles get no wall piece; buildDoors fills the opening.
  for (let x = 1; x < W - 1; x++) {
    // Kenney walls show their plaster side towards +z when rotated half a turn.
    const placement = { x: x + 0.5, z: 1 - thickness / 2, rotation: Math.PI };
    if (DOORS.has(at(x, 0))) continue;
    (wantsWindow(x, x, 0) ? windows : plain).push(placement);
  }
  for (let y = 1; y < H - 1; y++) {
    const placement = { x: 1 - thickness / 2, z: y + 0.5, rotation: -Math.PI / 2 };
    if (DOORS.has(at(0, y))) continue;
    (wantsWindow(y, 0, y) ? windows : plain).push(placement);
  }
  const plaster = { materialsByName: { _defaultMat: material } };
  // Wall pieces are two tiles wide; each tile gets a half-width piece.
  const perTile = (model: ModelTemplate, placements: Placement[]) =>
    instance(
      model,
      placements.map((p) => ({ ...p, scale: [1 / model.size.x, 1, 1] as const })),
      plaster,
    );
  root.add(perTile(furniture.wall, plain));
  root.add(perTile(furniture.wallWindow, windows));

  const elevator: Placement[] = [];
  for (let y = 1; y < H - 1; y++) {
    if (at(W - 1, y) === TILE.elevator) {
      elevator.push({ x: W - 1 - 0.05, z: y + 0.5, rotation: -Math.PI / 2 });
    }
  }
  root.add(instance(furniture.doorway, elevator));
}

function awayFromWall(x: number, y: number, W: number, H: number): [number, number] {
  if (y === 1) return [0, 1];
  if (x === 1) return [1, 0];
  if (x === W - 2) return [-1, 0];
  if (y === H - 2) return [0, -1];
  return [0, 1];
}

/** Shelf heights in the Kenney bookcase, as fractions of its height. */
const SHELF_LEVELS = [0.089, 0.392, 0.696];
const SHELF_SLOTS = [-0.3, 0, 0.3];

type Shelf = { bx: number; bz: number; dx: number; dz: number; rotation: number };

function fillShelves(
  height: number,
  { bx, bz, dx, dz, rotation }: Shelf,
  tx: number,
  ty: number,
): Placement[] {
  // Local x runs along the shelf; turn it into world space with the bookcase's facing.
  const sideX = -dz;
  const sideZ = dx;
  const placements: Placement[] = [];
  SHELF_LEVELS.forEach((level, shelf) => {
    SHELF_SLOTS.forEach((slot, i) => {
      if (noise(tx, ty, shelf * 4 + i) < 0.15) return;
      const along = slot + (noise(tx, ty, i + 9) - 0.5) * 0.04;
      placements.push({
        x: bx + sideX * along,
        z: bz + sideZ * along,
        y: FLOOR_Y + level * height,
        rotation: rotation + (noise(tx, ty, shelf) < 0.5 ? 0 : Math.PI),
        scale: [1, 1.3, 1],
      });
    });
  });
  return placements;
}

/** Long tables are runs of table tiles, built as one stadium-shaped top with a runner. */
function buildTables(grid: AreaGrid, furniture: Furniture, root: Group): MeshStandardMaterial[] {
  const wood = new MeshStandardMaterial({ color: WOOD, roughness: 0.7 });
  const runner = new MeshStandardMaterial({ color: RUNNER, roughness: 0.95 });
  const lamps: Placement[] = [];

  grid.area.layout.forEach((row, y) => {
    for (const match of row.matchAll(/T+/g)) {
      const start = match.index;
      const length = match[0].length;
      const centerX = start + length / 2;
      const z = y + 0.5;
      const height = TABLE_HEIGHT - 0.05;

      // The round ends reach past the last side seats, so every chair faces a straight edge.
      const top = stadium(length + 0.3, TABLE_DEPTH, 0.05);
      top.position.set(centerX, FLOOR_Y + height, z);
      const cloth = stadium(length - 0.5, 0.4, 0.01);
      cloth.material = runner;
      cloth.position.set(centerX, FLOOR_Y + TABLE_HEIGHT, z);
      top.material = wood;
      for (const mesh of [top, cloth]) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        root.add(mesh);
      }

      // Pedestals run down the middle so seated knees fit under the top.
      for (let lx = start + 1; lx < start + length; lx += 3) {
        const leg = new Mesh(new CylinderGeometry(0.07, 0.11, height, 10), wood);
        leg.position.set(lx, FLOOR_Y + height / 2, z);
        leg.castShadow = true;
        root.add(leg);
      }

      // Only lamps belong to the table; people bring their own things when they sit.
      for (let i = 2; i < length; i += 4) {
        lamps.push({ x: start + i + 0.5, z, y: FLOOR_Y + TABLE_HEIGHT, scale: [0.7, 0.7, 0.7] });
      }
    }
  });
  root.add(instance(furniture.lampRoundTable, lamps));
  return [wood, runner];
}

/** A flat stadium (rectangle with round ends) lying on the floor plane, centered on the origin. */
function stadium(length: number, width: number, thickness: number): Mesh {
  const r = width / 2;
  const half = Math.max(0, length / 2 - r);
  const shape = new Shape();
  shape.moveTo(-half, -r);
  shape.lineTo(half, -r);
  shape.absarc(half, 0, r, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(-half, r);
  shape.absarc(-half, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false);
  const geometry = new ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 16,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, thickness, 0);
  return new Mesh(geometry);
}

function decorate(grid: AreaGrid, furniture: Furniture, root: Group, desks: Placement[]): void {
  const middle = desks[Math.floor(desks.length / 2)];
  if (middle) {
    const top = FLOOR_Y + furniture.desk.size.y;
    const rotation = middle.rotation ?? 0;
    // The laptop faces the receptionist behind the desk; the lamp sits one tile along it.
    root.add(
      instance(furniture.laptop, [
        {
          x: middle.x,
          z: middle.z,
          y: top,
          rotation: rotation + Math.PI,
          scale: [0.75, 0.75, 0.75],
        },
      ]),
    );
    root.add(
      instance(furniture.lampRoundTable, [
        {
          x: middle.x - Math.cos(rotation),
          z: middle.z + Math.sin(rotation),
          y: top,
          scale: [0.7, 0.7, 0.7],
        },
      ]),
    );
  }
  // Floor lamps next to plants give rooms some warm vertical accents.
  const lamps: Placement[] = [];
  grid.area.layout.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c !== TILE.plant) return;
      const side = x < grid.width / 2 ? 1 : -1;
      const p: Point = { x: x + side, y };
      if (grid.tileAt(p) === TILE.floor) lamps.push({ x: p.x + 0.5, z: y + 0.5, y: FLOOR_Y });
    }),
  );
  root.add(instance(furniture.lampSquareFloor, lamps));
  if (grid.area.id === 'hall') {
    root.add(instance(furniture.coatRackStanding, [{ x: 1.5, z: 7.5, y: FLOOR_Y }]));
  }
}

const TAPE_TEXTURE = (() => {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 8;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#1d1d1d' : '#f2c230';
      ctx.beginPath();
      ctx.moveTo(i * 8, 8);
      ctx.lineTo(i * 8 + 8, 0);
      ctx.lineTo(i * 8 + 16, 0);
      ctx.lineTo(i * 8 + 8, 8);
      ctx.fill();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  return texture;
})();

/** Darkened, taped-off part of the room with boxes and a sign. */
function buildRenovation(
  zone: RenovationZone,
  furniture: Furniture,
  root: Group,
): MeshStandardMaterial[] {
  const shade = new MeshStandardMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  // Tall enough to dim the bookcases, low enough not to read as a wall.
  const volume = new Mesh(new BoxGeometry(zone.w, 1.7, zone.h), shade);
  volume.position.set(zone.x + zone.w / 2, 0.85, zone.y + zone.h / 2);
  volume.renderOrder = 1;
  root.add(volume);

  const tapeMaterial = new MeshStandardMaterial({ map: TAPE_TEXTURE.clone(), roughness: 0.6 });
  tapeMaterial.map?.repeat.set(zone.h * 2, 1);
  const tape = new Mesh(new BoxGeometry(0.02, 0.1, zone.h), tapeMaterial);
  tape.position.set(zone.x, FLOOR_Y + 0.9, zone.y + zone.h / 2);
  tape.castShadow = true;
  root.add(tape);

  const post = new MeshStandardMaterial({ color: 0xf2c230, roughness: 0.6 });
  for (let z = zone.y; z <= zone.y + zone.h; z += 2) {
    const pole = new Mesh(new CylinderGeometry(0.04, 0.07, 0.95, 8), post);
    pole.position.set(zone.x, FLOOR_Y + 0.475, z);
    pole.castShadow = true;
    root.add(pole);
  }

  const boxes: Placement[] = [];
  const open: Placement[] = [];
  for (let i = 0; i < 10; i++) {
    const x = zone.x + 1 + noise(i, 1) * (zone.w - 2);
    const z = zone.y + 0.5 + noise(i, 2) * (zone.h - 1);
    (i % 3 ? boxes : open).push({ x, z, y: FLOOR_Y, rotation: noise(i, 3) * Math.PI });
  }
  root.add(instance(furniture.cardboardBoxClosed, boxes));
  root.add(instance(furniture.cardboardBoxOpen, open));

  root.add(
    sign(
      t('sign.renovation'),
      'world-sign world-sign--warning',
      zone.x + 1.2,
      2.1,
      zone.y + zone.h / 2,
    ),
  );
  return [shade, tapeMaterial, post];
}

const CORK_TEXTURE = (() => {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g) {
    g.fillStyle = '#B98A55';
    g.fillRect(0, 0, 128, 128);
    // Pinned notes: the rules sheet is the big one, events are the small colored cards.
    const notes: [number, number, number, number, string][] = [
      [10, 10, 52, 66, '#F6F0E2'],
      [70, 12, 46, 30, '#F2D27A'],
      [72, 50, 44, 28, '#A9CBE3'],
      [14, 84, 42, 32, '#F3B5A4'],
      [66, 88, 50, 28, '#F6F0E2'],
    ];
    for (const [x, y, w, h, color] of notes) {
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(x + 2, y + 2, w, h);
      g.fillStyle = color;
      g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(60,45,35,0.45)';
      for (let line = y + 9; line < y + h - 4; line += 7) g.fillRect(x + 5, line, w - 10, 2);
      g.fillStyle = '#C8403A';
      g.beginPath();
      g.arc(x + w / 2, y + 4, 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
})();

/** A standing cork board on two legs, facing +x towards the path people walk in on. */
function buildNoticeBoards(boards: Point[], root: Group): MeshStandardMaterial[] {
  if (boards.length === 0) return [];
  const wood = new MeshStandardMaterial({ color: 0x6e4a2f, roughness: 0.8 });
  const cork = new MeshStandardMaterial({ map: CORK_TEXTURE, roughness: 0.95 });
  for (const { x, y } of boards) {
    const { x: cx, z: cz } = tileCenter(x, y);
    const board = new Group();
    board.position.set(cx, FLOOR_Y, cz);
    for (const side of [-0.42, 0.42]) {
      const leg = new Mesh(new BoxGeometry(0.07, 1.5, 0.07), wood);
      leg.position.set(0, 0.75, side);
      leg.castShadow = true;
      board.add(leg);
    }
    const frame = new Mesh(new BoxGeometry(0.07, 0.82, 0.96), wood);
    frame.position.set(0, 1.05, 0);
    frame.castShadow = true;
    // Only the front face (+x) shows the cork and its notes.
    const face = new Mesh(new BoxGeometry(0.02, 0.72, 0.86), [cork, wood, wood, wood, wood, wood]);
    face.position.set(0.04, 1.05, 0);
    board.add(frame, face);
    board.add(sign(t('sign.board'), 'world-sign world-sign--board', 0, 1.75, 0));
    root.add(board);
  }
  return [wood, cork];
}

/** One sign over the middle of each door run, the street entrance and the elevator. */
function addDoorSigns(grid: AreaGrid, root: Group): void {
  const runs = new Map<string, Point[]>();
  grid.area.layout.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (!grid.doorTarget({ x, y }) && c !== TILE.elevator && c !== TILE.entrance) return;
      runs.set(c, [...(runs.get(c) ?? []), { x, y }]);
    }),
  );
  for (const [c, tiles] of runs) {
    const to = grid.doorTarget(tiles[0] ?? { x: 0, y: 0 });
    const label =
      c === TILE.elevator
        ? t('sign.elevator')
        : c === TILE.entrance
          ? t('sign.entrance')
          : t(`area.${to ?? 'hall'}`);
    const x = tiles.reduce((sum, p) => sum + p.x, 0) / tiles.length + 0.5;
    const y = tiles.reduce((sum, p) => sum + p.y, 0) / tiles.length + 0.5;
    root.add(
      sign(
        label,
        'world-sign world-sign--door',
        x + (x < 1 ? 0.5 : 0),
        WALL_HEIGHT - 0.1,
        y + (y < 1 ? 0.5 : 0),
      ),
    );
  }
}

function sign(text: string, className: string, x: number, y: number, z: number): CSS2DObject {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = text;
  const label = new CSS2DObject(element);
  label.position.set(x, y, z);
  return label;
}
