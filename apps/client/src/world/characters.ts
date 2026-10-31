import { CHARACTERS, type Appearance } from '@att/shared';
import { AnimationMixer, Box3, Vector3, type AnimationClip, type Group, type Mesh } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createDanceCycle, createStudyPose, createWaveGesture } from './poses';

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
  /** One-off gestures. */
  poke: AnimationClip;
  nod: AnimationClip;
  wave: AnimationClip;
};

export type Character = { model: Group; clips: CharacterClips };

export type CharacterKit = {
  /** A fresh copy of a character, scaled to the world, with its animations. */
  create: (look: Appearance) => Character;
  /** Height of the hip joints above the model's origin while seated. */
  seatedHipHeight: number;
};

type Loaded = { scene: Group; clips: CharacterClips };

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
      scene.traverse((child) => {
        const mesh = child as Mesh;
        if (mesh.isMesh) mesh.castShadow = true;
      });
      const animations = gltf.animations;
      const sit = clipNamed(animations, 'sit');
      return {
        scene,
        clips: {
          idle: clipNamed(animations, 'idle'),
          walk: clipNamed(animations, 'walk'),
          sit,
          study: createStudyPose(sit),
          dance: createDanceCycle(),
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
      return { model: clone(source.scene) as Group, clips: source.clips };
    },
  };
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
