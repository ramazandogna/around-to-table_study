import { PET_COLORS, type Appearance, type PetKind } from '@att/shared';
import {
  Box3,
  BufferAttribute,
  Color,
  Vector3,
  type AnimationClip,
  type Group,
  type Mesh,
  type MeshStandardMaterial,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { dressPet } from './petGear';

const PATH = 'models/pets/';
/** Height in tiles: about a third of a person, like a cat next to the Mini Characters. */
const PET_HEIGHT = 0.42;
const GRID = 8;
/** The pets' atlas keeps a white swatch here (column, pair of rows), for recolouring fur. */
const WHITE = { column: 1, pair: 2 };

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

/** The fur's swatch for each kind: the one most of the pet is painted with. */
type Loaded = { scene: Group; clips: PetClips; fur: number };

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
  const kinds: PetKind[] = ['cat', 'dog', 'rabbit'];
  const loaded = new Map<PetKind, Loaded>();
  await Promise.all(
    kinds.map(async (kind) => {
      const gltf = await loader.loadAsync(`${kind}.glb`);
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
      loaded.set(kind, {
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
  return {
    create: (kind, dress = {}) => {
      const source = loaded.get(kind) ?? loaded.get('cat');
      if (!source) throw new Error('No pets to load');
      const model = clone(source.scene) as Group;
      const hex = dress.petColor === undefined ? undefined : PET_COLORS[dress.petColor];
      const tint = hex ? new Color(hex) : null;
      model.traverse((child) => {
        const mesh = child as Mesh;
        if (mesh.isMesh) colourFur(mesh, source.fur, tint);
      });
      if (dress.petAccessory) dressPet(model, dress.petAccessory);
      return { model, clips: source.clips };
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
