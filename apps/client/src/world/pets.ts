import { PET_COLORS, type Appearance, type PetKind } from '@att/shared';
import {
  AnimationClip,
  Box3,
  BoxGeometry,
  BufferAttribute,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
  type BufferGeometry,
  type KeyframeTrack,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { dressPet } from './petGear';

const PATH = 'models/pets/';
/** Height in tiles: about a third of a person, like a cat next to the Mini Characters. */
const PET_HEIGHT = 0.42;
const GRID = 8;
/** The pets' atlas keeps a white swatch here (column, pair of rows), for recolouring fur. */
const WHITE = { column: 1, pair: 2 };
/** The Kenney pets' legs reach this far below their hip, in the model's own units. */
const LEG_LENGTH = 0.3;

/** Kenney's Cube Pets (CC0) come with these clips; a pet's behaviour picks among them. */
export type PetClips = {
  idle: AnimationClip;
  walk: AnimationClip;
  run: AnimationClip;
  eat: AnimationClip;
  dance: AnimationClip;
  /** A happy little hop. */
  yes: AnimationClip;
  /** A head shake, e.g. after bumping into something. */
  no: AnimationClip;
};

export type PetModel = { model: Group; clips: PetClips };

/** How a pet is dressed: the pet fields of its person's look. */
export type PetDress = Pick<Appearance, 'petColor' | 'petAccessory'>;

export type PetKit = { create: (kind: PetKind, dress?: PetDress) => PetModel };

/** The fur's swatch for each model: the one most of the pet is painted with. */
type Loaded = { scene: Group; clips: PetClips; fur: number };

/**
 * A dog breed (or the plain kinds) as a reshaped Kenney model: overall size,
 * leg length, body length and width, a fur colour of its own (until the
 * player picks one) and its ears and tail. The clips are reshaped to match,
 * so the legs stay under the body and the paws on the floor.
 */
type Shape = {
  base: 'cat' | 'dog' | 'rabbit';
  size: number;
  legs: number;
  length: number;
  width: number;
  fur?: string;
  ears?: 'floppy' | 'pointy' | 'big';
  tail?: 'curl' | 'stub';
};

const SHAPES: Record<Exclude<PetKind, 'turtle'>, Shape> = {
  cat: { base: 'cat', size: 1, legs: 1, length: 1, width: 1 },
  // A beagle: the Kenney dog as it is (its own ears and colours).
  dog: { base: 'dog', size: 1, legs: 1, length: 1, width: 1 },
  // Small and low, long in the back, big upright ears and a stub of a tail.
  corgi: {
    base: 'dog',
    size: 0.86,
    legs: 0.5,
    length: 1.2,
    width: 1.05,
    fur: '#e39b52',
    ears: 'big',
    tail: 'stub',
  },
  // Small, very long and very low, long floppy ears.
  dachshund: {
    base: 'dog',
    size: 0.84,
    legs: 0.42,
    length: 1.45,
    width: 0.86,
    fur: '#7a4528',
    ears: 'floppy',
  },
  // Medium, fox-like: small pointed ears and a tail curled over the back.
  shiba: {
    base: 'dog',
    size: 0.95,
    legs: 0.92,
    length: 1,
    width: 0.98,
    fur: '#d98c4a',
    ears: 'pointy',
    tail: 'curl',
  },
  rabbit: { base: 'rabbit', size: 0.95, legs: 1, length: 1, width: 1 },
};

let kit: Promise<PetKit> | null = null;

/** Loads the pets once; the world and the creator share them. Facing +z, like the characters. */
export function loadPetKit(): Promise<PetKit> {
  kit ??= loadKit();
  return kit;
}

const swatchOf = (u: number, v: number) =>
  Math.min(GRID - 1, Math.floor(u * GRID)) * 4 +
  Math.floor(Math.min(GRID - 1, Math.floor(v * GRID)) / 2);

async function loadKit(): Promise<PetKit> {
  const loader = new GLTFLoader().setPath(PATH);
  const bases = ['cat', 'dog', 'rabbit'] as const;
  const loaded = new Map<Shape['base'], Loaded>();
  await Promise.all(
    bases.map(async (base) => {
      const gltf = await loader.loadAsync(`${base}.glb`);
      const scene = gltf.scene;
      const height = new Box3().setFromObject(scene).getSize(new Vector3()).y;
      scene.scale.setScalar(PET_HEIGHT / height);
      const counts = new Map<number, number>();
      scene.traverse((child) => {
        const mesh = child as Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        // Every pet wears vertex colours: white, unless its fur was recoloured.
        (mesh.material as MeshStandardMaterial).vertexColors = true;
        const uv = mesh.geometry.attributes.uv as BufferAttribute;
        for (let i = 0; i < uv.count; i++) {
          const swatch = swatchOf(uv.getX(i), uv.getY(i));
          counts.set(swatch, (counts.get(swatch) ?? 0) + 1);
        }
      });
      const fur = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1;
      const clip = (name: string) => {
        const found = gltf.animations.find((c) => c.name === name);
        if (!found) throw new Error(`Pet animation ${name} is missing`);
        return found;
      };
      loaded.set(base, {
        scene,
        fur,
        clips: {
          idle: clip('idle'),
          walk: clip('walk'),
          run: clip('run'),
          eat: clip('eat'),
          dance: clip('dance'),
          yes: clip('gesture-positive'),
          no: clip('gesture-negative'),
        },
      });
    }),
  );
  // Each breed's clips are reshaped once and shared by every pet of that breed.
  const clipsFor = new Map<PetKind, PetClips>();
  const turtleClips = createTurtleClips();
  return {
    create: (kind, dress = {}) => {
      if (kind === 'turtle') return createTurtle(dress, turtleClips);
      const shape = SHAPES[kind];
      const source = loaded.get(shape.base) ?? loaded.get('cat');
      if (!source) throw new Error('No pets to load');
      const model = clone(source.scene) as Group;
      model.scale.multiplyScalar(shape.size);
      const hex = dress.petColor === undefined ? shape.fur : PET_COLORS[dress.petColor];
      const tint = hex ? new Color(hex) : null;
      model.traverse((child) => {
        const mesh = child as Mesh;
        if (!mesh.isMesh) return;
        colourFur(mesh, source.fur, tint);
        reshape(mesh, shape);
      });
      addEarsAndTail(model, shape, tint ?? new Color('#c99a6a'));
      if (dress.petAccessory) dressPet(model, dress.petAccessory);
      let clips = clipsFor.get(kind);
      if (!clips) {
        clips = reshapeClips(source.clips, shape);
        clipsFor.set(kind, clips);
      }
      return { model, clips };
    },
  };
}

/**
 * Gives a cloned mesh its own geometry; with a tint its fur points at the
 * white swatch (same place inside it, so the shading stays) and takes the tint.
 */
function colourFur(mesh: Mesh, fur: number, tint: Color | null): void {
  const geometry = mesh.geometry.clone();
  mesh.geometry = geometry;
  const uv = geometry.attributes.uv as BufferAttribute;
  const colors = new Float32Array(uv.count * 3).fill(1);
  if (tint) {
    for (let i = 0; i < uv.count; i++) {
      if (swatchOf(uv.getX(i), uv.getY(i)) !== fur) continue;
      const column = Math.floor(fur / 4);
      const pair = fur % 4;
      uv.setXY(
        i,
        uv.getX(i) + (WHITE.column - column) / GRID,
        uv.getY(i) + ((WHITE.pair - pair) * 2) / GRID,
      );
      colors.set([tint.r, tint.g, tint.b], i * 3);
    }
    uv.needsUpdate = true;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
}

/** A breed's proportions on its own copy of the geometry: a longer body, shorter legs. */
function reshape(mesh: Mesh, shape: Shape): void {
  if (shape.legs === 1 && shape.length === 1 && shape.width === 1) return;
  const position = mesh.geometry.attributes.position as BufferAttribute;
  if (mesh.name === 'body') {
    for (let i = 0; i < position.count; i++) {
      position.setX(i, position.getX(i) * shape.width);
      position.setZ(i, position.getZ(i) * shape.length);
    }
  } else if (mesh.name.startsWith('leg-')) {
    // Legs hang from the hip at their origin; shorter legs keep the hip where it was.
    for (let i = 0; i < position.count; i++) position.setY(i, position.getY(i) * shape.legs);
  }
  position.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingBox();
  mesh.geometry.computeBoundingSphere();
}

/** The clips to match: legs follow the longer body, and the whole pet sits lower on shorter legs. */
function reshapeClips(clips: PetClips, shape: Shape): PetClips {
  if (shape.legs === 1 && shape.length === 1 && shape.width === 1) return clips;
  const drop = (1 - shape.legs) * LEG_LENGTH;
  const adapt = (clip: AnimationClip) => {
    const tracks = clip.tracks.map((track) => {
      const copy = track.clone();
      const values = copy.values;
      if (/^leg-.*\.position$/.test(track.name)) {
        for (let i = 0; i < values.length; i += 3) {
          values[i] = (values[i] ?? 0) * shape.width;
          values[i + 2] = (values[i + 2] ?? 0) * shape.length;
        }
      } else if (/^root\.position$/.test(track.name)) {
        for (let i = 1; i < values.length; i += 3) values[i] = (values[i] ?? 0) - drop;
      }
      return copy;
    });
    return new AnimationClip(clip.name, clip.duration, tracks);
  };
  return {
    idle: adapt(clips.idle),
    walk: adapt(clips.walk),
    run: adapt(clips.run),
    eat: adapt(clips.eat),
    dance: adapt(clips.dance),
    yes: adapt(clips.yes),
    no: adapt(clips.no),
  };
}

/** Ears and a tail in the fur's colour (a little darker), on the body so they move with it. */
function addEarsAndTail(model: Group, shape: Shape, fur: Color): void {
  if (!shape.ears && !shape.tail) return;
  const body = model.getObjectByName('body') as Mesh | undefined;
  if (!body?.geometry) return;
  body.geometry.computeBoundingBox();
  const box = body.geometry.boundingBox ?? new Box3();
  const w = box.max.x - box.min.x;
  const h = box.max.y - box.min.y;
  const d = box.max.z - box.min.z;
  const material = new MeshStandardMaterial({
    color: fur.clone().multiplyScalar(0.78),
    roughness: 0.85,
  });
  const own = (mesh: Mesh) => {
    mesh.userData.ownGear = true;
    mesh.castShadow = true;
    body.add(mesh);
    return mesh;
  };
  const headZ = box.max.z - d * 0.22;
  for (const side of [-1, 1]) {
    if (shape.ears === 'floppy') {
      const ear = own(new Mesh(new BoxGeometry(w * 0.1, h * 0.42, d * 0.16), material));
      ear.position.set(side * (w * 0.5 + w * 0.04), box.max.y - h * 0.26, headZ);
      ear.rotation.z = side * 0.12;
    } else if (shape.ears === 'pointy' || shape.ears === 'big') {
      const big = shape.ears === 'big';
      const ear = own(
        new Mesh(
          new BoxGeometry(w * (big ? 0.2 : 0.14), h * (big ? 0.3 : 0.18), d * 0.08),
          material,
        ),
      );
      ear.position.set(side * w * 0.28, box.max.y + h * (big ? 0.12 : 0.07), headZ);
      ear.rotation.z = -side * 0.18;
    }
  }
  if (shape.tail === 'stub') {
    const tail = own(new Mesh(new BoxGeometry(w * 0.16, h * 0.12, d * 0.08), material));
    tail.position.set(0, box.min.y + h * 0.45, box.min.z - d * 0.03);
  } else if (shape.tail === 'curl') {
    const tail = own(new Mesh(new BoxGeometry(w * 0.16, h * 0.16, d * 0.2), material));
    tail.position.set(0, box.min.y + h * 0.55, box.min.z + d * 0.02);
    tail.rotation.x = -0.8;
  }
}

/* ---------- The turtle, built here in the same chunky style ---------- */

const TURTLE_SHELL = '#4f8a3c';
const TURTLE_SKIN = '#9cbf6a';

/** A box with every vertex in one colour, for merging into a mesh of several colours. */
function painted(width: number, height: number, depth: number, colour: Color, at: Vector3) {
  const geometry: BufferGeometry = new BoxGeometry(width, height, depth).toNonIndexed();
  geometry.translate(at.x, at.y, at.z);
  const colors = new Float32Array(geometry.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([colour.r, colour.g, colour.b], i);
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.deleteAttribute('uv');
  return geometry;
}

/**
 * A small turtle: a stepped shell with a darker rim, a head that can pull in,
 * four stubby legs and a tail. Named like the Kenney pets (root, body, legs),
 * so the same behaviour drives it; its accessories sit on its head.
 */
function createTurtle(dress: PetDress, clips: PetClips): PetModel {
  const shell = new Color(dress.petColor === undefined ? TURTLE_SHELL : PET_COLORS[dress.petColor]);
  const rim = shell.clone().multiplyScalar(0.7);
  const plate = shell.clone().lerp(new Color('#ffffff'), 0.18);
  const skin = new Color(TURTLE_SKIN);
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });

  const model = new Group();
  model.name = 'turtle';
  const root = new Group();
  root.name = 'root';
  model.add(root);
  const body = new Mesh(
    mergeGeometries([
      painted(0.92, 0.12, 1.08, rim, new Vector3(0, 0.26, 0)),
      painted(0.8, 0.2, 0.94, shell, new Vector3(0, 0.42, 0)),
      painted(0.56, 0.14, 0.66, plate, new Vector3(0, 0.58, 0)),
      painted(0.18, 0.12, 0.3, skin, new Vector3(0, 0.26, -0.6)),
    ]),
    material,
  );
  body.name = 'body';
  root.add(body);
  const head = new Mesh(
    mergeGeometries([
      painted(0.34, 0.3, 0.38, skin, new Vector3(0, 0, 0.17)),
      painted(0.06, 0.07, 0.02, new Color('#1d1d1d'), new Vector3(-0.1, 0.06, 0.36)),
      painted(0.06, 0.07, 0.02, new Color('#1d1d1d'), new Vector3(0.1, 0.06, 0.36)),
    ]),
    material,
  );
  head.name = 'head';
  head.position.set(0, 0.36, 0.5);
  body.add(head);
  for (const [name, x, z] of [
    ['leg-front-left', 0.34, 0.34],
    ['leg-front-right', -0.34, 0.34],
    ['leg-back-left', 0.34, -0.34],
    ['leg-back-right', -0.34, -0.34],
  ] as const) {
    const leg = new Mesh(painted(0.22, 0.24, 0.24, skin, new Vector3(0, -0.12, 0)), material);
    leg.name = name;
    leg.position.set(x, 0.24, z);
    root.add(leg);
  }
  model.traverse((child) => {
    if ((child as Mesh).isMesh) (child as Mesh).castShadow = true;
  });
  // A little lower and longer than the cat: scaled to its own height, not a pet's.
  model.scale.setScalar(0.34 / 0.65);
  model.userData.gearOn = 'head';
  if (dress.petAccessory) dressPet(model, dress.petAccessory);
  return { model, clips };
}

/** A track turning a node about one axis through angles (radians) at times (seconds). */
function swing(node: string, axis: Vector3, keys: readonly (readonly [number, number])[]) {
  const q = new Quaternion();
  return new QuaternionKeyframeTrack(
    `${node}.quaternion`,
    keys.map(([time]) => time),
    keys.flatMap(([, angle]) => q.setFromAxisAngle(axis, angle).toArray()),
  );
}

const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);

/** The turtle's own clips, by the same names the Kenney pets use. */
function createTurtleClips(): PetClips {
  const legs = (beat: number, angle: number) => [
    swing('leg-front-left', X, [
      [0, angle],
      [beat, -angle],
      [beat * 2, angle],
    ]),
    swing('leg-back-right', X, [
      [0, angle],
      [beat, -angle],
      [beat * 2, angle],
    ]),
    swing('leg-front-right', X, [
      [0, -angle],
      [beat, angle],
      [beat * 2, -angle],
    ]),
    swing('leg-back-left', X, [
      [0, -angle],
      [beat, angle],
      [beat * 2, -angle],
    ]),
  ];
  const still = new VectorKeyframeTrack('root.position', [0], [0, 0, 0]);
  const clip = (name: string, duration: number, tracks: KeyframeTrack[]) =>
    new AnimationClip(name, duration, tracks);
  return {
    idle: clip('idle', 3, [
      still,
      swing('body', Y, [
        [0, 0],
        [1.5, 0.04],
        [3, 0],
      ]),
    ]),
    walk: clip('walk', 1.2, [
      ...legs(0.6, 0.5),
      swing('body', Y, [
        [0, -0.05],
        [0.6, 0.05],
        [1.2, -0.05],
      ]),
    ]),
    run: clip('run', 0.7, [...legs(0.35, 0.65)]),
    eat: clip('eat', 1.4, [
      swing('body', X, [
        [0, 0],
        [0.4, 0.18],
        [0.7, 0.12],
        [1.0, 0.18],
        [1.4, 0],
      ]),
    ]),
    dance: clip('dance', 1, [
      swing('body', Y, [
        [0, -0.2],
        [0.5, 0.2],
        [1, -0.2],
      ]),
    ]),
    yes: clip('gesture-positive', 0.8, [
      new VectorKeyframeTrack(
        'root.position',
        [0, 0.25, 0.5, 0.8],
        [0, 0, 0, 0, 0.12, 0, 0, 0, 0, 0, 0, 0],
      ),
    ]),
    no: clip('gesture-negative', 0.9, [
      swing('body', Y, [
        [0, 0],
        [0.2, 0.25],
        [0.45, -0.25],
        [0.7, 0.15],
        [0.9, 0],
      ]),
    ]),
  };
}
