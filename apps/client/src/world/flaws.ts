import type { AreaGrid, Point } from '@att/shared';
import {
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Material,
  type Object3D,
} from 'three';
import type { FlawId } from '../content/discoveries';

/**
 * A real library is never perfect: in ours one window pane is cracked, one
 * window is shuttered until its latch is mended, and one shelf is taped off
 * while it is being fixed. Each can be looked at, with a short note.
 */

/** A window in a back wall, as built by buildWalls. */
export type WindowSpot = {
  /** Middle of the wall piece, on the floor. */
  x: number;
  z: number;
  /** Which way the wall faces into the room. */
  normal: { x: number; z: number };
  /** Where to stand to look at it. */
  stand: Point;
};

/** A run of bookcases facing the room. */
export type ShelfFront = {
  /** Middle of the front face of the run, on the floor. */
  x: number;
  z: number;
  /** Which way the books face. */
  normal: { x: number; z: number };
  length: number;
  height: number;
  stand: Point;
};

/** The window glass in Kenney's wall, per tile: height range and width. */
const GLASS = { bottom: 0.88, top: 2.02, width: 0.276 };

export type BuiltFlaws = {
  materials: Material[];
  textures: CanvasTexture[];
  /** Ids from FLAW_IDS with where to stand to look at them, and what to point at. */
  found: { id: FlawId; stand: Point; mesh: Object3D }[];
};

export function buildFlaws(
  grid: AreaGrid,
  root: Group,
  windows: readonly WindowSpot[],
  shelves: readonly ShelfFront[],
): BuiltFlaws {
  const built: BuiltFlaws = { materials: [], textures: [], found: [] };
  if (grid.area.id !== 'library') return built;
  const open = (p: Point) => grid.isWalkable(p) && !grid.isSeat(p);
  const usable = windows.filter((w) => open(w.stand));
  const north = usable.filter((w) => w.normal.z > 0);
  const west = usable.filter((w) => w.normal.x > 0);
  const crackAt = north[0] ?? usable[0];
  const shutterAt = west[1] ?? west[0] ?? usable.find((w) => w !== crackAt);
  if (crackAt)
    built.found.push({ id: 'crack', stand: crackAt.stand, mesh: crack(crackAt, root, built) });
  if (shutterAt && shutterAt !== crackAt) {
    built.found.push({
      id: 'shutter',
      stand: shutterAt.stand,
      mesh: shutters(shutterAt, root, built),
    });
  }
  const shelf = shelves.filter((s) => open(s.stand))[1] ?? shelves[0];
  if (shelf)
    built.found.push({ id: 'shelf', stand: shelf.stand, mesh: repairs(shelf, root, built) });
  for (const { id, mesh } of built.found) {
    mesh.traverse((child) => (child.userData.examine = `flaw:${id}`));
  }
  return built;
}

function canvasTexture(
  built: BuiltFlaws,
  width: number,
  height: number,
  draw: (g: CanvasRenderingContext2D) => void,
): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (g) draw(g);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  built.textures.push(texture);
  return texture;
}

/** Turns a group so its +z faces along a wall's normal, and stands it at the wall. */
function onWall(group: Group, at: { x: number; z: number; normal: { x: number; z: number } }) {
  group.position.set(at.x, 0, at.z);
  group.rotation.y = Math.atan2(at.normal.x, at.normal.z);
}

/** A star of cracks on the glass, where something hit it, and the caretaker's note. */
function crack(spot: WindowSpot, root: Group, built: BuiltFlaws): Object3D {
  const group = new Group();
  const texture = canvasTexture(built, 128, 512, (g) => {
    const cx = 78;
    const cy = 170;
    const random = (() => {
      let seed = 7;
      return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    })();
    g.lineCap = 'round';
    for (const [color, width] of [
      ['rgba(30, 40, 50, 0.55)', 3.5],
      ['rgba(255, 255, 255, 0.95)', 1.6],
    ] as const) {
      g.strokeStyle = color;
      g.lineWidth = width;
      // Jagged lines running out from the impact.
      for (let i = 0; i < 9; i++) {
        const angle = (i / 9) * Math.PI * 2 + random() * 0.4;
        let x = cx;
        let y = cy;
        g.beginPath();
        g.moveTo(x, y);
        const length = 60 + random() * 260;
        for (let d = 0; d < length; d += 22) {
          x += Math.cos(angle) * 22 + (random() - 0.5) * 12;
          y += Math.sin(angle) * 22 + (random() - 0.5) * 12;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      // A little ring of chips round the point it hit.
      g.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 6) {
        const r = 12 + random() * 8;
        g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      g.stroke();
    }
  });
  const material = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
  built.materials.push(material);
  const decal = new Mesh(new PlaneGeometry(GLASS.width * 0.96, GLASS.top - GLASS.bottom), material);
  decal.position.set(0, (GLASS.top + GLASS.bottom) / 2, 0.012);
  group.add(decal);

  // "Glazier ordered", stuck on the frame below the glass.
  const note = canvasTexture(built, 64, 64, (g) => {
    g.fillStyle = '#FCE77D';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#6B5B2A';
    g.lineWidth = 3;
    for (const y of [20, 32, 44]) {
      g.beginPath();
      g.moveTo(10, y);
      g.lineTo(54 - (y === 44 ? 16 : 0), y);
      g.stroke();
    }
  });
  const noteMaterial = new MeshStandardMaterial({ map: note, roughness: 0.9 });
  built.materials.push(noteMaterial);
  const sticky = new Mesh(new PlaneGeometry(0.09, 0.09), noteMaterial);
  sticky.position.set(GLASS.width / 2 + 0.06, GLASS.bottom + 0.05, 0.1);
  sticky.rotation.z = 0.12;
  group.add(sticky);

  onWall(group, spot);
  root.add(group);
  return group;
}

/** Two wooden shutters closed over the window, with a plank nailed across them. */
function shutters(spot: WindowSpot, root: Group, built: BuiltFlaws): Object3D {
  const group = new Group();
  const slats = canvasTexture(built, 64, 256, (g) => {
    g.fillStyle = '#86593A';
    g.fillRect(0, 0, 64, 256);
    for (let y = 6; y < 256; y += 16) {
      g.fillStyle = '#5E3D24';
      g.fillRect(4, y + 9, 56, 4);
      g.fillStyle = '#A0714B';
      g.fillRect(4, y, 56, 3);
    }
    g.strokeStyle = '#4A2F1B';
    g.lineWidth = 6;
    g.strokeRect(0, 0, 64, 256);
  });
  const wood = new MeshStandardMaterial({ map: slats, roughness: 0.85 });
  const plank = new MeshStandardMaterial({ color: '#B08A5E', roughness: 0.9 });
  const nail = new MeshStandardMaterial({ color: '#3A3A3A', roughness: 0.5, metalness: 0.6 });
  built.materials.push(wood, plank, nail);
  const height = GLASS.top - GLASS.bottom + 0.1;
  const half = GLASS.width / 2 + 0.03;
  for (const side of [-1, 1]) {
    const panel = new Mesh(new BoxGeometry(half, height, 0.025), wood);
    // Not quite shut: a hair of light between them.
    panel.position.set(side * (half / 2 + 0.004), (GLASS.top + GLASS.bottom) / 2, 0.1);
    panel.rotation.y = side * 0.05;
    group.add(panel);
  }
  const board = new Mesh(new BoxGeometry(GLASS.width + 0.16, 0.06, 0.02), plank);
  board.position.set(0, (GLASS.top + GLASS.bottom) / 2 - 0.05, 0.125);
  board.rotation.z = -0.5;
  group.add(board);
  for (const end of [-1, 1]) {
    const head = new Mesh(new BoxGeometry(0.018, 0.018, 0.01), nail);
    const along = (GLASS.width / 2 + 0.04) * end;
    head.position.set(
      along * Math.cos(-0.5),
      (GLASS.top + GLASS.bottom) / 2 - 0.05 + along * Math.sin(-0.5),
      0.138,
    );
    group.add(head);
  }
  onWall(group, spot);
  root.add(group);
  return group;
}

/** Hazard tape across a shelf, a little sign, and its books in a pile beside it. */
function repairs(shelf: ShelfFront, root: Group, built: BuiltFlaws): Object3D {
  const group = new Group();
  const stripes = canvasTexture(built, 256, 16, (g) => {
    g.fillStyle = '#F2C230';
    g.fillRect(0, 0, 256, 16);
    g.fillStyle = '#2A2A2A';
    for (let x = -16; x < 256; x += 24) {
      g.beginPath();
      g.moveTo(x, 16);
      g.lineTo(x + 12, 0);
      g.lineTo(x + 20, 0);
      g.lineTo(x + 8, 16);
      g.fill();
    }
  });
  const tape = new MeshStandardMaterial({ map: stripes, roughness: 0.6 });
  built.materials.push(tape);
  const length = Math.min(shelf.length * 0.92, 1.4);
  for (const [y, tilt] of [
    [shelf.height * 0.62, 0.22],
    [shelf.height * 0.5, -0.18],
  ] as const) {
    const band = new Mesh(new BoxGeometry(length, 0.05, 0.006), tape);
    band.position.set(0, y, 0.03);
    band.rotation.z = tilt;
    group.add(band);
  }

  const sign = canvasTexture(built, 128, 96, (g) => {
    g.fillStyle = '#F7EFD8';
    g.fillRect(0, 0, 128, 96);
    g.strokeStyle = '#C0392B';
    g.lineWidth = 8;
    g.strokeRect(4, 4, 120, 88);
    g.fillStyle = '#3A2810';
    g.font = 'bold 22px Georgia, serif';
    g.textAlign = 'center';
    g.fillText('BEING', 64, 40);
    g.fillText('FIXED', 64, 66);
    g.font = '14px Georgia, serif';
    g.fillText('sorry!', 64, 84);
  });
  const signMaterial = new MeshStandardMaterial({ map: sign, roughness: 0.8 });
  const post = new MeshStandardMaterial({ color: '#6B4A2E', roughness: 0.9 });
  built.materials.push(signMaterial, post);
  const board = new Mesh(new BoxGeometry(0.24, 0.18, 0.015), [
    post,
    post,
    post,
    post,
    signMaterial,
    post,
  ]);
  // Leaning against the shelf at one end, as if propped there in a hurry.
  board.position.set(length / 2 - 0.12, 0.16, 0.06);
  board.rotation.x = -0.28;
  group.add(board);

  // The shelf's books, in a neat pile on the floor.
  const colours = ['#7A2E2E', '#2E4A7A', '#3F6B3A', '#8A6B2E', '#5A3A6B'];
  let y = 0.06;
  colours.forEach((colour, i) => {
    const book = new Mesh(
      new BoxGeometry(0.2 - (i % 2) * 0.03, 0.035, 0.14),
      new MeshStandardMaterial({ color: colour, roughness: 0.8 }),
    );
    built.materials.push(book.material as Material);
    book.position.set(-length / 2 + 0.14, y, 0.12);
    book.rotation.y = (i % 3) * 0.2 - 0.2;
    y += 0.036;
    group.add(book);
  });

  group.position.set(shelf.x, 0, shelf.z);
  group.rotation.y = Math.atan2(shelf.normal.x, shelf.normal.z);
  root.add(group);
  return group;
}
