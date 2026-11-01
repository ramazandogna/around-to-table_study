import { CHARACTERS, type Appearance } from '@att/shared';
import {
  AnimationMixer,
  Box3,
  Vector3,
  type AnimationClip,
  type Group,
  type Mesh,
  type MeshStandardMaterial,
  type SkinnedMesh,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { dressMesh, mapOutfit, type OutfitMap } from './outfit';
import { createDanceCycle, createSmokeCycle, createStudyPose, createWaveGesture } from './poses';

const PATH = 'models/characters/';
/** Standing height in tiles (a tile is about a meter): small and chibi, like the furniture kit. */
const CHARACTER_HEIGHT = 1.3;

/** Every animation an avatar uses. Clips come with each model, so they always fit its rig. */
export type CharacterClips = {
  idle: AnimationClip;
  walk: AnimationClip;
  /** Sitting back, hands on the lap: sofas. */
  sit: AnimationClip;
  /** Sitting at a table with the forearms on it. */
  study: AnimationClip;
  dance: AnimationClip;
  /** Standing with a cigarette, a drag now and then. */
  smoke: AnimationClip;
  /** One-off gestures. */
  poke: AnimationClip;
  nod: AnimationClip;
  wave: AnimationClip;
};

/**
 * `hand`: the tip of the right hand in the right arm's own space, where
 * something held (a cigarette) is attached.
 */
export type Character = { model: Group; clips: CharacterClips; hand: Vector3 };

export type CharacterKit = {
  /** A fresh copy of a character, scaled to the world, with its animations. */
  create: (look: Appearance) => Character;
  /** Height of the hip joints above the model's origin while seated. */
  seatedHipHeight: number;
};

type Loaded = { scene: Group; clips: CharacterClips; outfit: OutfitMap; hand: Vector3 };

let kit: Promise<CharacterKit> | null = null;

/** Loads Kenney's "Mini Characters" once; the world and the creator share them. */
export function loadCharacterKit(): Promise<CharacterKit> {
  kit ??= loadKit();
  return kit;
}

function clipNamed(animations: AnimationClip[], name: string): AnimationClip {
  const clip = animations.find((c) => c.name === name);
  if (!clip) throw new Error(`Character animation ${name} is missing`);
  return clip;
}

async function loadKit(): Promise<CharacterKit> {
  const loader = new GLTFLoader().setPath(PATH);
  const loaded = await Promise.all(
    CHARACTERS.map(async (id): Promise<Loaded> => {
      const gltf = await loader.loadAsync(`character-${id}.glb`);
      const scene = gltf.scene;
      const height = new Box3().setFromObject(scene).getSize(new Vector3()).y;
      scene.scale.setScalar(CHARACTER_HEIGHT / height);
      const meshes: SkinnedMesh[] = [];
      scene.traverse((child) => {
        const mesh = child as Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        // Every character wears vertex colours: white, unless a part was recoloured.
        (mesh.material as MeshStandardMaterial).vertexColors = true;
        meshes.push(mesh as SkinnedMesh);
      });
      const head = meshes.find((m) => m.name.startsWith('head'));
      const body = meshes.find((m) => m.name.startsWith('body'));
      if (!head || !body) throw new Error(`Character ${id} has no head or body`);
      const animations = gltf.animations;
      const sit = clipNamed(animations, 'sit');
      const idle = clipNamed(animations, 'idle');
      return {
        scene,
        outfit: mapOutfit(head, body),
        hand: measureHand(scene),
        clips: {
          idle,
          walk: clipNamed(animations, 'walk'),
          sit,
          study: createStudyPose(sit),
          dance: createDanceCycle(),
          smoke: createSmokeCycle(idle),
          poke: clipNamed(animations, 'interact-right'),
          nod: clipNamed(animations, 'emote-yes'),
          wave: createWaveGesture(),
        },
      };
    }),
  );

  const first = loaded[0];
  if (!first) throw new Error('No characters to load');
  return {
    seatedHipHeight: measureSeatedHip(first),
    create: (look) => {
      const source = loaded[look.character] ?? first;
      const model = clone(source.scene) as Group;
      // Clones share geometry; each one gets its own, coloured for this look.
      model.traverse((child) => {
        const mesh = child as SkinnedMesh;
        if (mesh.isSkinnedMesh) dressMesh(mesh, source.outfit.get(mesh.name), look);
      });
      return { model, clips: source.clips, hand: source.hand };
    },
  };
}

/**
 * Where the right hand ends, in the right arm's space. The rig rests in a
 * T-pose with the right arm along -x, so the hand's tip is the model's
 * furthest point that way, level with the shoulder.
 */
function measureHand(scene: Group): Vector3 {
  scene.updateMatrixWorld(true);
  const arm = scene.getObjectByName('arm-right');
  if (!arm) return new Vector3();
  const shoulder = arm.getWorldPosition(new Vector3());
  const box = new Box3().setFromObject(scene);
  const tip = new Vector3(box.min.x + 0.02, shoulder.y, shoulder.z);
  return arm.worldToLocal(tip);
}

/** How high the hip joints are above the model's origin in the sit pose, in world units. */
function measureSeatedHip({ scene, clips }: Loaded): number {
  const model = clone(scene);
  const mixer = new AnimationMixer(model);
  mixer.clipAction(clips.sit).play();
  mixer.update(0);
  model.updateMatrixWorld(true);
  const hip = model.getObjectByName('leg-left')?.getWorldPosition(new Vector3()).y ?? 0;
  mixer.stopAllAction();
  return hip;
}
