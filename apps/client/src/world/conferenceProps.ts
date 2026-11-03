import { TILE, type AreaGrid, type Point } from '@att/shared';
import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
  type Material,
} from 'three';

/** The stage is a step up: people standing on it are this much higher. */
export const STAGE_HEIGHT = 0.3;
/** The big screen, 16:9, standing on the back wall above the stage (it rises past the wall's top). */
const SCREEN_WIDTH = 5.6;
const SCREEN_HEIGHT = SCREEN_WIDTH * (9 / 16);
const SCREEN_BOTTOM = 1.75;
const BEZEL = 0.12;

export type BuiltStage = {
  root: Group;
  materials: Material[];
  /** The four corners of the screen's picture, for laying a page over it. */
  screenCorners: readonly Vector3[];
  /** Shows the screen lit (something is on) or dark (blank). */
  setLit: (lit: boolean) => void;
  /** The tile with the microphone. */
  microphone: Point | null;
};

/**
 * The conference hall's stage: one raised platform over every stage tile, a
 * microphone on its stand, and the big screen on the wall behind. What plays
 * on the screen is a page laid over it (a picture, YouTube's player), so the
 * screen itself only glows when something is on.
 */
export function buildStage(grid: AreaGrid, floorY: number): BuiltStage | null {
  const tiles: Point[] = [];
  let microphone: Point | null = null;
  grid.area.layout.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === TILE.stage || c === TILE.microphone) tiles.push({ x, y });
      if (c === TILE.microphone) microphone = { x, y };
    }),
  );
  if (tiles.length === 0) return null;
  const minX = Math.min(...tiles.map((t) => t.x));
  const maxX = Math.max(...tiles.map((t) => t.x)) + 1;
  const maxY = Math.max(...tiles.map((t) => t.y)) + 1;

  const root = new Group();
  const boards = new MeshStandardMaterial({ color: 0x5a3a26, roughness: 0.55 });
  const skirt = new MeshStandardMaterial({ color: 0x2b1d18, roughness: 0.9 });
  const trim = new MeshStandardMaterial({ color: 0xd4a64a, roughness: 0.35, metalness: 0.6 });
  const metal = new MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.4, metalness: 0.7 });
  const grille = new MeshStandardMaterial({ color: 0x9a9aa2, roughness: 0.3, metalness: 0.8 });
  const bezel = new MeshStandardMaterial({ color: 0x141418, roughness: 0.5 });
  const dark = new MeshBasicMaterial({ color: 0x1d2230 });
  const glow = new MeshBasicMaterial({ map: blankScreen() });
  const materials: Material[] = [boards, skirt, trim, metal, grille, bezel, dark, glow];

  const w = maxX - minX;
  const cx = minX + w / 2;
  // The stage reaches back to the wall, so there is no gap behind it.
  const back = 1;
  const depth = maxY - back;
  const platform = new Mesh(new BoxGeometry(w, STAGE_HEIGHT, depth), [
    skirt,
    skirt,
    boards,
    skirt,
    skirt,
    skirt,
  ]);
  platform.position.set(cx, floorY + STAGE_HEIGHT / 2 - 0.001, back + depth / 2);
  platform.castShadow = true;
  platform.receiveShadow = true;
  root.add(platform);
  const edge = new Mesh(new BoxGeometry(w + 0.02, 0.04, 0.04), trim);
  edge.position.set(cx, floorY + STAGE_HEIGHT - 0.02, maxY + 0.01);
  root.add(edge);
  // A step up in front of the middle, where people walk on.
  const step = new Mesh(new BoxGeometry(Math.min(4, w), STAGE_HEIGHT / 2, 0.35), skirt);
  step.position.set(cx, floorY + STAGE_HEIGHT / 4, maxY + 0.17);
  step.receiveShadow = true;
  root.add(step);

  const mic = microphone as Point | null;
  if (mic) {
    const stand = new Group();
    const top = floorY + STAGE_HEIGHT;
    const base = new Mesh(new CylinderGeometry(0.16, 0.18, 0.03, 20), metal);
    base.position.y = 0.015;
    const pole = new Mesh(new CylinderGeometry(0.015, 0.015, 1.35, 8), metal);
    pole.position.y = 0.69;
    const arm = new Mesh(new CylinderGeometry(0.012, 0.012, 0.28, 8), metal);
    arm.rotation.x = Math.PI / 2.6;
    arm.position.set(0, 1.42, 0.1);
    const head = new Mesh(new SphereGeometry(0.045, 14, 10), grille);
    head.position.set(0, 1.5, 0.22);
    for (const part of [base, pole, arm, head]) {
      part.castShadow = true;
      stand.add(part);
    }
    stand.position.set(mic.x + 0.5, top, mic.y + 0.5);
    root.add(stand);
  }

  // The screen: a dark bezel on the wall, the picture just in front of it.
  const wallFace = 1.04;
  const screenY = SCREEN_BOTTOM + SCREEN_HEIGHT / 2;
  const frame = new Mesh(
    new BoxGeometry(SCREEN_WIDTH + BEZEL * 2, SCREEN_HEIGHT + BEZEL * 2, 0.08),
    bezel,
  );
  frame.position.set(cx, screenY, wallFace + 0.04);
  frame.castShadow = true;
  root.add(frame);
  const picture = new Mesh(new BoxGeometry(SCREEN_WIDTH, SCREEN_HEIGHT, 0.01), [
    dark,
    dark,
    dark,
    dark,
    glow,
    dark,
  ]);
  picture.position.set(cx, screenY, wallFace + 0.085);
  root.add(picture);
  const z = wallFace + 0.09;
  const left = cx - SCREEN_WIDTH / 2;
  const right = cx + SCREEN_WIDTH / 2;
  const screenCorners = [
    new Vector3(left, SCREEN_BOTTOM + SCREEN_HEIGHT, z),
    new Vector3(right, SCREEN_BOTTOM + SCREEN_HEIGHT, z),
    new Vector3(right, SCREEN_BOTTOM, z),
    new Vector3(left, SCREEN_BOTTOM, z),
  ];

  return {
    root,
    materials,
    screenCorners,
    microphone: mic,
    setLit: (lit) => {
      glow.color.setHex(lit ? 0x0c0c10 : 0xffffff);
    },
  };
}

/** The blank screen: a soft blue glow with the hall's mark, until something is shown. */
function blankScreen(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 288;
  const g = canvas.getContext('2d');
  if (g) {
    const fill = g.createLinearGradient(0, 0, 0, canvas.height);
    fill.addColorStop(0, '#2d3a5c');
    fill.addColorStop(1, '#1a2238');
    g.fillStyle = fill;
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = 'rgba(255, 230, 190, 0.85)';
    g.font = '600 64px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('🎤', canvas.width / 2, canvas.height / 2 - 18);
    g.fillStyle = 'rgba(255, 230, 190, 0.5)';
    g.fillRect(canvas.width / 2 - 60, canvas.height / 2 + 40, 120, 3);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = 'srgb';
  return texture;
}

/**
 * Rows of theatre chairs, all facing the stage. Each is a seat, a back and
 * two arms, drawn as one instanced mesh per part.
 */
export function theaterChairs(grid: AreaGrid, floorY: number, materials: Material[]): Group {
  const tiles: Point[] = [];
  grid.area.layout.forEach((row, y) =>
    [...row].forEach((c, x) => c === TILE.theaterSeat && tiles.push({ x, y })),
  );
  const group = new Group();
  if (tiles.length === 0) return group;
  const velvet = new MeshStandardMaterial({ color: 0x8e2b2f, roughness: 0.85 });
  const frame = new MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.6 });
  materials.push(velvet, frame);
  const parts: [BoxGeometry, Material, (p: Point) => [number, number, number]][] = [
    // Seat cushion, at chair height.
    [new BoxGeometry(0.62, 0.1, 0.5), velvet, (p) => [p.x + 0.5, floorY + 0.32, p.y + 0.48]],
    // Back, behind the seat (south, away from the stage), leaning back a little.
    [new BoxGeometry(0.62, 0.62, 0.08), velvet, (p) => [p.x + 0.5, floorY + 0.66, p.y + 0.77]],
    // Arms on both sides, shared with the neighbours.
    [new BoxGeometry(0.06, 0.08, 0.5), frame, (p) => [p.x + 0.16, floorY + 0.5, p.y + 0.5]],
    [new BoxGeometry(0.06, 0.08, 0.5), frame, (p) => [p.x + 0.84, floorY + 0.5, p.y + 0.5]],
    // The leg block under it.
    [new BoxGeometry(0.5, 0.27, 0.36), frame, (p) => [p.x + 0.5, floorY + 0.135, p.y + 0.55]],
  ];
  const matrix = new Matrix4();
  for (const [geometry, material, place] of parts) {
    const mesh = new InstancedMesh(geometry, material, tiles.length);
    tiles.forEach((tile, i) => mesh.setMatrixAt(i, matrix.makeTranslation(...place(tile))));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}
