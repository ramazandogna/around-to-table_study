import type { AreaId } from '@att/shared';
import { CanvasTexture, SRGBColorSpace } from 'three';

/** Texture pixels per tile: enough for plank seams and grain to read up close. */
const PX = 64;

/** A seeded random number generator, so a room's floor is the same for everyone and every visit. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rgb = readonly [number, number, number];

const shade = ([r, g, b]: Rgb, amount: number) =>
  `rgb(${Math.round(r * amount)}, ${Math.round(g * amount)}, ${Math.round(b * amount)})`;

/**
 * Painted floors, one canvas per room, `width` by `depth` tiles:
 * - library: warm oak strip parquet, every plank its own tone, with grain and seams
 * - hall: polished stone tiles with soft veins and thin grout
 * - smoking room: wide, dark walnut boards
 */
export function floorTexture(area: AreaId, width: number, depth: number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width * PX;
  canvas.height = depth * PX;
  const g = canvas.getContext('2d');
  if (g) {
    const random = seeded(area.length * 7919 + width * 31 + depth);
    if (area === 'hall') stoneTiles(g, width, depth, random);
    else if (area === 'library') planks(g, width, depth, random, OAK);
    else planks(g, width, depth, random, WALNUT);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

type Wood = {
  tones: readonly Rgb[];
  /** Plank width across the boards, in tiles. */
  board: number;
  seam: string;
};

const OAK: Wood = {
  tones: [
    [176, 122, 76],
    [166, 112, 68],
    [188, 134, 86],
    [158, 104, 62],
    [182, 128, 80],
    [150, 98, 58],
  ],
  board: 0.25,
  seam: 'rgba(60, 34, 18, 0.55)',
};

const WALNUT: Wood = {
  tones: [
    [118, 76, 50],
    [104, 66, 43],
    [128, 84, 55],
    [96, 60, 40],
  ],
  board: 0.4,
  seam: 'rgba(30, 16, 8, 0.6)',
};

/** Boards running across the room in staggered lengths, like a real strip floor. */
function planks(
  g: CanvasRenderingContext2D,
  width: number,
  depth: number,
  random: () => number,
  wood: Wood,
): void {
  const boardPx = wood.board * PX;
  const rows = Math.ceil((depth * PX) / boardPx);
  for (let row = 0; row < rows; row++) {
    const y = row * boardPx;
    let x = -random() * 2 * PX;
    while (x < width * PX) {
      const length = (1.2 + random() * 1.6) * PX;
      const tone = wood.tones[Math.floor(random() * wood.tones.length)] ?? wood.tones[0];
      if (!tone) break;
      const light = 0.94 + random() * 0.12;
      g.fillStyle = shade(tone, light);
      g.fillRect(x, y, length, boardPx);
      // Grain: thin wavy lines along the board.
      g.strokeStyle = shade(tone, light * 0.86);
      g.lineWidth = 1;
      for (let line = 0; line < 3; line++) {
        const gy = y + (line + 0.5 + random() * 0.5) * (boardPx / 3.5);
        g.beginPath();
        g.moveTo(x, gy);
        for (let gx = x; gx <= x + length; gx += 12) {
          g.lineTo(gx, gy + Math.sin(gx * 0.05 + row) * 1.2);
        }
        g.stroke();
      }
      // A knot now and then.
      if (random() < 0.12) {
        g.fillStyle = shade(tone, 0.72);
        g.beginPath();
        g.ellipse(x + random() * length, y + boardPx / 2, 4, 2, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = wood.seam;
      g.fillRect(x, y, 2, boardPx);
      x += length;
    }
    g.fillStyle = wood.seam;
    g.fillRect(0, y, width * PX, 1.5);
  }
  // A soft sheen towards the windows, so the floor is not flat colour.
  const sheen = g.createLinearGradient(0, 0, width * PX, depth * PX);
  sheen.addColorStop(0, 'rgba(255, 236, 200, 0.1)');
  sheen.addColorStop(1, 'rgba(40, 20, 10, 0.1)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, width * PX, depth * PX);
}

const STONE: readonly Rgb[] = [
  [222, 214, 200],
  [214, 205, 190],
  [228, 221, 208],
  [208, 199, 184],
];

function stoneTiles(
  g: CanvasRenderingContext2D,
  width: number,
  depth: number,
  random: () => number,
): void {
  for (let ty = 0; ty < depth; ty++) {
    for (let tx = 0; tx < width; tx++) {
      const tone = STONE[Math.floor(random() * STONE.length)] ?? [220, 212, 198];
      g.fillStyle = shade(tone, 0.97 + random() * 0.06);
      g.fillRect(tx * PX, ty * PX, PX, PX);
      // Soft veins across the stone.
      g.strokeStyle = `rgba(150, 138, 120, ${0.18 + random() * 0.15})`;
      g.lineWidth = 1;
      g.beginPath();
      let vx = tx * PX + random() * PX;
      let vy = ty * PX;
      g.moveTo(vx, vy);
      while (vy < (ty + 1) * PX) {
        vx += (random() - 0.5) * 14;
        vy += 6 + random() * 8;
        g.lineTo(vx, Math.min(vy, (ty + 1) * PX));
      }
      g.stroke();
    }
  }
  g.fillStyle = 'rgba(120, 108, 92, 0.6)';
  for (let tx = 0; tx <= width; tx++) g.fillRect(tx * PX - 1, 0, 2, depth * PX);
  for (let ty = 0; ty <= depth; ty++) g.fillRect(0, ty * PX - 1, width * PX, 2);
}
