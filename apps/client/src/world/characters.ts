import type { Appearance } from '@att/shared';
import {
  Box3,
  MeshStandardMaterial,
  Vector3,
  type AnimationClip,
  type Group,
  type Mesh,
  type Object3D,
} from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createSitPose, createWalkCycle, measureStrideSpeed } from './poses';
import { skinTexture } from './skin';

const PATH = 'models/characters/';
/** Character height in tiles (a tile is about a meter); doors are 2 tiles tall. */
const CHARACTER_HEIGHT = 1.7;

export type CharacterKit = {
  create: (look: Appearance) => Group;
  /** Repaints a model made by `create` with another look. */
  dress: (model: Object3D, look: Appearance) => void;
  clips: { idle: AnimationClip; walk: AnimationClip; sit: AnimationClip };
  /** Height of the hip joint above the soles while seated. */
  seatedHipHeight: number;
  /** Ground speed of the walk clip at normal speed, in tiles per second. */
  walkSpeed: number;
};

/** Each FBX holds a one-frame "Targeting Pose" next to the real clip, so clips are picked by name. */
function clipNamed(animations: AnimationClip[], name: string): AnimationClip {
  const clip = animations.find((c) => c.name.endsWith(`|${name}`));
  if (!clip) throw new Error(`Character animation ${name} is missing`);
  return clip;
}

let kit: Promise<CharacterKit> | null = null;

/** Loads the Kenney "Animated Characters" model and animations once; the world and the creator share it. */
export function loadCharacterKit(): Promise<CharacterKit> {
  kit ??= loadKit();
  return kit;
}

async function loadKit(): Promise<CharacterKit> {
  const fbx = new FBXLoader().setPath(PATH);
  const [base, idleFile] = await Promise.all([
    fbx.loadAsync('characterMedium.fbx'),
    fbx.loadAsync('idle.fbx'),
  ]);

  const height = new Box3().setFromObject(base).getSize(new Vector3()).y;
  base.scale.setScalar(CHARACTER_HEIGHT / height);

  const idle = clipNamed(idleFile.animations, 'Idle');
  const walk = createWalkCycle(clone(base), idle);
  const sit = createSitPose(clone(base), idle);

  return {
    clips: { idle, walk, sit: sit.clip },
    seatedHipHeight: sit.hipHeight,
    walkSpeed: measureStrideSpeed(clone(base), walk),
    create: (look) => {
      const model = clone(base) as Group;
      model.traverse((child) => {
        const mesh = child as Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        // The FBX material is dark and untextured; the painted skin carries all the color.
        mesh.material = new MeshStandardMaterial({ map: skinTexture(look), roughness: 0.8 });
      });
      return model;
    },
    dress: (model, look) =>
      model.traverse((child) => {
        const mesh = child as Mesh;
        if (mesh.isMesh) (mesh.material as MeshStandardMaterial).map = skinTexture(look);
      }),
  };
}
