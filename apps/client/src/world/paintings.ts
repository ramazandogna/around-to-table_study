import type { AreaId, Point } from '@att/shared';
import {
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Object3D,
} from 'three';
import { HALL_GALLERY } from '../content/discoveries';

/**
 * Where paintings hang: on the north wall (x along it) or the west wall (z
 * along it), and how high. A spot may name its painting; otherwise the room
 * takes the next one from its place in the list.
 */
type Spot = {
  wall: 'north' | 'west';
  at: number;
  height: number;
  width: number;
  painting?: number;
};

/** Portraits hang upright; everything else is landscape. */
const PORTRAITS: ReadonlySet<number> = new Set([HALL_GALLERY[0], HALL_GALLERY[1], HALL_GALLERY[2]]);

const SPOTS: Record<AreaId, readonly Spot[]> = {
  // Above the wall shelves and along the quiet west wall.
  library: [
    { wall: 'north', at: 2.5, height: 2.05, width: 0.7 },
    { wall: 'north', at: 8, height: 2.05, width: 0.9 },
    { wall: 'north', at: 13, height: 2.05, width: 0.6 },
    { wall: 'west', at: 6.5, height: 1.45, width: 0.8 },
    { wall: 'west', at: 9.2, height: 1.5, width: 0.6 },
  ],
  // A small gallery between the doors: three portraits, and three days the world remembers.
  hall: [
    { wall: 'north', at: 2.6, height: 1.5, width: 0.62, painting: HALL_GALLERY[0] },
    { wall: 'north', at: 4.6, height: 1.5, width: 0.62, painting: HALL_GALLERY[1] },
    { wall: 'north', at: 12.4, height: 1.5, width: 0.62, painting: HALL_GALLERY[2] },
    { wall: 'north', at: 14.6, height: 1.45, width: 0.85, painting: HALL_GALLERY[5] },
    { wall: 'west', at: 4.6, height: 1.45, width: 0.9, painting: HALL_GALLERY[3] },
    { wall: 'west', at: 9.1, height: 1.45, width: 0.9, painting: HALL_GALLERY[4] },
  ],
  smoking: [
    { wall: 'north', at: 5.5, height: 1.5, width: 0.8 },
    { wall: 'north', at: 11, height: 1.55, width: 0.6 },
    { wall: 'west', at: 6.5, height: 1.5, width: 0.7 },
  ],
  // Along the side wall, between the rows; the back wall is the stage's.
  conference: [
    { wall: 'west', at: 6.5, height: 1.5, width: 0.8 },
    { wall: 'west', at: 10.5, height: 1.5, width: 0.8 },
  ],
  room3: [{ wall: 'west', at: 3.5, height: 1.5, width: 0.7, painting: 6 }],
  room5: [{ wall: 'west', at: 3.5, height: 1.5, width: 0.7, painting: 6 }],
  room9: [
    { wall: 'west', at: 3.5, height: 1.5, width: 0.7, painting: 6 },
    { wall: 'north', at: 3, height: 1.5, width: 0.6, painting: 7 },
  ],
};

/** Each room starts at its own place in the list, so no painting hangs twice. */
const FIRST: Record<AreaId, number> = {
  library: 0,
  hall: 5,
  smoking: 5,
  conference: 2,
  room3: 6,
  room5: 6,
  room9: 6,
};

export type HungPainting = {
  /** Index into PAINTINGS. */
  painting: number;
  /** A floor tile in front of it, to walk to before looking. */
  stand: Point;
  mesh: Object3D;
};

/** Frames and paints the room's paintings on its back walls. */
export function hangPaintings(
  area: AreaId,
  root: Group,
): { paintings: HungPainting[]; materials: MeshStandardMaterial[] } {
  const frame = new MeshStandardMaterial({ color: 0x6b4423, roughness: 0.55 });
  const gilt = new MeshStandardMaterial({ color: 0xb8913f, roughness: 0.4, metalness: 0.5 });
  const materials = [frame, gilt];
  const paintings: HungPainting[] = [];
  SPOTS[area].forEach((spot, i) => {
    const painting = spot.painting ?? (FIRST[area] + i) % HALL_GALLERY[0];
    const ratio = PORTRAITS.has(painting) ? 1.3 : 0.75;
    const w = spot.width;
    const h = w * ratio;
    const group = new Group();
    const border = new Mesh(new BoxGeometry(w + 0.1, h + 0.1, 0.04), i % 2 ? gilt : frame);
    border.castShadow = true;
    const texture = paint(painting);
    const canvas = new MeshStandardMaterial({ map: texture, roughness: 0.85 });
    materials.push(canvas);
    const face = new Mesh(new PlaneGeometry(w, h), canvas);
    face.position.z = 0.021;
    group.add(border, face);
    group.userData.examine = `painting:${painting}`;
    if (spot.wall === 'north') {
      group.position.set(spot.at, spot.height, 1.03);
    } else {
      group.position.set(1.03, spot.height, spot.at);
      group.rotation.y = Math.PI / 2;
    }
    root.add(group);
    const stand =
      spot.wall === 'north' ? { x: Math.floor(spot.at), y: 2 } : { x: 2, y: Math.floor(spot.at) };
    paintings.push({ painting, stand, mesh: group });
  });
  return { paintings, materials };
}

const W = 160;
const H = 120;

/** A small canvas painting that matches its story; portraits are upright. */
function paint(index: number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = PORTRAITS.has(index) ? H : W;
  canvas.height = PORTRAITS.has(index) ? W : H;
  const g = canvas.getContext('2d');
  if (g) (ART[index] ?? abstractBlue)(g);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

const fill = (g: CanvasRenderingContext2D, color: string, draw: () => void) => {
  g.fillStyle = color;
  g.beginPath();
  draw();
  g.fill();
};

/** A four-year-old's crayon kite day: a big sun, a little house and a huge kite. */
function kiteDay(g: CanvasRenderingContext2D): void {
  g.fillStyle = '#FFF8E6';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#7CC36B';
  g.fillRect(0, 92, W, 28);
  fill(g, '#FFC93C', () => g.arc(30, 26, 16, 0, Math.PI * 2));
  g.strokeStyle = '#FFC93C';
  g.lineWidth = 3;
  for (let a = 0; a < 8; a++) {
    g.beginPath();
    g.moveTo(30 + Math.cos(a) * 20, 26 + Math.sin(a) * 20);
    g.lineTo(30 + Math.cos(a) * 28, 26 + Math.sin(a) * 28);
    g.stroke();
  }
  g.fillStyle = '#E8604C';
  g.fillRect(24, 70, 26, 24);
  fill(g, '#9B4DCA', () => {
    g.moveTo(20, 72);
    g.lineTo(37, 56);
    g.lineTo(54, 72);
  });
  fill(g, '#3D8BFF', () => {
    g.moveTo(112, 14);
    g.lineTo(140, 42);
    g.lineTo(112, 74);
    g.lineTo(86, 42);
  });
  g.strokeStyle = '#333';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(112, 74);
  g.bezierCurveTo(100, 90, 90, 80, 70, 100);
  g.stroke();
}

/** A row of hands, each a different skin tone, reaching for the next. */
function handsTogether(g: CanvasRenderingContext2D): void {
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#E9B872');
  sky.addColorStop(1, '#B5543F');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  const tones = ['#F1C9A5', '#C68B59', '#8D5524', '#E0AC69', '#5C3A21', '#D1A27C'];
  tones.forEach((tone, i) => {
    const x = 8 + i * 25;
    fill(g, tone, () => g.ellipse(x + 12, 72, 13, 18, 0, 0, Math.PI * 2));
    g.fillStyle = tone;
    g.fillRect(x + 4, 82, 16, 40);
    g.fillRect(x + 20, 66, 12, 7);
  });
  g.fillStyle = 'rgba(60, 20, 10, 0.4)';
  g.fillRect(0, 112, W, 8);
}

/** A cat asleep on a pile of returned books. */
function nightShift(g: CanvasRenderingContext2D): void {
  g.fillStyle = '#1F2A44';
  g.fillRect(0, 0, W, H);
  fill(g, 'rgba(255, 214, 120, 0.25)', () => g.arc(130, 22, 30, 0, Math.PI * 2));
  const books = ['#A23B3B', '#3B6EA2', '#C9A13B', '#4E8A55', '#7A4AA2'];
  books.forEach((color, i) => {
    g.fillStyle = color;
    g.fillRect(30 + (i % 2) * 6, 100 - i * 10, 90 - (i % 3) * 8, 10);
  });
  fill(g, '#E8A23A', () => g.ellipse(76, 46, 30, 13, 0, 0, Math.PI * 2));
  fill(g, '#E8A23A', () => g.arc(102, 44, 11, 0, Math.PI * 2));
  fill(g, '#E8A23A', () => {
    g.moveTo(96, 36);
    g.lineTo(99, 28);
    g.lineTo(104, 35);
    g.moveTo(104, 34);
    g.lineTo(109, 28);
    g.lineTo(111, 37);
  });
  g.strokeStyle = '#3A2410';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(98, 45);
  g.lineTo(102, 45);
  g.moveTo(104, 45);
  g.lineTo(108, 45);
  g.stroke();
}

/** Eleven blues of the Bosphorus at dawn, with a ferry crossing. */
function bosphorus(g: CanvasRenderingContext2D): void {
  const dawn = g.createLinearGradient(0, 0, 0, 56);
  dawn.addColorStop(0, '#F6B48F');
  dawn.addColorStop(1, '#FCE3B0');
  g.fillStyle = dawn;
  g.fillRect(0, 0, W, 56);
  const blues = ['#1E3F66', '#2E5984', '#376996', '#4B7BAA', '#5A8DBD', '#6B9FCC', '#7FB2D9'];
  blues.forEach((blue, i) => {
    g.fillStyle = blue;
    g.fillRect(0, 56 + i * 9, W, 9);
  });
  g.fillStyle = '#3A3550';
  g.fillRect(0, 46, W, 10);
  for (let x = 10; x < W; x += 22) {
    fill(g, '#3A3550', () => g.arc(x, 46, 6, Math.PI, 0));
  }
  g.fillStyle = '#FDFDFD';
  g.fillRect(70, 70, 36, 8);
  g.fillStyle = '#C8403A';
  g.fillRect(84, 62, 6, 8);
}

/** Bold strokes in blue, made at three in the morning. */
function abstractBlue(g: CanvasRenderingContext2D): void {
  g.fillStyle = '#EAF0F6';
  g.fillRect(0, 0, W, H);
  const strokes = ['#1B3A6B', '#2F6DB5', '#86B6E8', '#0F2142', '#F2C14E'];
  strokes.forEach((color, i) => {
    g.strokeStyle = color;
    g.lineWidth = 16 - i * 2;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(10 + i * 20, 100 - i * 6);
    g.bezierCurveTo(60, 10 + i * 12, 100, 120 - i * 10, 150 - i * 6, 20 + i * 14);
    g.stroke();
  });
}

/** The first snow seen from a classroom window. */
function firstSnow(g: CanvasRenderingContext2D): void {
  g.fillStyle = '#B9CBD9';
  g.fillRect(0, 0, W, H);
  fill(g, '#FFFFFF', () => {
    g.moveTo(0, 90);
    g.quadraticCurveTo(50, 70, 90, 88);
    g.quadraticCurveTo(130, 100, W, 80);
    g.lineTo(W, H);
    g.lineTo(0, H);
  });
  fill(g, '#5E6E7E', () => {
    g.moveTo(20, 80);
    g.lineTo(55, 30);
    g.lineTo(90, 80);
  });
  fill(g, '#FFFFFF', () => {
    g.moveTo(45, 44);
    g.lineTo(55, 30);
    g.lineTo(65, 44);
  });
  g.fillStyle = '#8A5A3B';
  g.fillRect(118, 70, 22, 18);
  fill(g, '#B54B3A', () => {
    g.moveTo(114, 72);
    g.lineTo(129, 58);
    g.lineTo(144, 72);
  });
  g.fillStyle = '#FFFFFF';
  for (let i = 0; i < 40; i++) g.fillRect((i * 37) % W, (i * 53) % 90, 2, 2);
}

/** Twelve people at one long table under one lamp. */
function longTable(g: CanvasRenderingContext2D): void {
  g.fillStyle = '#3B2A22';
  g.fillRect(0, 0, W, H);
  fill(g, 'rgba(255, 220, 140, 0.35)', () => g.ellipse(80, 64, 70, 34, 0, 0, Math.PI * 2));
  g.fillStyle = '#B07A45';
  g.fillRect(14, 60, 132, 14);
  const people = ['#D9534F', '#5BC0DE', '#F0AD4E', '#5CB85C', '#9370DB', '#E0E0E0'];
  for (let i = 0; i < 6; i++) {
    const x = 22 + i * 21;
    fill(g, people[i] ?? '#ccc', () => g.arc(x, 48, 6, 0, Math.PI * 2));
    fill(g, people[5 - i] ?? '#ccc', () => g.arc(x + 4, 86, 6, 0, Math.PI * 2));
  }
  fill(g, '#F2C14E', () => g.arc(80, 18, 6, 0, Math.PI * 2));
}

/** Pressed flowers, one for every grandchild. */
function garden(g: CanvasRenderingContext2D): void {
  g.fillStyle = '#F4EBDD';
  g.fillRect(0, 0, W, H);
  const petals = [
    '#E86A92',
    '#F2C14E',
    '#8E7CC3',
    '#E8604C',
    '#6FB3D2',
    '#F29E4C',
    '#B5D99C',
    '#D96C8E',
  ];
  petals.forEach((color, i) => {
    const x = 20 + (i % 4) * 38;
    const y = 30 + Math.floor(i / 4) * 50;
    g.strokeStyle = '#4E8A55';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 2, y + 30);
    g.stroke();
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      fill(g, color, () =>
        g.ellipse(x + Math.cos(a) * 7, y + Math.sin(a) * 7, 6, 4, a, 0, Math.PI * 2),
      );
    }
    fill(g, '#FFE9A8', () => g.arc(x, y, 3, 0, Math.PI * 2));
  });
}

/* ---------- The hall's gallery. Portraits are 120 x 160, drawn as dignified silhouettes. ---------- */

const PW = H;
const PH = W;

/** A painted bust: dark background with a soft light, shoulders in a coat, an oval face. */
function bust(
  g: CanvasRenderingContext2D,
  background: [string, string],
  coat: string,
  skin = '#d9a07a',
) {
  const light = g.createRadialGradient(PW / 2, PH * 0.38, 10, PW / 2, PH * 0.45, PH * 0.7);
  light.addColorStop(0, background[0]);
  light.addColorStop(1, background[1]);
  g.fillStyle = light;
  g.fillRect(0, 0, PW, PH);
  fill(g, coat, () => {
    g.moveTo(8, PH);
    g.quadraticCurveTo(14, PH * 0.66, PW / 2, PH * 0.62);
    g.quadraticCurveTo(PW - 14, PH * 0.66, PW - 8, PH);
  });
  fill(g, skin, () => g.rect(PW / 2 - 9, PH * 0.5, 18, 22));
  fill(g, skin, () => g.ellipse(PW / 2, PH * 0.42, 22, 28, 0, 0, Math.PI * 2));
  // A soft shadow on one side of the face, as in an oil portrait.
  fill(g, 'rgba(60, 30, 20, 0.22)', () =>
    g.ellipse(PW / 2 + 9, PH * 0.44, 12, 26, 0, 0, Math.PI * 2),
  );
}

/** In a dark suit and white collar, with the kalpak fur hat of the 1920s. */
function ataturk(g: CanvasRenderingContext2D): void {
  bust(g, ['#8a8f99', '#2a2d33'], '#1f2226', '#e2b896');
  fill(g, '#f3f1ea', () => {
    g.moveTo(PW / 2 - 14, PH * 0.62);
    g.lineTo(PW / 2, PH * 0.75);
    g.lineTo(PW / 2 + 14, PH * 0.62);
  });
  fill(g, '#3a3f46', () => {
    g.moveTo(PW / 2 - 3, PH * 0.64);
    g.lineTo(PW / 2 + 3, PH * 0.64);
    g.lineTo(PW / 2, PH * 0.82);
  });
  // The kalpak: a tall, slightly tapered fur hat.
  fill(g, '#2b2622', () => {
    g.moveTo(PW / 2 - 24, PH * 0.33);
    g.lineTo(PW / 2 - 20, PH * 0.12);
    g.quadraticCurveTo(PW / 2, PH * 0.08, PW / 2 + 20, PH * 0.12);
    g.lineTo(PW / 2 + 24, PH * 0.33);
  });
  g.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  for (let y = PH * 0.14; y < PH * 0.32; y += 4) {
    g.beginPath();
    g.moveTo(PW / 2 - 20, y);
    g.lineTo(PW / 2 + 20, y);
    g.stroke();
  }
  fill(g, '#5a4a3c', () => {
    g.rect(PW / 2 - 18, PH * 0.36, 12, 3);
    g.rect(PW / 2 + 6, PH * 0.36, 12, 3);
  });
}

/** In the blue coat with gold epaulettes, under the famous bicorne worn sideways. */
function napoleon(g: CanvasRenderingContext2D): void {
  bust(g, ['#9c7a52', '#3b2a1c'], '#24325e');
  fill(g, '#f3efe3', () => g.rect(PW / 2 - 12, PH * 0.6, 24, 16));
  for (const side of [-1, 1]) {
    fill(g, '#d8b04c', () => g.ellipse(PW / 2 + side * 38, PH * 0.7, 14, 6, 0, 0, Math.PI * 2));
  }
  fill(g, '#c8a04a', () => {
    g.rect(PW / 2 - 2, PH * 0.78, 4, 4);
    g.rect(PW / 2 - 2, PH * 0.86, 4, 4);
  });
  // The bicorne, worn side-on.
  fill(g, '#16161a', () => {
    g.moveTo(PW / 2 - 40, PH * 0.29);
    g.quadraticCurveTo(PW / 2, PH * 0.02, PW / 2 + 40, PH * 0.29);
    g.quadraticCurveTo(PW / 2, PH * 0.22, PW / 2 - 40, PH * 0.29);
  });
  fill(g, '#c0392b', () => g.arc(PW / 2 + 22, PH * 0.2, 4, 0, Math.PI * 2));
}

/** In a green and gold robe and a pointed helmet, before the blue domes of Samarkand. */
function timur(g: CanvasRenderingContext2D): void {
  bust(g, ['#e8c98f', '#7a5a34'], '#2f6b4a', '#c99070');
  // A dome and a minaret far behind.
  fill(g, '#2f7fc1', () => g.ellipse(22, PH * 0.42, 16, 20, 0, Math.PI, 0));
  fill(g, '#d9c08a', () => g.rect(6, PH * 0.42, 32, 30));
  fill(g, '#d9c08a', () => g.rect(PW - 20, PH * 0.2, 8, 60));
  // The robe's gold edge.
  g.strokeStyle = '#d8b04c';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(PW / 2 - 8, PH * 0.63);
  g.lineTo(PW / 2 + 6, PH);
  g.stroke();
  // Beard and helmet.
  fill(g, '#3a2a20', () => g.ellipse(PW / 2, PH * 0.53, 15, 12, 0, 0, Math.PI));
  fill(g, '#9aa1a8', () => {
    g.moveTo(PW / 2 - 24, PH * 0.33);
    g.quadraticCurveTo(PW / 2 - 22, PH * 0.16, PW / 2, PH * 0.06);
    g.quadraticCurveTo(PW / 2 + 22, PH * 0.16, PW / 2 + 24, PH * 0.33);
  });
  fill(g, '#d8b04c', () => g.rect(PW / 2 - 24, PH * 0.31, 48, 4));
}

/** Night after the earthquake: rubble, and the lamps of the people digging. */
function marmara(g: CanvasRenderingContext2D): void {
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0f1424');
  sky.addColorStop(1, '#2a2a3a');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  // Broken buildings against the sky.
  g.fillStyle = '#1b1d26';
  for (const [x, w, h, tilt] of [
    [10, 26, 50, -0.12],
    [44, 30, 38, 0.18],
    [86, 24, 56, 0],
    [118, 34, 30, -0.2],
  ] as const) {
    g.save();
    g.translate(x + w / 2, H - 40);
    g.rotate(tilt);
    g.fillRect(-w / 2, -h, w, h);
    g.restore();
  }
  fill(g, '#3a3530', () => {
    g.moveTo(0, H);
    g.lineTo(0, H - 34);
    for (let x = 0; x <= W; x += 16) g.lineTo(x, H - 30 - ((x * 7) % 13));
    g.lineTo(W, H);
  });
  // Warm lamps: the volunteers, many of them.
  for (let i = 0; i < 26; i++) {
    const x = (i * 37) % W;
    const y = H - 18 - ((i * 13) % 20);
    const glow = g.createRadialGradient(x, y, 0, x, y, 10);
    glow.addColorStop(0, 'rgba(255, 214, 140, 0.9)');
    glow.addColorStop(1, 'rgba(255, 214, 140, 0)');
    g.fillStyle = glow;
    g.fillRect(x - 10, y - 10, 20, 20);
  }
}

/** Tokyo rising again after the 1923 earthquake: a calm dawn over the rebuilt city. */
function kanto(g: CanvasRenderingContext2D): void {
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#f2b880');
  sky.addColorStop(1, '#f6e2c6');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  fill(g, '#e8604c', () => g.arc(112, 40, 16, 0, Math.PI * 2));
  // Rooftops, some new and some still in scaffolding.
  g.fillStyle = '#4a3a34';
  for (let x = 0; x < W; x += 20) {
    const h = 24 + ((x * 3) % 22);
    g.fillRect(x, H - h, 18, h);
    fill(g, '#5a4a42', () => {
      g.moveTo(x - 3, H - h);
      g.lineTo(x + 9, H - h - 8);
      g.lineTo(x + 21, H - h);
    });
    g.fillStyle = '#4a3a34';
  }
  g.strokeStyle = '#8a6a4a';
  g.lineWidth = 1;
  for (let y = H - 60; y < H - 30; y += 6) {
    g.beginPath();
    g.moveTo(60, y);
    g.lineTo(78, y);
    g.stroke();
  }
}

/** Vesuvius smoking over the columns of Pompeii. */
function pompeii(g: CanvasRenderingContext2D): void {
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#6b5a6e');
  sky.addColorStop(1, '#e0a77a');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  fill(g, '#5a4636', () => {
    g.moveTo(30, H - 30);
    g.lineTo(80, 36);
    g.lineTo(96, 36);
    g.lineTo(150, H - 30);
  });
  // The plume, rising like a pine tree as Pliny described it.
  fill(g, 'rgba(70, 60, 60, 0.85)', () => g.rect(84, 6, 8, 32));
  fill(g, 'rgba(80, 70, 70, 0.85)', () => g.ellipse(88, 10, 40, 12, 0, 0, Math.PI * 2));
  fill(g, '#d9c8a8', () => g.rect(0, H - 32, W, 32));
  g.fillStyle = '#efe4cc';
  for (let x = 12; x < W; x += 22) g.fillRect(x, H - 58, 6, 30);
  g.fillRect(6, H - 62, W - 12, 5);
}

/** In the order of PAINTINGS. */
const ART: readonly ((g: CanvasRenderingContext2D) => void)[] = [
  kiteDay,
  handsTogether,
  nightShift,
  bosphorus,
  abstractBlue,
  firstSnow,
  longTable,
  garden,
  ataturk,
  napoleon,
  timur,
  marmara,
  kanto,
  pompeii,
];
