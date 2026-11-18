import {
  ACCENTS,
  BUILT_IN,
  CHARACTERS,
  WEAR_COLOR,
  WEAR_SLOTS,
  wearable,
  type Appearance,
  type WearableId,
  type WearSlot,
} from '@att/shared';
import {
  Box3,
  BoxGeometry,
  BufferAttribute,
  Color,
  CylinderGeometry,
  Matrix4,
  Mesh,
  Quaternion,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type Group,
  type Material,
  type Object3D,
  type SkinnedMesh,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Things to wear, built from boxes and eight-sided "domes" in the blocky
 * style of Kenney's Mini Characters. They hang on the head and torso bones,
 * so walking, sitting, dancing and studying carry them along for free. Sizes
 * are in model units (the skull is the same in all twelve characters; hats
 * are sized to each head's hair, measured once). They use the character's own
 * colour atlas: every UV points at its white swatch and the colour comes per
 * vertex, as recoloured clothes do (see `outfit.ts`). Each item is merged
 * into one mesh, and the geometry is shared by everyone wearing the same item
 * on the same head in the same colour: it is marked, and must never be
 * disposed with an avatar.
 */

/** A head mesh in its bone's space: the whole of it, and the crown above the brows. */
export type HeadFit = { full: Box3; crown: Box3 };

/** Above this (head-bone units) the head is hair or skull top, not face. */
const BROW = 0.2;
/** The skull every character shares, in head-bone units. */
const SKULL = { halfWidth: 0.177, top: 0.318, front: 0.16, back: -0.16, ear: 0.227 };
/** The atlas's white swatch (see `outfit.ts`): a point inside it, a little below its middle. */
const WHITE_UV = { u: 4.5 / 8, v: 0.86 };

/** Measures a head mesh in the head bone's space, in the rig's rest pose. */
export function measureHead(scene: Group, head: SkinnedMesh): HeadFit {
  scene.updateMatrixWorld(true);
  const bone = scene.getObjectByName('head');
  const origin = new Vector3();
  if (bone) scene.worldToLocal(bone.getWorldPosition(origin));
  const full = new Box3();
  const crown = new Box3();
  const position = head.geometry.attributes.position as BufferAttribute;
  const v = new Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).sub(origin);
    full.expandByPoint(v);
    if (v.y > BROW) crown.expandByPoint(v);
  }
  return { full, crown };
}

/** Marks geometry that is shared between avatars and lives as long as the page. */
export const isSharedGeometry = (object: Object3D): boolean => !!object.userData.sharedGeometry;

type Part = { geometry: BufferGeometry; color: Color };

/** The hat's footprint: the hair's width and depth, never smaller than the skull. */
function hatBox({ crown }: HeadFit) {
  const hw = Math.max(SKULL.halfWidth, -crown.min.x, crown.max.x) + 0.025;
  const top = Math.max(SKULL.top, crown.max.y);
  const front = Math.max(SKULL.front, Math.min(crown.max.z, 0.21)) + 0.02;
  const back = Math.min(SKULL.back, Math.max(crown.min.z, -0.2)) - 0.02;
  return { hw, top, front, back, hd: (front - back) / 2, zc: (front + back) / 2 };
}

/** Where glasses sit: just in front of the face (some faces stick out further). */
const glassesZ = ({ full }: HeadFit) => Math.max(0.165, Math.min(full.max.z, 0.2)) + 0.01;

class Builder {
  readonly parts: Part[] = [];

  box(w: number, h: number, d: number, color: Color, x: number, y: number, z: number, turn = 0) {
    const geometry = new BoxGeometry(w, h, d);
    if (turn) geometry.rotateZ(turn);
    geometry.translate(x, y, z);
    this.parts.push({ geometry, color });
  }

  /** A rounded, tapered block: an octagonal prism squashed to a footprint (Kenney's bevel). */
  dome(hw: number, hd: number, h: number, taper: number, color: Color, y: number, zc: number) {
    const geometry = new CylinderGeometry(taper, 1, h, 8, 1);
    geometry.rotateY(Math.PI / 8);
    const k = Math.cos(Math.PI / 8);
    geometry.scale(hw / k, 1, hd / k);
    geometry.translate(0, y, zc);
    this.parts.push({ geometry, color });
  }

  ring(radius: number, tube: number, color: Color, x: number, y: number, z: number) {
    const geometry = new TorusGeometry(radius, tube, 4, 12);
    geometry.translate(x, y, z);
    this.parts.push({ geometry, color });
  }

  /** Any shape, moved and turned. */
  shape(geometry: BufferGeometry, color: Color, at: Vector3, turn = new Quaternion()) {
    geometry.applyMatrix4(new Matrix4().compose(at, turn, new Vector3(1, 1, 1)));
    this.parts.push({ geometry, color });
  }
}

const hex = (value: string) => new Color(value);
/** A darker shade of a colour, for cuffs, brims and bands. */
const shade = (color: Color, k = 0.78) => color.clone().multiplyScalar(k);

/** Each item's own colour, when the look gives none. */
const OWN_COLOR: Record<WearableId, string> = {
  beanie: '#d9534f',
  cap: '#4f7fd8',
  bucket: '#c9b48f',
  beret: '#3a3d4a',
  headphones: '#3a3d4a',
  flowers: '#5cc37c',
  sunhat: '#e9d59a',
  earmuffs: '#e8a0b4',
  round: '#26262b',
  square: '#7b4a2a',
  sunglasses: '#1d1d22',
  scarf: '#5cc37c',
  bowtie: '#8a3b3b',
  tote: '#e8dcc0',
  backpack: '#c97a9b',
};

const FLOWER_COLORS = ['#f07fb4', '#f7d154', '#f3f0e8', '#8a63d2'].map(hex);
const CUSHION = hex('#e65f4f');

type Build = (b: Builder, fit: HeadFit, color: Color) => void;

/** Head items in the head bone's space; neck and back items in the torso's. */
const BUILD: Record<WearableId, Build> = {
  beanie(b, fit, c) {
    const { hw, hd, zc, top } = hatBox(fit);
    const base = 0.24;
    const h = top + 0.05 - base;
    b.dome(hw, hd, h, 0.78, c, base + h / 2, zc);
    b.dome(hw + 0.012, hd + 0.012, 0.055, 1, shade(c), base + 0.02, zc);
    b.box(0.07, 0.07, 0.07, hex('#f3f0e8'), 0, top + 0.07, zc);
  },
  cap(b, fit, c) {
    const { hw, hd, zc, top, front } = hatBox(fit);
    const base = 0.25;
    const h = top + 0.03 - base;
    b.dome(hw, hd, h, 0.85, c, base + h / 2, zc);
    b.box(2 * hw - 0.1, 0.022, 0.13, shade(c), 0, base + 0.01, front + 0.05);
    b.box(0.035, 0.02, 0.035, shade(c), 0, top + 0.04, zc);
  },
  bucket(b, fit, c) {
    const { hw, hd, zc, top } = hatBox(fit);
    const base = 0.25;
    const h = top + 0.03 - base;
    b.dome(hw, hd, h, 0.85, c, base + h / 2, zc);
    b.dome(hw + 0.06, hd + 0.06, 0.03, 1.15, shade(c, 0.85), base, zc);
  },
  beret(b, fit, c) {
    const { hw, hd, zc, top: hairTop } = hatBox(fit);
    // On a bun the beret sits on the head and the bun comes through, rather than floating above it.
    const top = Math.min(hairTop, SKULL.top + 0.06);
    const geometry = new CylinderGeometry(0.8, 1, 0.06, 8, 1);
    geometry.rotateY(Math.PI / 8);
    const k = Math.cos(Math.PI / 8);
    geometry.scale((hw + 0.03) / k, 1, (hd + 0.03) / k);
    geometry.rotateZ(-0.14);
    b.shape(geometry, c, new Vector3(0.025, top + 0.015, zc));
    b.box(0.025, 0.04, 0.025, c, 0.02, top + 0.07, zc);
  },
  headphones(b, fit, c) {
    const { hw, top: hairTop } = hatBox(fit);
    // Over a bun the band goes just above the skull, behind the bun, not up and over it.
    const top = Math.min(hairTop, SKULL.top + 0.06);
    const sx = Math.max(hw - 0.01, SKULL.ear);
    b.box(2 * sx, 0.03, 0.05, c, 0, top + 0.02, -0.03);
    for (const s of [-1, 1]) {
      b.box(0.03, top - 0.14, 0.05, c, s * (sx + 0.005), (top + 0.18) / 2, -0.03);
      // Round cups over the ears, the cushion facing in.
      const cup = new CylinderGeometry(0.075, 0.075, 0.05, 8, 1);
      cup.rotateZ(Math.PI / 2);
      b.shape(cup, c, new Vector3(s * (sx + 0.035), 0.12, -0.05));
      const cushion = new CylinderGeometry(0.06, 0.06, 0.02, 8, 1);
      cushion.rotateZ(Math.PI / 2);
      b.shape(cushion, CUSHION, new Vector3(s * (sx + 0.005), 0.12, -0.05));
    }
  },
  flowers(b, fit, c) {
    const { hw, top, front, back } = hatBox(fit);
    const y = Math.min(top, SKULL.top + 0.04) - 0.02;
    const zc = (front + back) / 2;
    const rz = ((front - back) / 2) * 0.95;
    b.dome(hw * 0.97, rz, 0.025, 1, c, y - 0.02, zc);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const color = FLOWER_COLORS[k % FLOWER_COLORS.length] ?? c;
      b.box(0.06, 0.05, 0.06, color, Math.sin(a) * hw * 0.95, y, zc + Math.cos(a) * rz);
    }
  },
  sunhat(b, fit, c) {
    const { hw, hd, zc, top } = hatBox(fit);
    const base = 0.25;
    const h = top + 0.02 - base;
    b.dome(hw - 0.01, hd - 0.01, h, 0.8, c, base + h / 2, zc);
    b.dome(hw + 0.002, hd + 0.002, 0.04, 1, hex('#c0553f'), base + 0.03, zc);
    b.dome(hw + 0.13, hd + 0.13, 0.022, 1.02, shade(c, 0.9), base, zc);
  },
  earmuffs(b, fit, c) {
    const { hw } = hatBox(fit);
    const top = SKULL.top + 0.01;
    const sx = Math.max(hw - 0.02, SKULL.ear);
    b.box(2 * sx + 0.02, 0.025, 0.04, hex('#3a3d4a'), 0, top + 0.02, 0);
    for (const s of [-1, 1]) {
      b.box(0.025, top - 0.13, 0.04, hex('#3a3d4a'), s * (sx + 0.005), (top + 0.16) / 2, 0);
      // A fluffy round muff over each ear, its flat side against the head.
      const muff = new CylinderGeometry(0.065, 0.065, 0.06, 8, 1);
      muff.rotateZ(Math.PI / 2);
      b.shape(muff, c, new Vector3(s * (sx + 0.035), 0.12, -0.04));
    }
  },
  round(b, fit, c) {
    const z = glassesZ(fit);
    const y = 0.115;
    for (const s of [-1, 1]) {
      b.ring(0.052, 0.011, c, s * 0.09, y, z);
      b.box(0.012, 0.012, 0.22, c, s * 0.183, y + 0.01, z - 0.11);
    }
    b.box(0.06, 0.012, 0.012, c, 0, y + 0.01, z);
  },
  square(b, fit, c) {
    const z = glassesZ(fit);
    const y = 0.115;
    for (const s of [-1, 1]) {
      b.box(0.11, 0.012, 0.012, c, s * 0.09, y + 0.045, z);
      b.box(0.11, 0.012, 0.012, c, s * 0.09, y - 0.045, z);
      b.box(0.012, 0.1, 0.012, c, s * 0.035, y, z);
      b.box(0.012, 0.1, 0.012, c, s * 0.145, y, z);
      b.box(0.012, 0.012, 0.22, c, s * 0.183, y + 0.04, z - 0.11);
    }
  },
  sunglasses(b, fit, c) {
    const z = glassesZ(fit);
    const y = 0.115;
    for (const s of [-1, 1]) {
      b.box(0.12, 0.07, 0.015, hex('#1d1d22'), s * 0.085, y, z);
      b.box(0.012, 0.012, 0.22, c, s * 0.183, y + 0.03, z - 0.11);
    }
    b.box(0.36, 0.015, 0.015, c, 0, y + 0.03, z);
  },
  scarf(b, _fit, c) {
    b.box(0.3, 0.06, 0.29, c, 0, 0.15, -0.025);
    b.box(0.07, 0.13, 0.03, shade(c, 0.9), 0.07, 0.08, 0.125);
  },
  bowtie(b, _fit, c) {
    // Two wings and a knot at the collar, on the front of the torso.
    b.box(0.07, 0.05, 0.03, c, -0.042, 0.14, 0.135, 0.25);
    b.box(0.07, 0.05, 0.03, c, 0.042, 0.14, 0.135, -0.25);
    b.box(0.03, 0.035, 0.035, shade(c), 0, 0.14, 0.14);
  },
  tote(b, _fit, c) {
    // A cloth bag on the back, its strap over the left shoulder.
    b.box(0.2, 0.2, 0.035, c, 0.02, 0.0, -0.19, 0.08);
    b.box(0.03, 0.015, 0.31, shade(c), 0.085, 0.16, -0.025);
    b.box(0.03, 0.1, 0.012, shade(c), 0.085, 0.11, 0.13);
    b.box(0.03, 0.06, 0.012, shade(c), 0.085, 0.13, -0.18);
  },
  backpack(b, _fit, c) {
    b.box(0.24, 0.2, 0.09, c, 0, 0.06, -0.21);
    b.box(0.25, 0.06, 0.1, shade(c), 0, 0.14, -0.21);
    b.box(0.12, 0.07, 0.03, shade(c, 0.9), 0, 0.02, -0.265);
  },
};

/** Per head, how an item has to move to clear long hair (female-e's falls down the back). */
const BACK_DEPTH: Partial<Record<string, number>> = { 'female-e': -0.04, 'female-f': -0.02 };

/** One mesh's worth of geometry from an item's parts: flat-shaded, white swatch, coloured. */
function merge(parts: Part[]): BufferGeometry | null {
  const pieces = parts.map(({ geometry, color }) => {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    flat.deleteAttribute('normal');
    flat.computeVertexNormals();
    const count = flat.attributes.position?.count ?? 0;
    const uv = new Float32Array(count * 2);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      uv.set([WHITE_UV.u, WHITE_UV.v], i * 2);
      colors.set([color.r, color.g, color.b], i * 3);
    }
    flat.setAttribute('uv', new BufferAttribute(uv, 2));
    flat.setAttribute('color', new BufferAttribute(colors, 3));
    if (flat !== geometry) geometry.dispose();
    return flat;
  });
  const merged = pieces.length ? mergeGeometries(pieces) : null;
  for (const piece of pieces) piece.dispose();
  return merged;
}

/** Item geometry, by item, head and colour: at most a few hundred, each a few kB. */
const cache = new Map<string, BufferGeometry | null>();

function geometryFor(
  id: WearableId,
  head: number,
  fit: HeadFit,
  color: string,
): BufferGeometry | null {
  const key = `${id}:${head}:${color}`;
  if (!cache.has(key)) {
    const builder = new Builder();
    BUILD[id](builder, fit, hex(color));
    const geometry = merge(builder.parts);
    const depth = BACK_DEPTH[CHARACTERS[head] ?? ''];
    if (geometry && depth && wearable(id)?.slot === 'back') geometry.translate(0, 0, depth);
    cache.set(key, geometry);
  }
  return cache.get(key) ?? null;
}

/** Whether a face (head) already has something drawn on in this slot. */
export function slotBuiltIn(head: number, slot: WearSlot): boolean {
  const id = CHARACTERS[head];
  return !!id && !!BUILT_IN[id]?.includes(slot);
}

const BONE: Record<WearSlot, string> = { hat: 'head', face: 'head', neck: 'torso', back: 'torso' };

/**
 * Puts a look's things on a freshly made character. `head` is the index of
 * the face it wears (its own or another's), `fit` that head measured.
 * Unknown items, and slots the face already fills, are left empty.
 */
export function dressGear(
  model: Group,
  look: Appearance,
  head: number,
  fit: HeadFit,
  material: Material,
): void {
  for (const slot of WEAR_SLOTS) {
    const item = wearable(look[slot]);
    if (!item || item.slot !== slot || slotBuiltIn(head, slot)) continue;
    const bone = model.getObjectByName(BONE[slot]);
    if (!bone) continue;
    const index = look[WEAR_COLOR[slot]];
    const color = (index !== undefined ? ACCENTS[index] : undefined) ?? OWN_COLOR[item.id];
    const geometry = geometryFor(item.id, head, fit, color);
    if (!geometry) continue;
    const mesh = new Mesh(geometry, material);
    mesh.name = `gear-${slot}`;
    mesh.castShadow = true;
    mesh.userData.sharedGeometry = true;
    bone.add(mesh);
  }
}
