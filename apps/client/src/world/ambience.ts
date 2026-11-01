import type { DayPhase } from '@att/shared';
import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  SRGBColorSpace,
  type Material,
} from 'three';
import type { WindowSpot } from './flaws';

/**
 * The room's mood through the day and the year. The windows get panes that
 * show the sky of the hour (morning blue, golden afternoon, the town's lights
 * at dusk, the moon at night) and that the librarian opens and closes by day.
 * Lamps glow in the evening and at night. The cold months hang a heater under
 * every other window; summer a fan beside it. The light of the sun itself is the view's
 * (see `DAYLIGHT`).
 */

/** The sun and the sky's light for each part of the day, for `IsoView.setDaylight`. */
export const DAYLIGHT: Record<
  DayPhase,
  { sun: number; sunColor: number; sky: number; skyColor: number; ground: number }
> = {
  morning: { sun: 2.0, sunColor: 0xfff1dc, sky: 1.5, skyColor: 0xf4f6ff, ground: 0x5a4636 },
  day: { sun: 2.4, sunColor: 0xfffaf0, sky: 1.7, skyColor: 0xfff8ec, ground: 0x5a4636 },
  afternoon: { sun: 2.2, sunColor: 0xffd59a, sky: 1.4, skyColor: 0xffe2b0, ground: 0x6a4a30 },
  evening: { sun: 0.8, sunColor: 0xffa66b, sky: 0.95, skyColor: 0xc9b8e8, ground: 0x3e3040 },
  night: { sun: 0.35, sunColor: 0x9fb4e6, sky: 0.6, skyColor: 0x8a9cd0, ground: 0x241e2c },
};

/** How bright the lamps are: off by day, warm in the evening, all on at night. */
const LAMPS: Record<DayPhase, number> = {
  morning: 0,
  day: 0,
  afternoon: 0.15,
  evening: 1,
  night: 1.3,
};

/**
 * One shade for every lamp in the building, so the hour can light them all.
 * Shared like the furniture models; never disposed.
 */
export const LAMP_SHADE = new MeshStandardMaterial({
  name: 'lamp',
  color: '#f3e3bd',
  emissive: '#ffc970',
  emissiveIntensity: 0,
  roughness: 0.8,
});

/** The window's glass opening in the Kenney wall piece, per tile, in tiles. */
const PANE = { width: 0.27, bottom: 0.885, height: 1.12 };
/** An open window tilts in at the top this far. */
const OPEN_ANGLE = 0.42;

/** The sky of each part of the day on a narrow pane, drawn once per room. */
function skyTexture(phase: DayPhase, seed: number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 128;
  const c = canvas.getContext('2d');
  if (c) {
    const sky = c.createLinearGradient(0, 0, 0, 128);
    const colours: Record<DayPhase, [string, string]> = {
      morning: ['#8fc4ec', '#e9f4fb'],
      day: ['#6fb3ea', '#cfe9fa'],
      afternoon: ['#f2b765', '#fde6b5'],
      evening: ['#3a2f66', '#e9875a'],
      night: ['#0b1028', '#1f2a4a'],
    };
    const [top, bottom] = colours[phase];
    sky.addColorStop(0, top);
    sky.addColorStop(1, bottom);
    c.fillStyle = sky;
    c.fillRect(0, 0, 32, 128);
    const random = (n: number) => {
      const x = Math.sin(seed * 91.7 + n * 47.3) * 43758.5453;
      return x - Math.floor(x);
    };
    if (phase === 'morning' || phase === 'day') {
      // A few soft clouds.
      c.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 2; i++) {
        const y = 20 + random(i) * 50;
        c.beginPath();
        c.ellipse(8 + random(i + 3) * 16, y, 9, 4, 0, 0, Math.PI * 2);
        c.fill();
      }
    }
    if (phase === 'evening' || phase === 'night') {
      // The town across the street: dark roofs with lit windows.
      c.fillStyle = phase === 'night' ? '#070912' : '#241a30';
      for (let x = 0; x < 32; x += 8) {
        const h = 22 + random(x) * 26;
        c.fillRect(x, 128 - h, 8, h);
        c.fillStyle = '#ffd77a';
        for (let i = 0; i < 4; i++) {
          if (random(x + i * 7) < (phase === 'night' ? 0.45 : 0.6)) {
            c.fillRect(x + 2 + (i % 2) * 3, 128 - h + 4 + Math.floor(i / 2) * 7, 2, 3);
          }
        }
        c.fillStyle = phase === 'night' ? '#070912' : '#241a30';
      }
    }
    if (phase === 'night') {
      c.fillStyle = '#fffbe8';
      for (let i = 0; i < 10; i++) c.fillRect(random(i) * 32, random(i + 20) * 60, 1, 1);
      // The moon, reflected in the glass.
      c.fillStyle = '#f6efd0';
      c.beginPath();
      c.arc(20, 26, 6, 0, Math.PI * 2);
      c.fill();
    }
    if (phase === 'afternoon') {
      c.fillStyle = 'rgba(255,240,190,0.9)';
      c.beginPath();
      c.arc(10, 70, 7, 0, Math.PI * 2);
      c.fill();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export type Ambience = {
  setPhase: (phase: DayPhase) => void;
  /** Opens or closes a window (by its index in `windows`). */
  setWindowOpen: (index: number, open: boolean) => void;
  isWindowOpen: (index: number) => boolean;
  windows: readonly WindowSpot[];
  update: (delta: number) => void;
  dispose: () => void;
};

type Sash = { pivot: Group; open: boolean; angle: number };

export function buildAmbience(
  root: Group,
  windows: readonly WindowSpot[],
  floorLamps: readonly { x: number; z: number }[],
  laptop: { open: Group; closed: Mesh } | null,
  decor: 'heaters' | 'fans' | null,
  floorY: number,
  materials: Material[],
): Ambience {
  const textures = new Map<DayPhase, CanvasTexture>();
  const pane = new MeshStandardMaterial({
    roughness: 0.15,
    metalness: 0.1,
    emissiveIntensity: 0.55,
  });
  const frame = new MeshStandardMaterial({ color: '#d4a96c', roughness: 0.7 });
  materials.push(pane, frame);
  const sashes: Sash[] = windows.map((w) => {
    // Outer group faces into the room; the pivot hinges at the bottom of the opening.
    const outer = new Group();
    outer.position.set(w.x + w.normal.x * 0.02, floorY + PANE.bottom, w.z + w.normal.z * 0.02);
    outer.rotation.y = Math.atan2(w.normal.x, w.normal.z);
    // Wall pieces face along their normal; the opening sits in their middle.
    if (w.normal.z > 0) outer.position.z = 1 + 0.015;
    else outer.position.x = 1 + 0.015;
    const pivot = new Group();
    const glass = new Mesh(new BoxGeometry(PANE.width, PANE.height, 0.01), pane);
    glass.position.y = PANE.height / 2;
    pivot.add(glass);
    for (const [x, y, w2, h] of [
      [0, PANE.height, PANE.width + 0.03, 0.03],
      [0, 0, PANE.width + 0.03, 0.03],
      [-PANE.width / 2, PANE.height / 2, 0.03, PANE.height],
      [PANE.width / 2, PANE.height / 2, 0.03, PANE.height],
    ] as const) {
      const bar = new Mesh(new BoxGeometry(w2, h, 0.03), frame);
      bar.position.set(x, y, 0.005);
      pivot.add(bar);
    }
    outer.add(pivot);
    root.add(outer);
    return { pivot, open: false, angle: 0 };
  });

  const lights = floorLamps.map((lamp) => {
    const light = new PointLight(0xffc580, 0, 4.5, 1.6);
    light.position.set(lamp.x, floorY + 1.15, lamp.z);
    root.add(light);
    return light;
  });

  // Winter: a white panel heater under each window. Summer: a little fan beside it.
  const fans: Group[] = [];
  if (decor) {
    const white = new MeshStandardMaterial({ color: '#f1efe9', roughness: 0.5 });
    const dark = new MeshStandardMaterial({ color: '#3b3f46', roughness: 0.6 });
    const led = new MeshStandardMaterial({
      color: '#ff5b3b',
      emissive: '#ff3b1b',
      emissiveIntensity: 1,
    });
    materials.push(white, dark, led);
    windows.forEach((w, i) => {
      // Every other window, so the walls are not lined with them.
      if (i % 2 === 1) return;
      const along = { x: w.normal.z, z: w.normal.x };
      const inside = (d: number) => ({
        x: (w.normal.z > 0 ? w.x : 1) + w.normal.x * d,
        z: (w.normal.z > 0 ? 1 : w.z) + w.normal.z * d,
      });
      const item = new Group();
      if (decor === 'heaters') {
        const body = new Mesh(new BoxGeometry(0.62, 0.36, 0.06), white);
        body.position.y = 0.38;
        item.add(body);
        for (let f = -2; f <= 2; f++) {
          const fin = new Mesh(new BoxGeometry(0.02, 0.3, 0.02), white);
          fin.position.set(f * 0.11, 0.38, 0.035);
          item.add(fin);
        }
        const light = new Mesh(new BoxGeometry(0.025, 0.025, 0.01), led);
        light.position.set(0.26, 0.52, 0.035);
        item.add(light);
        const p = inside(0.04);
        item.position.set(p.x, floorY, p.z);
      } else {
        const cage = new Mesh(new CylinderGeometry(0.17, 0.17, 0.05, 20, 1, true), dark);
        cage.rotation.x = Math.PI / 2;
        cage.position.y = 1.95;
        const blades = new Group();
        for (let b = 0; b < 3; b++) {
          const blade = new Mesh(new BoxGeometry(0.06, 0.14, 0.01), white);
          blade.position.y = 0.07;
          const arm = new Group();
          arm.rotation.z = (b * Math.PI * 2) / 3;
          arm.add(blade);
          blades.add(arm);
        }
        blades.position.set(0, 1.95, 0.02);
        const mount = new Mesh(new BoxGeometry(0.06, 0.12, 0.06), dark);
        mount.position.set(0, 1.95, -0.04);
        item.add(cage, blades, mount);
        fans.push(blades);
        const p = inside(0.08);
        item.position.set(p.x + along.x * 0.75, floorY, p.z + along.z * 0.75);
      }
      item.rotation.y = Math.atan2(w.normal.x, w.normal.z);
      item.traverse((child) => {
        if (child instanceof Mesh) child.castShadow = true;
      });
      root.add(item);
    });
  }

  let phase: DayPhase | null = null;
  return {
    windows,
    setPhase: (next) => {
      if (next === phase) return;
      phase = next;
      let texture = textures.get(next);
      if (!texture) {
        texture = skyTexture(next, windows.length);
        textures.set(next, texture);
      }
      pane.map = texture;
      pane.emissiveMap = texture;
      pane.emissive.set('#ffffff');
      pane.emissiveIntensity = next === 'night' || next === 'evening' ? 0.75 : 0.5;
      pane.needsUpdate = true;
      LAMP_SHADE.emissiveIntensity = LAMPS[next];
      for (const light of lights) light.intensity = LAMPS[next] * 2.2;
      // The laptop on the desk is shut for the night.
      if (laptop) {
        laptop.open.visible = next !== 'night';
        laptop.closed.visible = next === 'night';
      }
      // Windows are closed for the evening and the night.
      if (next === 'evening' || next === 'night') for (const sash of sashes) sash.open = false;
    },
    setWindowOpen: (index, open) => {
      const sash = sashes[index];
      if (sash) sash.open = open;
    },
    isWindowOpen: (index) => sashes[index]?.open ?? false,
    update: (delta) => {
      for (const sash of sashes) {
        const target = sash.open ? OPEN_ANGLE : 0;
        sash.angle += (target - sash.angle) * Math.min(1, delta * 3);
        sash.pivot.rotation.x = sash.angle;
      }
      for (const fan of fans) fan.rotation.z += delta * 14;
    },
    dispose: () => {
      for (const texture of textures.values()) texture.dispose();
    },
  };
}
