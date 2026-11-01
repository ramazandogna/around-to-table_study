import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Material,
} from 'three';

/**
 * The smoking room's corner for games and music, built from simple shapes in
 * the furniture kit's chunky style: a dartboard in its cabinet, dice and cards
 * on a round table, and a glowing jukebox. Materials go into `materials` so
 * the room disposes of them with everything else.
 */

/** A board's numbers clockwise from the top, as on every dartboard. */
const NUMBERS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

/** Draws a dartboard (radius 1 = the outer edge of the double ring) on a square canvas. */
export function drawDartboard(context: CanvasRenderingContext2D, size: number): void {
  const c = size / 2;
  const r = size * 0.4;
  context.fillStyle = '#1b1b1b';
  context.beginPath();
  context.arc(c, c, size * 0.5, 0, Math.PI * 2);
  context.fill();
  const slice = (Math.PI * 2) / 20;
  const ring = (inner: number, outer: number, colours: [string, string]) => {
    for (let i = 0; i < 20; i++) {
      // Canvas angles start at 3 o'clock; the 20 sits at 12.
      const start = -Math.PI / 2 - slice / 2 + i * slice;
      context.beginPath();
      context.arc(c, c, outer * r, start, start + slice);
      context.arc(c, c, inner * r, start + slice, start, true);
      context.closePath();
      context.fillStyle = colours[i % 2] as string;
      context.fill();
    }
  };
  ring(0.094, 1, ['#151515', '#efe3c4']);
  ring(0.582, 0.629, ['#c8322b', '#2f8a47']);
  ring(0.953, 1, ['#c8322b', '#2f8a47']);
  context.fillStyle = '#2f8a47';
  context.beginPath();
  context.arc(c, c, 0.094 * r, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#c8322b';
  context.beginPath();
  context.arc(c, c, 0.037 * r, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#f2efe6';
  context.font = `bold ${Math.round(size * 0.05)}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  NUMBERS.forEach((n, i) => {
    const angle = -Math.PI / 2 + i * slice;
    context.fillText(String(n), c + Math.cos(angle) * r * 1.12, c + Math.sin(angle) * r * 1.12);
  });
}

function canvasTexture(size: number, draw: (context: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) draw(context);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A dartboard in an open wooden cabinet, hung on the wall behind the tile; faces +z. */
export function dartCabinet(materials: Material[]): Group {
  const cabinet = new Group();
  const wood = new MeshStandardMaterial({ color: '#5b3a24', roughness: 0.8 });
  const board = new MeshStandardMaterial({
    map: canvasTexture(256, (ctx) => drawDartboard(ctx, 256)),
    roughness: 0.9,
  });
  const chalk = new MeshStandardMaterial({ color: '#2b3a33', roughness: 0.95 });
  materials.push(wood, board, chalk);
  const back = new Mesh(new BoxGeometry(0.64, 0.64, 0.05), wood);
  back.position.set(0, 1.32, -0.44);
  const face = new Mesh(new CircleGeometry(0.25, 40), board);
  face.position.set(0, 1.32, -0.41);
  // The doors stand open to both sides, a little scoreboard in each.
  for (const side of [-1, 1]) {
    const door = new Mesh(new BoxGeometry(0.32, 0.64, 0.03), wood);
    door.position.set(side * 0.44, 1.32, -0.33);
    door.rotation.y = side * -0.9;
    const board = new Mesh(new BoxGeometry(0.24, 0.5, 0.005), chalk);
    board.position.set(side * 0.44 + side * 0.012, 1.32, -0.31);
    board.rotation.y = side * -0.9;
    cabinet.add(door, board);
  }
  cabinet.add(back, face);
  cabinet.traverse((child) => {
    if (child instanceof Mesh) child.castShadow = true;
  });
  return cabinet;
}

/** Dice and a deck of cards, to lie on a table top at y = 0. */
export function tableGames(materials: Material[]): Group {
  const games = new Group();
  const pips = new MeshStandardMaterial({
    map: canvasTexture(64, (ctx) => {
      ctx.fillStyle = '#f6f3ec';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#b8261e';
      for (const [x, y] of [
        [16, 16],
        [48, 48],
        [32, 32],
      ]) {
        ctx.beginPath();
        ctx.arc(x as number, y as number, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }),
    roughness: 0.5,
  });
  const card = new MeshStandardMaterial({ color: '#2d4f9e', roughness: 0.7 });
  const felt = new MeshStandardMaterial({ color: '#2f6b46', roughness: 1 });
  materials.push(pips, card, felt);
  const cloth = new Mesh(new CylinderGeometry(0.34, 0.34, 0.006, 24), felt);
  cloth.position.y = 0.003;
  games.add(cloth);
  for (const [x, z, turn] of [
    [-0.06, 0.04, 0.4],
    [0.05, -0.02, 1.1],
  ]) {
    const die = new Mesh(new BoxGeometry(0.055, 0.055, 0.055), pips);
    die.position.set(x as number, 0.034, z as number);
    die.rotation.y = turn as number;
    die.castShadow = true;
    games.add(die);
  }
  const deck = new Mesh(new BoxGeometry(0.09, 0.03, 0.13), card);
  deck.position.set(0.14, 0.021, 0.1);
  deck.rotation.y = -0.3;
  games.add(deck);
  return games;
}

/** A jukebox against the west wall, facing +x, its arch glowing in turn. */
export function jukeboxModel(materials: Material[]): { root: Group; glow: (time: number) => void } {
  const root = new Group();
  const wood = new MeshStandardMaterial({ color: '#7a3f22', roughness: 0.6 });
  const chrome = new MeshStandardMaterial({ color: '#d9d9de', roughness: 0.25, metalness: 0.8 });
  const grille = new MeshStandardMaterial({ color: '#2a1d16', roughness: 0.9 });
  const lights = ['#ff7a3d', '#ffd24d', '#5ed1ff', '#ff5fa2'].map(
    (colour) =>
      new MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 0.8 }),
  );
  materials.push(wood, chrome, grille, ...lights);
  const body = new Mesh(new BoxGeometry(0.42, 0.95, 0.62), wood);
  body.position.set(-0.12, 0.475, 0);
  // The arch: a round top whose lower half sits inside the cabinet.
  const top = new Mesh(new CylinderGeometry(0.31, 0.31, 0.42, 20), wood);
  top.rotation.z = Math.PI / 2;
  top.position.set(-0.12, 0.95, 0);
  const front = new Mesh(new BoxGeometry(0.02, 0.4, 0.44), grille);
  front.position.set(0.1, 0.32, 0);
  const tubes = lights.map((material, i) => {
    const tube = new Mesh(new BoxGeometry(0.03, 0.62 - i * 0.08, 0.035), material);
    tube.position.set(0.105, 0.62, (i - 1.5) * 0.11);
    return tube;
  });
  const trim = new Mesh(new BoxGeometry(0.03, 0.04, 0.62), chrome);
  trim.position.set(0.1, 0.56, 0);
  root.add(body, top, front, trim, ...tubes);
  root.traverse((child) => {
    if (child instanceof Mesh) child.castShadow = true;
  });
  return {
    root,
    // The tubes pulse one after the other, like an old Wurlitzer.
    glow: (time) =>
      lights.forEach((material, i) => {
        material.emissiveIntensity = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(time * 2.2 - i * 0.9));
      }),
  };
}
