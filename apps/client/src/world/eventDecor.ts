import type { AreaGrid, EventTheme } from '@att/shared';
import {
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  type Material,
} from 'three';

/**
 * How a room dresses up while an event is on: paper bunting strung across it,
 * string lights twinkling along the walls and a banner with the event's name.
 * Colours come from the event's theme, so a Turkish or Thai day only needs a
 * new theme in `shared`.
 */

const BUNTING_HEIGHT = 2.15;
const LIGHTS_HEIGHT = 2.35;
const FLAG_SPACING = 0.34;
const BULB_SPACING = 0.45;

export type EventDecor = {
  root: Group;
  update: (delta: number) => void;
  dispose: () => void;
};

export function buildEventDecor(grid: AreaGrid, theme: EventTheme, title: string): EventDecor {
  const root = new Group();
  const materials: Material[] = [];
  const textures: CanvasTexture[] = [];
  const W = grid.width;
  const H = grid.height;

  // Bunting: a few strings across the room from the west wall to the east, sagging a little.
  const string = new LineBasicMaterial({ color: '#f5ecd7' });
  const flags = theme.bunting.map((colour) => {
    const material = new MeshStandardMaterial({ color: colour, side: DoubleSide, roughness: 0.9 });
    materials.push(material);
    return material;
  });
  const flagShape = new BufferGeometry();
  flagShape.setAttribute(
    'position',
    new Float32BufferAttribute([-0.11, 0, 0, 0.11, 0, 0, 0, -0.2, 0], 3),
  );
  flagShape.computeVertexNormals();
  materials.push(string);
  const strings = Math.max(2, Math.floor((H - 2) / 3));
  for (let i = 0; i < strings; i++) {
    const z0 = 1.6 + ((H - 3.2) * (i + 0.5)) / strings;
    const from = { x: 1.05, z: z0 - 0.6 };
    const to = { x: W - 1.2, z: z0 + 0.6 };
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    const at = (t: number) => ({
      x: from.x + (to.x - from.x) * t,
      y: BUNTING_HEIGHT - Math.sin(t * Math.PI) * 0.35,
      z: from.z + (to.z - from.z) * t,
    });
    const points: number[] = [];
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const p = at(t);
      points.push(p.x, p.y, p.z);
    }
    const line = new BufferGeometry();
    line.setAttribute('position', new Float32BufferAttribute(points, 3));
    root.add(new Line(line, string));
    const count = Math.floor(length / FLAG_SPACING);
    for (let k = 1; k < count; k++) {
      const p = at(k / count);
      const material = flags[(k + i) % flags.length];
      if (!material) continue;
      const flag = new Mesh(flagShape, material);
      flag.position.set(p.x, p.y, p.z);
      flag.rotation.y = Math.atan2(to.x - from.x, to.z - from.z) + Math.PI / 2;
      root.add(flag);
    }
  }

  // String lights along the back walls, each bulb twinkling on its own beat.
  const bulbGeometry = new SphereGeometry(0.035, 8, 6);
  const bulbs: MeshStandardMaterial[] = [];
  const addBulb = (x: number, z: number, i: number) => {
    const material = new MeshStandardMaterial({
      color: theme.lights,
      emissive: theme.lights,
      emissiveIntensity: 1,
    });
    material.userData.phase = i * 1.7;
    bulbs.push(material);
    const bulb = new Mesh(bulbGeometry, material);
    bulb.position.set(x, LIGHTS_HEIGHT - Math.abs(Math.sin(i * 0.9)) * 0.08, z);
    root.add(bulb);
  };
  let i = 0;
  for (let x = 1.3; x < W - 1; x += BULB_SPACING) addBulb(x, 1.08, i++);
  for (let z = 1.3; z < H - 1; z += BULB_SPACING) addBulb(1.08, z, i++);
  materials.push(...bulbs);

  // A banner on the north wall with the event's name.
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const g = canvas.getContext('2d');
  if (g) {
    g.fillStyle = '#3a2810';
    g.fillRect(0, 0, 512, 96);
    g.strokeStyle = theme.lights;
    g.lineWidth = 6;
    g.strokeRect(6, 6, 500, 84);
    g.fillStyle = '#fff4d6';
    g.font = 'bold 44px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(title, 256, 50, 470);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  textures.push(texture);
  const bannerMaterial = new MeshBasicMaterial({ map: texture });
  materials.push(bannerMaterial);
  const banner = new Mesh(new PlaneGeometry(2.4, 0.45), bannerMaterial);
  banner.position.set(W / 2, 2.05, 1.03);
  root.add(banner);

  let time = 0;
  return {
    root,
    update: (delta) => {
      time += delta;
      for (const bulb of bulbs) {
        const phase = bulb.userData.phase as number;
        bulb.emissiveIntensity = 0.55 + 0.45 * Math.max(0, Math.sin(time * 2.1 + phase));
      }
    },
    dispose: () => {
      root.traverse((child) => {
        if (child instanceof Mesh || child instanceof Line) child.geometry.dispose();
      });
      flagShape.dispose();
      bulbGeometry.dispose();
      for (const material of materials) material.dispose();
      for (const t of textures) t.dispose();
      root.removeFromParent();
    },
  };
}
