import {
  CANDLE_LIT_AT,
  candleCount,
  type AreaGrid,
  type Candle,
  type TableGroup,
} from '@att/shared';
import {
  AdditiveBlending,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  type Object3D,
} from 'three';
import { FLOOR_Y, TABLE_HEIGHT } from './buildArea';

/**
 * A candle on every study table. It burns while two or more people at that
 * table run a timer, and the flame grows with each one more. No light is
 * cast (a light per table would cost every frame): the flame is a bright
 * unlit drop with a soft additive glow around it, flickering gently. During
 * a table hour every flame burns a deeper, rosier gold.
 */
export type Candles = {
  root: Object3D;
  /** The room's candles as last sent, and the server clock's lead over this device. */
  set: (candles: readonly Candle[], clockOffset: number) => void;
  setTableHour: (on: boolean) => void;
  update: (delta: number) => void;
  /** How many tables burn now (for tests and the welcome line). */
  lit: () => number;
  dispose: () => void;
};

const FLAME = { normal: 0xffd27a, hour: 0xff9a5c } as const;
const GLOW = { normal: 0xffc266, hour: 0xff7f50 } as const;
/** How often the counts are checked against the clock (a timer that ran out puts its part out). */
const RECOUNT_SECONDS = 1;
const MAX_GROWTH = 5;

const still = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A round, soft glow drawn once on a small canvas. */
function glowTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (g) {
    const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(0.25, 'rgba(255,255,255,0.35)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gradient;
    g.fillRect(0, 0, size, size);
  }
  return new CanvasTexture(canvas);
}

/** Where a table's candle stands: beside the middle, clear of the lamp and the places. */
export function candleSpot(group: TableGroup): { x: number; z: number } {
  const xs = group.tables.map((t) => t.x);
  const ys = group.tables.map((t) => t.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const wide = maxX - minX >= maxY - minY;
  const cx = (minX + maxX + 1) / 2;
  const cz = (minY + maxY + 1) / 2;
  return wide ? { x: cx + 0.34, z: cz } : { x: cx, z: cz + 0.34 };
}

export function createCandles(grid: AreaGrid, groups: readonly TableGroup[]): Candles {
  const root = new Group();
  root.name = 'candles';
  const saucerGeometry = new CylinderGeometry(0.07, 0.075, 0.014, 12);
  const waxGeometry = new CylinderGeometry(0.03, 0.032, 0.1, 10);
  const wickGeometry = new CylinderGeometry(0.003, 0.003, 0.02, 4);
  const flameGeometry = new SphereGeometry(0.02, 8, 6);
  const brass = new MeshStandardMaterial({ color: 0xc89b4a, roughness: 0.5, metalness: 0.3 });
  const wax = new MeshStandardMaterial({ color: 0xf6ecd6, roughness: 0.9 });
  const wick = new MeshStandardMaterial({ color: 0x2b2420 });
  const flame = new MeshBasicMaterial({ color: FLAME.normal });
  const texture = glowTexture();
  const glow = new SpriteMaterial({
    map: texture,
    color: GLOW.normal,
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.75,
  });

  type One = { table: number; flame: Mesh; glow: Sprite; count: number; phase: number };
  const ones = new Map<number, One>();
  const top = FLOOR_Y + TABLE_HEIGHT;
  for (const group of groups) {
    // A table still behind the renovation tape gets its candle when it opens.
    if (group.tables.some((t) => grid.isLockedRenovation(t))) continue;
    const spot = candleSpot(group);
    const candle = new Group();
    candle.position.set(spot.x, top, spot.z);
    const saucer = new Mesh(saucerGeometry, brass);
    saucer.position.y = 0.007;
    const body = new Mesh(waxGeometry, wax);
    body.position.y = 0.014 + 0.05;
    body.castShadow = true;
    const string = new Mesh(wickGeometry, wick);
    string.position.y = 0.124;
    const fire = new Mesh(flameGeometry, flame);
    fire.position.y = 0.15;
    fire.visible = false;
    const halo = new Sprite(glow);
    halo.position.y = 0.15;
    halo.scale.setScalar(0.3);
    halo.visible = false;
    candle.add(saucer, body, string, fire, halo);
    root.add(candle);
    ones.set(group.index, {
      table: group.index,
      flame: fire,
      glow: halo,
      count: 0,
      phase: group.index * 1.7,
    });
  }

  let latest: readonly Candle[] = [];
  let offset = 0;
  let recount = 0;
  let clock = 0;
  const calm = still();

  const recountAll = () => {
    const now = Date.now() + offset;
    for (const one of ones.values()) {
      const candle = latest.find((c) => c.table === one.table);
      one.count = candle ? candleCount(candle, now) : 0;
      const on = one.count >= CANDLE_LIT_AT;
      one.flame.visible = on;
      one.glow.visible = on;
    }
  };

  return {
    root,
    set(candles, clockOffset) {
      latest = candles;
      offset = clockOffset;
      recountAll();
    },
    setTableHour(on) {
      flame.color.setHex(on ? FLAME.hour : FLAME.normal);
      glow.color.setHex(on ? GLOW.hour : GLOW.normal);
    },
    update(delta) {
      clock += delta;
      recount -= delta;
      if (recount <= 0) {
        recount = RECOUNT_SECONDS;
        recountAll();
      }
      for (const one of ones.values()) {
        if (one.count < CANDLE_LIT_AT) continue;
        // Each one more person at the table makes the flame a little taller and brighter.
        const grow = 1 + 0.22 * (Math.min(one.count, MAX_GROWTH) - CANDLE_LIT_AT);
        const t = clock * 7 + one.phase;
        const flicker = calm ? 1 : 1 + 0.08 * Math.sin(t) + 0.05 * Math.sin(t * 2.3 + 1);
        one.flame.scale.set(grow, grow * 1.9 * flicker, grow);
        one.flame.position.y = 0.13 + 0.02 * grow * flicker;
        one.glow.scale.setScalar(0.3 * grow * (calm ? 1 : 0.94 + 0.06 * flicker));
      }
    },
    lit: () => [...ones.values()].filter((o) => o.count >= CANDLE_LIT_AT).length,
    dispose() {
      root.removeFromParent();
      for (const g of [saucerGeometry, waxGeometry, wickGeometry, flameGeometry]) g.dispose();
      for (const m of [brass, wax, wick, flame, glow]) m.dispose();
      texture.dispose();
    },
  };
}
