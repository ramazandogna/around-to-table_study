import { TILE, type AreaGrid } from '@att/shared';

/** Texture pixels per tile: one for the grid line, three for the tile itself. */
const CELL = 4;
/** The camera looks down at about 37°, so the floor is squashed to this on screen. */
const SQUASH = 0.6;

const FLOOR: Record<string, string> = {
  hall: '#dccfb8',
  library: '#c48e5a',
  smoking: '#94603f',
};

const TILE_COLOR: Partial<Record<string, string>> = {
  [TILE.wall]: '#4a3426',
  [TILE.bookcase]: '#6e4326',
  [TILE.table]: '#e0b277',
  [TILE.seat]: '#f3d7a1',
  [TILE.plant]: '#5d8f4a',
  [TILE.receptionDesk]: '#8b5e3c',
  [TILE.bench]: '#8a73b0',
  [TILE.ashtray]: '#a39a90',
  [TILE.elevator]: '#8d8d96',
  [TILE.doorToHall]: '#f2c230',
  [TILE.doorToLibrary]: '#f2c230',
  [TILE.doorToSmoking]: '#f2c230',
  [TILE.entrance]: '#f2c230',
  [TILE.noticeBoard]: '#d0523f',
};

const shade = (hex: string, amount: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * amount)));
  return `rgb(${c(n >> 16)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
};

export type MapPerson = { x: number; z: number; kind: 'me' | 'friend' | 'other' };

/**
 * A small map of the room in the top corner, turned like the room on screen
 * (so the up key walks up the map too), drawn in crisp squares like a farm
 * game's map: furniture in colour, doors in gold, the closed part hatched,
 * you in orange and everyone else as dots.
 */
export class Minimap {
  readonly canvas = document.createElement('canvas');
  private tiles: HTMLCanvasElement | null = null;
  private size = { w: 0, h: 0 };

  constructor() {
    this.canvas.className = 'minimap-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
  }

  /** Paints the room's tiles once; people are drawn over them on every `draw`. */
  setGrid(grid: AreaGrid): void {
    const { width: W, height: H } = grid;
    const tiles = document.createElement('canvas');
    tiles.width = W * CELL;
    tiles.height = H * CELL;
    const g = tiles.getContext('2d');
    if (!g) return;
    const floor = FLOOR[grid.area.id] ?? '#c48e5a';
    const rugs = grid.area.rugs;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const tile = grid.tileAt({ x, y });
        const onRug = rugs.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
        let color = TILE_COLOR[tile] ?? (onRug ? shade(floor, 0.82) : floor);
        if (grid.isLockedRenovation({ x, y })) color = (x + y) % 2 ? '#3d322a' : '#4d4036';
        g.fillStyle = shade(color, 0.78);
        g.fillRect(x * CELL, y * CELL, CELL, CELL);
        g.fillStyle = color;
        g.fillRect(x * CELL + 1, y * CELL + 1, CELL - 1, CELL - 1);
      }
    }
    this.tiles = tiles;
    this.size = { w: W, h: H };
  }

  draw(people: readonly MapPerson[]): void {
    const tiles = this.tiles;
    const canvas = this.canvas;
    const g = canvas.getContext('2d');
    if (!tiles || !g) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || 200;
    const cssH = canvas.clientHeight || 120;
    if (canvas.width !== Math.round(cssW * ratio) || canvas.height !== Math.round(cssH * ratio)) {
      canvas.width = Math.round(cssW * ratio);
      canvas.height = Math.round(cssH * ratio);
    }
    const { w: W, h: H } = this.size;
    const span = W + H;
    // a: pixels per tile along screen x; the floor's diamond fits the box.
    const a = Math.min(canvas.width / span, canvas.height / (span * SQUASH)) * 0.96;
    const b = a * SQUASH;
    const ox = canvas.width / 2 - ((W - H) * a) / 2;
    const oy = (canvas.height - span * b) / 2;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    // World x runs right and down on screen, world z left and down.
    g.setTransform(a / CELL, b / CELL, -a / CELL, b / CELL, ox, oy);
    g.imageSmoothingEnabled = false;
    g.drawImage(tiles, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);

    const toScreen = (x: number, z: number) => ({ x: ox + (x - z) * a, y: oy + (x + z) * b });
    const dot = Math.max(2.5, a * 0.75);
    // Others first, so you are always drawn on top.
    const order = [...people].sort((p, q) => Number(p.kind === 'me') - Number(q.kind === 'me'));
    for (const person of order) {
      const { x, y } = toScreen(person.x, person.z);
      g.beginPath();
      g.arc(x, y, person.kind === 'me' ? dot * 1.35 : dot, 0, Math.PI * 2);
      g.fillStyle =
        person.kind === 'me' ? '#ff8a2a' : person.kind === 'friend' ? '#6fcf5a' : '#f6f0e2';
      g.fill();
      g.lineWidth = Math.max(1, ratio);
      g.strokeStyle = '#2b1a10';
      g.stroke();
    }
  }
}

/** One map for the whole game; the HUD shows its canvas and the world draws on it. */
export const minimap = new Minimap();
