import { dateLocale } from '../i18n/t';
import {
  BoxGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  type Material,
} from 'three';

/**
 * Little things that make the building lived in, from simple shapes: an
 * umbrella stand by the library door, the lost-and-found box, and the
 * library's digital wall clock.
 */

const shadowed = (group: Group) => {
  group.traverse((child) => {
    if (child instanceof Mesh) child.castShadow = true;
  });
  return group;
};

/** A brass-rimmed stand with three folded umbrellas and a crook-handled one. */
export function umbrellaStand(materials: Material[]): Group {
  const stand = new Group();
  const pot = new MeshStandardMaterial({ color: '#3d4a52', roughness: 0.6, metalness: 0.3 });
  const brass = new MeshStandardMaterial({ color: '#c9a24a', roughness: 0.35, metalness: 0.8 });
  materials.push(pot, brass);
  const body = new Mesh(new CylinderGeometry(0.15, 0.13, 0.45, 18, 1, true), pot);
  body.position.y = 0.225;
  const base = new Mesh(new CylinderGeometry(0.13, 0.13, 0.02, 18), pot);
  base.position.y = 0.01;
  const rim = new Mesh(new TorusGeometry(0.15, 0.012, 6, 20), brass);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.45;
  stand.add(body, base, rim);
  ['#c0392b', '#2e6fd8', '#f2c230', '#2f8a47'].forEach((colour, i) => {
    const cloth = new MeshStandardMaterial({ color: colour, roughness: 0.8 });
    const handle = new MeshStandardMaterial({ color: '#4a2b16', roughness: 0.6 });
    materials.push(cloth, handle);
    const umbrella = new Group();
    const folded = new Mesh(new ConeGeometry(0.035, 0.62, 8), cloth);
    folded.position.y = 0.42;
    folded.rotation.x = Math.PI;
    const shaft = new Mesh(new CylinderGeometry(0.008, 0.008, 0.16, 6), handle);
    shaft.position.y = 0.8;
    umbrella.add(folded, shaft);
    // The last one has a crook handle; the others a straight grip.
    if (i === 3) {
      const crook = new Mesh(new TorusGeometry(0.035, 0.009, 6, 10, Math.PI), handle);
      crook.position.set(0.035, 0.88, 0);
      umbrella.add(crook);
    } else {
      const grip = new Mesh(new SphereGeometry(0.018, 8, 6), handle);
      grip.position.y = 0.88;
      umbrella.add(grip);
    }
    const angle = (i / 4) * Math.PI * 2;
    umbrella.position.set(Math.cos(angle) * 0.06, 0, Math.sin(angle) * 0.06);
    umbrella.rotation.set(Math.sin(angle) * 0.18, 0, -Math.cos(angle) * 0.18);
    stand.add(umbrella);
  });
  return shadowed(stand);
}

/** A cardboard box marked "Lost & found", with a scarf, a mug and a book peeking out. */
export function lostBox(materials: Material[]): Group {
  const box = new Group();
  const card = new MeshStandardMaterial({ color: '#b98a54', roughness: 0.95 });
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 48;
  const c = canvas.getContext('2d');
  if (c) {
    c.fillStyle = '#f4ead2';
    c.fillRect(0, 0, 128, 48);
    c.fillStyle = '#3b2412';
    c.font = 'bold 17px sans-serif';
    c.textAlign = 'center';
    c.fillText('LOST &', 64, 21);
    c.fillText('FOUND', 64, 40);
  }
  const labelTexture = new CanvasTexture(canvas);
  labelTexture.colorSpace = SRGBColorSpace;
  const label = new MeshStandardMaterial({ map: labelTexture, roughness: 0.9 });
  const scarf = new MeshStandardMaterial({ color: '#c0392b', roughness: 0.9 });
  const mug = new MeshStandardMaterial({ color: '#f1efe9', roughness: 0.5 });
  const book = new MeshStandardMaterial({ color: '#2e6fd8', roughness: 0.8 });
  materials.push(card, label, scarf, mug, book);
  const body = new Mesh(new BoxGeometry(0.5, 0.36, 0.38), card);
  body.position.y = 0.18;
  const sign = new Mesh(new PlaneGeometry(0.32, 0.12), label);
  sign.position.set(0, 0.22, 0.191);
  // Flaps folded open.
  for (const side of [-1, 1]) {
    const flap = new Mesh(new BoxGeometry(0.5, 0.01, 0.16), card);
    flap.position.set(0, 0.37, side * 0.24);
    flap.rotation.x = side * 0.7;
    box.add(flap);
  }
  const wool = new Mesh(new TorusGeometry(0.07, 0.03, 6, 12), scarf);
  wool.position.set(-0.1, 0.37, 0);
  wool.rotation.x = 1.2;
  const cup = new Mesh(new CylinderGeometry(0.04, 0.035, 0.08, 10), mug);
  cup.position.set(0.11, 0.38, 0.05);
  const novel = new Mesh(new BoxGeometry(0.1, 0.14, 0.03), book);
  novel.position.set(0.05, 0.4, -0.08);
  novel.rotation.z = 0.3;
  box.add(body, sign, wool, cup, novel);
  return shadowed(box);
}

/**
 * The library's digital wall clock: amber digits on a dark face, showing the
 * real time. `tick` redraws it when the minute changes.
 */
export function wallClock(materials: Material[]): { root: Group; tick: (now: Date) => void } {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const face = new MeshStandardMaterial({
    map: texture,
    emissiveMap: texture,
    emissive: '#ffffff',
    emissiveIntensity: 0.9,
    roughness: 0.4,
  });
  const frame = new MeshStandardMaterial({ color: '#5b3a24', roughness: 0.6 });
  materials.push(face, frame);
  const root = new Group();
  const back = new Mesh(new BoxGeometry(0.72, 0.3, 0.05), frame);
  const screen = new Mesh(new PlaneGeometry(0.64, 0.24), face);
  screen.position.z = 0.026;
  root.add(back, screen);
  let shown = '';
  const tick = (now: Date) => {
    const text = now.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' });
    if (text === shown) return;
    shown = text;
    const c = canvas.getContext('2d');
    if (!c) return;
    c.fillStyle = '#16100c';
    c.fillRect(0, 0, 256, 96);
    c.fillStyle = '#ffb347';
    c.shadowColor = '#ff8a1f';
    c.shadowBlur = 10;
    c.font = 'bold 64px ui-monospace, Menlo, monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 128, 50);
    texture.needsUpdate = true;
  };
  tick(new Date());
  return { root, tick };
}
