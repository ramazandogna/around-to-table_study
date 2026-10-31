import type { AreaGrid, Point, Rect } from '@att/shared';
import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  type Material,
} from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { t } from '../i18n/t';
import { instance, type Placement } from './instancing';
import type { Furniture } from './models';

const FLOOR_Y = 0.05;

/** Small deterministic noise, so the mess stays where it is between visits. */
const noise = (x: number, y: number, salt = 0) => {
  const n = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return n - Math.floor(n);
};

/** The part of the renovation still closed: the zone minus the strips opened so far, left to right. */
export function closedPart(grid: AreaGrid): Rect | null {
  const zone = grid.area.renovation;
  if (!zone) return null;
  const opened = zone.expansions.slice(0, grid.opened);
  const x = opened.reduce((edge, strip) => Math.max(edge, strip.x + strip.w), zone.x);
  const w = zone.x + zone.w - x;
  return w > 0 ? { x, y: zone.y, w, h: zone.h } : null;
}

export type BuiltRenovation = {
  materials: Material[];
  /** Pointing anywhere at the closed part peeks at it. */
  pickable: Mesh;
  /** Where to stand to peek past the tape. */
  stand: Point;
};

/**
 * The closed part of a room, dimmed and taped off, looking like work in
 * progress: boxes (some open), new desks still wrapped, sawhorses, paint cans,
 * a ladder, a tarp, cones, and a wall that is only half painted.
 */
export function buildRenovation(
  grid: AreaGrid,
  furniture: Furniture,
  root: Group,
): BuiltRenovation | null {
  const closed = closedPart(grid);
  if (!closed) return null;
  const inside = (x: number, z: number, margin = 0.4) =>
    x > closed.x + margin &&
    x < closed.x + closed.w - margin &&
    z > closed.y + 0.3 &&
    z < closed.y + closed.h - 0.3;

  const shade = new MeshStandardMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  const tapeTexture = stripes();
  const tape = new MeshStandardMaterial({ map: tapeTexture, roughness: 0.6 });
  const yellow = new MeshStandardMaterial({ color: 0xf2c230, roughness: 0.6 });
  const wrap = new MeshStandardMaterial({
    color: 0xe8ecef,
    roughness: 0.35,
    transparent: true,
    opacity: 0.92,
  });
  const pine = new MeshStandardMaterial({ color: 0xd9b27c, roughness: 0.8 });
  const metal = new MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.4, metalness: 0.6 });
  const tarp = new MeshStandardMaterial({ color: 0x5f7f99, roughness: 0.9 });
  const orange = new MeshStandardMaterial({ color: 0xf26b2a, roughness: 0.6 });
  const fresh = new MeshStandardMaterial({ color: 0xf3e8cf, roughness: 1 });
  const lids = [0xc8403a, 0x3f7fbf, 0xf3e8cf, 0x4e8a55].map(
    (color) => new MeshStandardMaterial({ color, roughness: 0.5 }),
  );
  const wall = new MeshStandardMaterial({ map: halfPainted(closed.w), roughness: 1 });
  const materials: Material[] = [
    shade,
    tape,
    yellow,
    wrap,
    pine,
    metal,
    tarp,
    orange,
    fresh,
    wall,
    ...lids,
  ];

  const add = (mesh: Mesh, x: number, y: number, z: number, rotation = 0) => {
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotation;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };

  // Tall enough to dim the bookcases, low enough not to read as a wall.
  const volume = new Mesh(new BoxGeometry(closed.w, 1.7, closed.h), shade);
  volume.position.set(closed.x + closed.w / 2, 0.85, closed.y + closed.h / 2);
  volume.renderOrder = 1;
  volume.userData.examine = 'renovation';
  root.add(volume);

  tapeTexture.repeat.set(closed.h * 2, 1);
  add(
    new Mesh(new BoxGeometry(0.02, 0.1, closed.h), tape),
    closed.x,
    FLOOR_Y + 0.9,
    closed.y + closed.h / 2,
  );
  for (let z = closed.y; z <= closed.y + closed.h; z += 2) {
    add(new Mesh(new CylinderGeometry(0.04, 0.07, 0.95, 8), yellow), closed.x, FLOOR_Y + 0.475, z);
  }

  // The north wall: fresh cream below a ragged line, the old colour above.
  const painted = new Mesh(new PlaneGeometry(closed.w, 2.3), wall);
  painted.position.set(closed.x + closed.w / 2, FLOOR_Y + 1.15, 1.012);
  root.add(painted);

  // Props are scattered over the whole zone with fixed positions; only those in the closed part show.
  const zone = grid.area.renovation ?? closed;
  const boxes: Placement[] = [];
  const open: Placement[] = [];
  for (let i = 0; i < 22; i++) {
    const x = zone.x + 0.7 + noise(i, 1) * (zone.w - 1.4);
    const z = zone.y + 0.6 + noise(i, 2) * (zone.h - 1.2);
    if (!inside(x, z)) continue;
    const placement = { x, z, y: FLOOR_Y, rotation: noise(i, 3) * Math.PI };
    (i % 3 ? boxes : open).push(placement);
    // Now and then one box sits on another.
    if (i % 5 === 0)
      boxes.push({
        ...placement,
        y: FLOOR_Y + furniture.cardboardBoxClosed.size.y,
        rotation: noise(i, 4) * 3,
      });
  }
  root.add(instance(furniture.cardboardBoxClosed, boxes));
  root.add(instance(furniture.cardboardBoxOpen, open));

  // New desks for two, still in their wrapping, waiting for their strip to open.
  for (let i = 0; i < 4; i++) {
    const x = zone.x + 1.5 + i * 2.6;
    const z = zone.y + 3 + noise(i, 9) * 2;
    if (!inside(x, z, 0.9)) continue;
    add(
      new Mesh(new BoxGeometry(1.7, 0.6, 0.85), wrap),
      x,
      FLOOR_Y + 0.3,
      z,
      (noise(i, 10) - 0.5) * 0.4,
    );
    add(
      new Mesh(new BoxGeometry(1.72, 0.08, 0.1), tape),
      x,
      FLOOR_Y + 0.61,
      z,
      (noise(i, 10) - 0.5) * 0.4,
    );
  }

  // Sawhorses with a plank across them.
  for (let i = 0; i < 2; i++) {
    const x = zone.x + 2 + i * 5 + noise(i, 11);
    const z = zone.y + zone.h - 3 - noise(i, 12) * 2;
    if (!inside(x, z, 1)) continue;
    const horse = new Group();
    for (const side of [-0.55, 0.55]) {
      const top = new Mesh(new BoxGeometry(0.08, 0.06, 0.5), pine);
      top.position.set(side, 0.55, 0);
      horse.add(top);
      for (const leg of [-0.18, 0.18]) {
        const post = new Mesh(new BoxGeometry(0.05, 0.58, 0.05), pine);
        post.position.set(side, 0.27, leg);
        post.rotation.x = leg > 0 ? -0.25 : 0.25;
        horse.add(post);
      }
    }
    const plank = new Mesh(new BoxGeometry(1.6, 0.04, 0.3), pine);
    plank.position.y = 0.6;
    horse.add(plank);
    horse.traverse((child) => (child.castShadow = true));
    horse.position.set(x, FLOOR_Y, z);
    horse.rotation.y = noise(i, 13) * 0.6;
    root.add(horse);
  }

  // Paint cans, one knocked over in a little puddle.
  for (let i = 0; i < 7; i++) {
    const x = zone.x + 0.8 + noise(i, 14) * (zone.w - 1.6);
    const z = zone.y + 0.6 + noise(i, 15) * 2.4;
    if (!inside(x, z)) continue;
    const can = add(new Mesh(new CylinderGeometry(0.1, 0.1, 0.2, 12), metal), x, FLOOR_Y + 0.1, z);
    const lid = new Mesh(new CylinderGeometry(0.102, 0.102, 0.02, 12), lids[i % lids.length]);
    lid.position.y = 0.105;
    can.add(lid);
    if (i === 3) {
      can.rotation.z = Math.PI / 2;
      can.position.y = FLOOR_Y + 0.1;
      const puddle = new Mesh(new CircleGeometry(0.28, 16), fresh);
      puddle.rotation.x = -Math.PI / 2;
      puddle.position.set(x + 0.25, FLOOR_Y + 0.004, z);
      root.add(puddle);
    }
  }

  // A stepladder against the half-painted wall, and a tarp under it.
  const ladderX = closed.x + Math.min(closed.w - 1, 2.5);
  if (inside(ladderX, zone.y + 0.9, 0.3)) {
    const ladder = new Group();
    for (const side of [-0.2, 0.2]) {
      for (const lean of [-1, 1]) {
        const rail = new Mesh(new BoxGeometry(0.04, 1.5, 0.04), metal);
        rail.position.set(side, 0.72, lean * 0.18);
        rail.rotation.x = lean * 0.24;
        ladder.add(rail);
      }
    }
    for (let step = 0; step < 4; step++) {
      const rung = new Mesh(new BoxGeometry(0.42, 0.03, 0.1), metal);
      rung.position.set(0, 0.3 + step * 0.32, 0.17 - step * 0.075);
      ladder.add(rung);
    }
    ladder.traverse((child) => (child.castShadow = true));
    ladder.position.set(ladderX, FLOOR_Y, zone.y + 0.9);
    root.add(ladder);
    const cloth = new Mesh(new BoxGeometry(2.2, 0.01, 1.4), tarp);
    cloth.position.set(ladderX + 0.4, FLOOR_Y + 0.005, zone.y + 1.1);
    cloth.rotation.y = 0.08;
    cloth.receiveShadow = true;
    root.add(cloth);
  }

  // Cones along the tape.
  for (let i = 0; i < 3; i++) {
    const z = closed.y + 2 + i * (closed.h / 3);
    add(new Mesh(new ConeGeometry(0.11, 0.34, 12), orange), closed.x + 0.35, FLOOR_Y + 0.17, z);
  }

  const label = document.createElement('div');
  label.className = 'world-sign world-sign--warning';
  label.textContent = t('sign.renovation');
  const sign = new CSS2DObject(label);
  sign.position.set(closed.x + 1.2, 2.1, closed.y + closed.h / 2);
  root.add(sign);

  return { materials, pickable: volume, stand: standBy(grid, closed) };
}

/** The walkable tile just outside the tape, closest to its middle. */
function standBy(grid: AreaGrid, closed: Rect): Point {
  const x = closed.x - 1;
  const middle = Math.floor(closed.y + closed.h / 2);
  for (let d = 0; d < closed.h; d++) {
    for (const y of [middle - d, middle + d]) {
      if (grid.isWalkable({ x, y })) return { x, y };
    }
  }
  return grid.area.spawn;
}

function stripes(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 8;
  const g = canvas.getContext('2d');
  if (g) {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#1d1d1d' : '#f2c230';
      g.beginPath();
      g.moveTo(i * 8, 8);
      g.lineTo(i * 8 + 8, 0);
      g.lineTo(i * 8 + 16, 0);
      g.lineTo(i * 8 + 8, 8);
      g.fill();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  return texture;
}

/** Fresh cream rolled on up to a ragged line, with the old grey above and roller marks. */
function halfPainted(widthTiles: number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(64, Math.round(widthTiles * 48));
  canvas.height = 112;
  const g = canvas.getContext('2d');
  if (g) {
    g.fillStyle = '#B9B2A4';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = '#F3E8CF';
    g.beginPath();
    g.moveTo(0, canvas.height);
    for (let x = 0; x <= canvas.width; x += 8) {
      g.lineTo(x, 46 + Math.sin(x * 0.09) * 8 + noise(x, 1) * 10);
    }
    g.lineTo(canvas.width, canvas.height);
    g.fill();
    g.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    g.lineWidth = 6;
    for (let x = 10; x < canvas.width; x += 26) {
      g.beginPath();
      g.moveTo(x, canvas.height);
      g.lineTo(x + 4, 70);
      g.stroke();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
