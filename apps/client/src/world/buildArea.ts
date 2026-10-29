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
import { facing, instance, type Placement } from './instancing';
import type { Furniture } from './models';

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
]);

const tileCenter = (x: number, y: number) => ({ x: x + 0.5, z: y + 0.5 });

/** Small deterministic noise so decoration varies per tile but never between reloads. */
const noise = (x: number, y: number, salt = 0) => {
  const n = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return n - Math.floor(n);
};

export type BuiltArea = { root: Group; dispose: () => void };

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
  root.add(instance(furniture.floorFull, floor, { material: floorMaterial, castShadow: false }));
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

  const seats: Placement[] = [];
  const plants: Placement[] = [];
  const desks: Placement[] = [];
  const sofas: Placement[] = [];
  const sideTables: Placement[] = [];
  const bookcases: Placement[] = [];
  const books: Placement[] = [];

  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const c = at(x, y);
      const { x: cx, z: cz } = tileCenter(x, y);
      switch (c) {
        case TILE.seat: {
          const [dx, dz] = tableDirection(at, x, y);
          seats.push({
            x: cx + dx * 0.12,
            z: cz + dz * 0.12,
            y: FLOOR_Y,
            rotation: facing(dx, dz),
          });
          break;
        }
        case TILE.plant:
          plants.push({ x: cx, z: cz, y: FLOOR_Y, rotation: noise(x, y) * Math.PI * 2 });
          break;
        case TILE.receptionDesk:
          desks.push({
            x: cx,
            z: cz,
            y: FLOOR_Y,
            rotation: facing(0, 1),
            scale: [1 / furniture.desk.size.x, 1, 1],
          });
          break;
        case TILE.bench: {
          // Sofas face the middle of the room; like bookcases, they open towards -z.
          const dz = y < H / 2 ? 1 : -1;
          sofas.push({ x: cx, z: cz, y: FLOOR_Y, rotation: facing(0, dz) + Math.PI });
          break;
        }
        case TILE.ashtray:
          sideTables.push({ x: cx, z: cz, y: FLOOR_Y, scale: [0.7, 1, 0.7] });
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
          books.push(...fillShelves(bx, bz, dx, dz, rotation, x, y));
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
  for (const zone of grid.area.renovation) {
    if (grid.userCount < zone.unlockAtUsers)
      materials.push(...buildRenovation(zone, furniture, root));
  }
  addDoorSigns(grid, root);

  return {
    root,
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
  const doorways: Placement[] = [];

  for (let x = 1; x < W - 1; x++) {
    // Kenney walls show their plaster side towards +z when rotated half a turn.
    const placement = { x: x + 0.5, z: 1 - thickness / 2, rotation: Math.PI };
    if (DOORS.has(at(x, 0))) doorways.push(placement);
    else if (x % 3 === 2 && at(x, 1) !== TILE.bookcase) windows.push(placement);
    else plain.push(placement);
  }
  for (let y = 1; y < H - 1; y++) {
    const placement = { x: 1 - thickness / 2, z: y + 0.5, rotation: -Math.PI / 2 };
    if (DOORS.has(at(0, y))) doorways.push(placement);
    else if (y % 3 === 2 && at(1, y) !== TILE.bookcase) windows.push(placement);
    else plain.push(placement);
  }
  const plaster = { materialsByName: { _defaultMat: material } };
  root.add(instance(furniture.wall, plain, plaster));
  root.add(instance(furniture.wallWindow, windows, plaster));
  root.add(instance(furniture.wallDoorway, doorways, plaster));

  // Doors in the (hidden) front walls get a free-standing frame so people can see them.
  const frames: Placement[] = [];
  const elevator: Placement[] = [];
  for (let x = 1; x < W - 1; x++) {
    if (DOORS.has(at(x, H - 1))) frames.push({ x: x + 0.5, z: H - 1, rotation: 0 });
  }
  for (let y = 1; y < H - 1; y++) {
    const c = at(W - 1, y);
    if (DOORS.has(c)) frames.push({ x: W - 1, z: y + 0.5, rotation: Math.PI / 2 });
    if (c === TILE.elevator) elevator.push({ x: W - 1 - 0.05, z: y + 0.5, rotation: -Math.PI / 2 });
  }
  root.add(instance(furniture.doorwayOpen, frames));
  root.add(instance(furniture.doorway, elevator));
}

/** Direction from a seat to the table it belongs to. */
function tableDirection(
  at: (x: number, y: number) => string,
  x: number,
  y: number,
): [number, number] {
  if (at(x, y + 1) === TILE.table) return [0, 1];
  if (at(x, y - 1) === TILE.table) return [0, -1];
  if (at(x + 1, y) === TILE.table) return [1, 0];
  if (at(x - 1, y) === TILE.table) return [-1, 0];
  return [0, 1];
}

function awayFromWall(x: number, y: number, W: number, H: number): [number, number] {
  if (y === 1) return [0, 1];
  if (x === 1) return [1, 0];
  if (x === W - 2) return [-1, 0];
  if (y === H - 2) return [0, -1];
  return [0, 1];
}

/** Shelf heights in the Kenney bookcase, measured from the model. */
const SHELF_HEIGHTS = [0.07, 0.31, 0.55];

function fillShelves(
  bx: number,
  bz: number,
  dx: number,
  dz: number,
  rotation: number,
  tx: number,
  ty: number,
): Placement[] {
  // Local x runs along the shelf; turn it into world space with the bookcase's facing.
  const sideX = -dz;
  const sideZ = dx;
  const placements: Placement[] = [];
  SHELF_HEIGHTS.forEach((height, shelf) => {
    for (let slot = 0; slot < 4; slot++) {
      if (noise(tx, ty, shelf * 4 + slot) < 0.18) continue;
      const along = -0.33 + slot * 0.22 + (noise(tx, ty, slot + 9) - 0.5) * 0.04;
      placements.push({
        x: bx + sideX * along,
        z: bz + sideZ * along,
        y: FLOOR_Y + height,
        rotation: rotation + (noise(tx, ty, shelf) < 0.5 ? 0 : Math.PI),
      });
    }
  });
  return placements;
}

/** Long tables are runs of table tiles, built as one stadium-shaped top with a runner. */
function buildTables(grid: AreaGrid, furniture: Furniture, root: Group): MeshStandardMaterial[] {
  const wood = new MeshStandardMaterial({ color: WOOD, roughness: 0.7 });
  const runner = new MeshStandardMaterial({ color: RUNNER, roughness: 0.95 });
  const lamps: Placement[] = [];
  const laptops: Placement[] = [];
  const books: Placement[] = [];

  grid.area.layout.forEach((row, y) => {
    for (const match of row.matchAll(/T+/g)) {
      const start = match.index;
      const length = match[0].length;
      const centerX = start + length / 2;
      const z = y + 0.5;
      const height = 0.36;

      const top = stadium(length - 0.1, 0.92, 0.05);
      top.position.set(centerX, FLOOR_Y + height, z);
      const cloth = stadium(length - 0.9, 0.36, 0.01);
      cloth.material = runner;
      cloth.position.set(centerX, FLOOR_Y + height + 0.05, z);
      top.material = wood;
      for (const mesh of [top, cloth]) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        root.add(mesh);
      }

      for (let lx = start + 0.6; lx < start + length; lx += 3) {
        for (const side of [-0.3, 0.3]) {
          const leg = new Mesh(new CylinderGeometry(0.035, 0.035, height, 8), wood);
          leg.position.set(lx, FLOOR_Y + height / 2, z + side);
          leg.castShadow = true;
          root.add(leg);
        }
      }

      const surface = FLOOR_Y + height + 0.05;
      for (let i = 0; i < length; i++) {
        const x = start + i + 0.5;
        if (i % 6 === 2) lamps.push({ x, z, y: surface });
        // Laptops and books in front of some seats, facing whoever sits there.
        for (const side of [-1, 1]) {
          const seat = grid.tileAt({ x: start + i, y: y + side });
          if (seat !== TILE.seat) continue;
          const roll = noise(start + i, y, side);
          const spot = { x, z: z + side * 0.26, y: surface };
          if (roll < 0.35) laptops.push({ ...spot, rotation: facing(0, -side) });
          else if (roll < 0.6) books.push({ ...spot, rotation: roll * 10 });
        }
      }
    }
  });
  root.add(instance(furniture.lampRoundTable, lamps));
  root.add(instance(furniture.laptop, laptops));
  root.add(instance(furniture.books, books));
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
    root.add(
      instance(furniture.laptop, [{ x: middle.x, z: middle.z, y: top, rotation: facing(0, -1) }]),
    );
    root.add(instance(furniture.lampRoundTable, [{ x: middle.x - 1.5, z: middle.z, y: top }]));
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
    root.add(instance(furniture.coatRackStanding, [{ x: 2.5, z: 9.5, y: FLOOR_Y }]));
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
  const volume = new Mesh(new BoxGeometry(zone.w, 1.5, zone.h), shade);
  volume.position.set(zone.x + zone.w / 2, 0.75, zone.y + zone.h / 2);
  volume.renderOrder = 1;
  root.add(volume);

  const tapeMaterial = new MeshStandardMaterial({ map: TAPE_TEXTURE.clone(), roughness: 0.6 });
  tapeMaterial.map?.repeat.set(zone.h * 2, 1);
  const tape = new Mesh(new BoxGeometry(0.02, 0.07, zone.h), tapeMaterial);
  tape.position.set(zone.x, FLOOR_Y + 0.45, zone.y + zone.h / 2);
  tape.castShadow = true;
  root.add(tape);

  const post = new MeshStandardMaterial({ color: 0xf2c230, roughness: 0.6 });
  for (let z = zone.y; z <= zone.y + zone.h; z += 2) {
    const pole = new Mesh(new CylinderGeometry(0.03, 0.05, 0.5, 8), post);
    pole.position.set(zone.x, FLOOR_Y + 0.25, z);
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
      1.1,
      zone.y + zone.h / 2,
    ),
  );
  return [shade, tapeMaterial, post];
}

function addDoorSigns(grid: AreaGrid, root: Group): void {
  const seen = new Set<string>();
  grid.area.layout.forEach((row, y) =>
    [...row].forEach((c, x) => {
      const to = grid.doorTarget({ x, y });
      const isElevator = c === TILE.elevator;
      if ((!to && !isElevator) || seen.has(c)) return;
      seen.add(c);
      const label = isElevator ? t('sign.elevator') : t(`area.${to ?? 'hall'}`);
      root.add(
        sign(
          label,
          'world-sign',
          x + 0.5 + (x === 0 ? 0.6 : 0),
          1.55,
          y + 0.5 + (y === 0 ? 0.6 : 0),
        ),
      );
    }),
  );
}

function sign(text: string, className: string, x: number, y: number, z: number): CSS2DObject {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = text;
  const label = new CSS2DObject(element);
  label.position.set(x, y, z);
  return label;
}
