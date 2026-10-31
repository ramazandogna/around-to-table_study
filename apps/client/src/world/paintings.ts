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
import { PAINTINGS } from '../content/discoveries';

/** Where paintings hang: on the north wall (x along it) or the west wall (z along it), and how high. */
type Spot = { wall: 'north' | 'west'; at: number; height: number; width: number };

const SPOTS: Record<AreaId, readonly Spot[]> = {
  // Above the wall shelves and along the quiet west wall.
  library: [
    { wall: 'north', at: 2.5, height: 2.05, width: 0.7 },
    { wall: 'north', at: 8, height: 2.05, width: 0.9 },
    { wall: 'north', at: 13, height: 2.05, width: 0.6 },
    { wall: 'west', at: 6.5, height: 1.45, width: 0.8 },
    { wall: 'west', at: 9.2, height: 1.5, width: 0.6 },
  ],
  hall: [
    { wall: 'north', at: 3.5, height: 1.5, width: 0.9 },
    { wall: 'north', at: 14.2, height: 1.5, width: 0.7 },
    { wall: 'west', at: 2.5, height: 1.5, width: 0.8 },
  ],
  smoking: [
    { wall: 'north', at: 5.5, height: 1.5, width: 0.8 },
    { wall: 'north', at: 11, height: 1.55, width: 0.6 },
    { wall: 'west', at: 6.5, height: 1.5, width: 0.7 },
  ],
};

/** Each room starts at its own place in the list, so no painting hangs twice. */
const FIRST: Record<AreaId, number> = { library: 0, hall: 5, smoking: 2 };

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
    const painting = (FIRST[area] + i) % PAINTINGS.length;
    const ratio = 0.75;
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

/** A small canvas painting that matches its story. */
function paint(index: number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
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
];
