import { LOOK_OPTIONS, type Appearance } from '@att/shared';
import { CanvasTexture, SRGBColorSpace } from 'three';

/**
 * Paints a character texture from a look, in the flat style of Kenney's skins.
 * Coordinates are on Kenney's 1024 px layout (measured by rendering a labeled grid):
 * - head: x 0–640 wraps around the head with the face centered at x 320; the
 *   forehead is near y 150, the chin near y 320 and the top of the head at y 0
 * - torso: x 0–640, y 490–1024; the front runs down from the shoulders at y 768,
 *   the back runs up from y 672 (upside down), sleeves sit at x < 150 and x > 490
 * - legs: x 611–1024, y 764–1024, waist at the top, ankles at the bottom
 * - shoes: x 639–824, y 134–524; soles across the top right
 * Everything else (neck, hands) stays skin.
 */
const LAYOUT = 1024;
const SIZE = 512;
const FACE_X = 320;

const cache = new Map<string, CanvasTexture>();

export function skinTexture(look: Appearance): CanvasTexture {
  const key = JSON.stringify(look);
  let texture = cache.get(key);
  if (!texture) {
    texture = new CanvasTexture(paint(look));
    texture.colorSpace = SRGBColorSpace;
    cache.set(key, texture);
  }
  return texture;
}

function paint(look: Appearance): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  g.scale(SIZE / LAYOUT, SIZE / LAYOUT);

  const skin = LOOK_OPTIONS.skin[look.skin] ?? LOOK_OPTIONS.skin[0];
  const hair = LOOK_OPTIONS.hairColor[look.hairColor] ?? LOOK_OPTIONS.hairColor[0];
  g.fillStyle = skin;
  g.fillRect(0, 0, LAYOUT, LAYOUT);

  paintTop(
    g,
    LOOK_OPTIONS.top[look.top] ?? 'tee',
    LOOK_OPTIONS.topColor[look.topColor] ?? '#fff',
    skin,
  );
  paintBottom(
    g,
    LOOK_OPTIONS.bottom[look.bottom] ?? 'jeans',
    LOOK_OPTIONS.bottomColor[look.bottomColor] ?? '#333',
    skin,
  );
  paintShoes(g);
  paintHead(g, LOOK_OPTIONS.hair[look.hair] ?? 'short', hair, skin);
  return canvas;
}

type Ctx = CanvasRenderingContext2D;

function paintTop(g: Ctx, style: string, color: string, skin: string): void {
  g.fillStyle = color;
  g.fillRect(0, 490, 640, 534);
  if (style === 'stripes') {
    g.fillStyle = shade(color, -0.28);
    for (let y = 500; y < LAYOUT; y += 44) g.fillRect(0, y, 640, 18);
  }
  // Ribbed hems at the waist, front (bottom) and back (top, upside down).
  g.fillStyle = shade(color, -0.14);
  g.fillRect(150, 490, 340, 16);
  g.fillRect(150, 1004, 340, 20);
  if (style === 'tee' || style === 'stripes') {
    // Short sleeves: forearms are skin, with a sleeve edge.
    g.fillStyle = skin;
    g.fillRect(0, 490, 92, 534);
    g.fillRect(548, 490, 92, 534);
    g.fillStyle = shade(color, -0.14);
    g.fillRect(92, 490, 10, 534);
    g.fillRect(538, 490, 10, 534);
  } else {
    g.fillStyle = shade(color, -0.14);
    g.fillRect(0, 490, 20, 534);
    g.fillRect(620, 490, 20, 534);
  }
  if (style === 'hoodie') {
    g.fillStyle = shade(color, -0.1);
    roundRect(g, FACE_X - 72, 900, 144, 74, 18);
    g.fill();
    g.strokeStyle = shade(color, 0.35);
    g.lineWidth = 6;
    for (const x of [FACE_X - 22, FACE_X + 22]) line(g, x, 770, x, 840);
  }
  // Neckline around the neck, where front and back meet over the shoulders.
  g.fillStyle = skin;
  g.beginPath();
  g.ellipse(FACE_X, 720, 64, 44, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = style === 'hoodie' ? shade(color, -0.2) : shade(color, -0.16);
  g.lineWidth = style === 'hoodie' ? 26 : 12;
  g.stroke();
}

function paintBottom(g: Ctx, style: string, color: string, skin: string): void {
  g.fillStyle = color;
  g.fillRect(611, 764, 413, 260);
  // Waistband and belt.
  g.fillStyle = shade(color, -0.22);
  g.fillRect(611, 764, 413, 30);
  if (style === 'shorts') {
    g.fillStyle = skin;
    g.fillRect(611, 900, 413, 124);
    g.fillStyle = shade(color, -0.12);
    g.fillRect(611, 888, 413, 12);
    return;
  }
  if (style === 'jeans') {
    // Light stitching down the legs and turned-up cuffs.
    g.strokeStyle = shade(color, 0.35);
    g.lineWidth = 3;
    g.setLineDash([10, 8]);
    for (const x of [700, 770, 870, 940]) line(g, x, 800, x, 990);
    g.setLineDash([]);
    g.fillStyle = shade(color, 0.18);
    g.fillRect(611, 994, 413, 30);
  } else {
    g.strokeStyle = shade(color, -0.12);
    g.lineWidth = 4;
    for (const x of [704, 896]) line(g, x, 800, x, 1024);
  }
}

function paintShoes(g: Ctx): void {
  g.fillStyle = '#3B2D25';
  g.fillRect(639, 134, 185, 390);
  g.fillStyle = '#EFE8DD';
  g.fillRect(639, 0, 385, 134);
  // Laces on top of each shoe.
  g.fillStyle = '#EFE8DD';
  for (const top of [190, 365]) {
    for (let i = 0; i < 3; i++) g.fillRect(712, top + i * 22, 44, 8);
  }
}

/** Where hair ends, as points from the back of the head (x 0) to the face (x 320); mirrored. */
const HAIR_EDGE: Record<string, readonly [number, number][]> = {
  short: [
    [0, 215],
    [110, 212],
    [170, 192],
    [215, 168],
    [248, 150],
    [290, 162],
    [320, 152],
  ],
  long: [
    [0, 420],
    [120, 390],
    [196, 352],
    [226, 330],
    [240, 176],
    [280, 152],
    [320, 148],
  ],
  bob: [
    [0, 310],
    [170, 306],
    [214, 296],
    [234, 178],
    [280, 156],
    [320, 152],
  ],
  curly: [
    [0, 340],
    [150, 320],
    [212, 300],
    [236, 168],
    [282, 146],
    [320, 142],
  ],
  tied: [
    [0, 430],
    [46, 420],
    [90, 250],
    [170, 196],
    [218, 168],
    [250, 152],
    [320, 142],
  ],
  buzz: [
    [0, 160],
    [180, 150],
    [250, 128],
    [320, 118],
  ],
  bald: [],
};

function paintHead(g: Ctx, style: string, hair: string, skin: string): void {
  // Neck and the underside of the head.
  g.fillStyle = shade(skin, -0.06);
  g.fillRect(0, 330, 640, 160);

  for (const x of [190, 450]) {
    g.fillStyle = shade(skin, -0.08);
    g.beginPath();
    g.ellipse(x, 236, 20, 27, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = shade(skin, -0.18);
    g.beginPath();
    g.ellipse(x, 238, 8, 13, 0, 0, Math.PI * 2);
    g.fill();
  }

  const edge = hairEdge(style);
  if (edge.length) {
    g.fillStyle = hair;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(640, 0);
    for (let i = edge.length - 1; i >= 0; i--) {
      const [x, y] = edge[i] ?? [0, 0];
      g.lineTo(x, y);
    }
    g.closePath();
    g.globalAlpha = style === 'buzz' ? 0.85 : 1;
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = shade(hair, -0.2);
    g.lineWidth = 8;
    g.beginPath();
    edge.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    if (style === 'curly') {
      g.fillStyle = shade(hair, 0.12);
      for (let y = 30; y < 300; y += 46) {
        for (let x = (y / 46) % 2 ? 0 : 23; x < 640; x += 46) {
          if (y > edgeAt(edge, x) - 20) continue;
          g.beginPath();
          g.arc(x, y, 9, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    if (style === 'tied') {
      // The hair tie at the back of the head.
      g.fillStyle = shade(hair, -0.35);
      g.fillRect(0, 262, 64, 18);
      g.fillRect(576, 262, 64, 18);
    }
    // A soft shine on top.
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.beginPath();
    g.ellipse(FACE_X, 70, 150, 26, 0, 0, Math.PI * 2);
    g.fill();
  }

  // Face: brows in the hair color, dark eyes with a glint, nose, smile and cheeks.
  g.fillStyle = 'rgba(232, 120, 110, 0.22)';
  for (const x of [266, 374]) {
    g.beginPath();
    g.arc(x, 260, 15, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = style === 'bald' || style === 'buzz' ? shade(skin, -0.45) : shade(hair, -0.05);
  roundRect(g, 268, 192, 34, 9, 4);
  g.fill();
  roundRect(g, 338, 192, 34, 9, 4);
  g.fill();
  for (const x of [286, 354]) {
    g.fillStyle = '#2A1D18';
    g.beginPath();
    g.ellipse(x, 222, 9, 11, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#FFFFFF';
    g.beginPath();
    g.arc(x + 3, 218, 3, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = shade(skin, -0.14);
  g.beginPath();
  g.ellipse(FACE_X, 247, 8, 5, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = shade(skin, -0.4);
  g.lineWidth = 5;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(FACE_X, 258, 13, 0.25 * Math.PI, 0.75 * Math.PI);
  g.stroke();
}

/** The hair edge for the whole width, mirrored around the face. */
function hairEdge(style: string): [number, number][] {
  const half = HAIR_EDGE[style] ?? [];
  if (!half.length) return [];
  const right = [...half]
    .reverse()
    .slice(1)
    .map(([x, y]) => [640 - x, y] as [number, number]);
  return [...half.map(([x, y]) => [x, y] as [number, number]), ...right];
}

function edgeAt(edge: [number, number][], x: number): number {
  for (let i = 1; i < edge.length; i++) {
    const [x0, y0] = edge[i - 1] ?? [0, 0];
    const [x1, y1] = edge[i] ?? [0, 0];
    if (x >= x0 && x <= x1) return y0 + ((y1 - y0) * (x - x0)) / Math.max(1, x1 - x0);
  }
  return 0;
}

function line(g: Ctx, x0: number, y0: number, x1: number, y1: number): void {
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}

function roundRect(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/** Lightens (amount > 0) or darkens (amount < 0) a hex color. */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = (n >> shift) & 255;
    const target = amount > 0 ? 255 : 0;
    return Math.round(c + (target - c) * Math.abs(amount));
  };
  return `rgb(${channel(16)} ${channel(8)} ${channel(0)})`;
}
