import type { PetKind } from '@att/shared';
import { Box3, Vector3, type AnimationClip, type Group, type Mesh } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const PATH = 'models/pets/';
/** Height in tiles: about a third of a person, like a cat next to the Mini Characters. */
const PET_HEIGHT = 0.42;

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

export type PetKit = { create: (kind: PetKind) => PetModel };

type Loaded = { scene: Group; clips: PetClips };

let kit: Promise<PetKit> | null = null;

/** Loads the pets once; the world and the creator share them. Facing +z, like the characters. */
export function loadPetKit(): Promise<PetKit> {
  kit ??= loadKit();
  return kit;
}

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
      scene.traverse((child) => {
        const mesh = child as Mesh;
        if (mesh.isMesh) mesh.castShadow = true;
      });
      const clip = (name: string) => {
        const found = gltf.animations.find((c) => c.name === name);
        if (!found) throw new Error(`Pet animation ${name} is missing`);
        return found;
      };
      loaded.set(kind, {
        scene,
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
    create: (kind) => {
      const source = loaded.get(kind) ?? loaded.get('cat');
      if (!source) throw new Error('No pets to load');
      return { model: clone(source.scene) as Group, clips: source.clips };
    },
  };
}
