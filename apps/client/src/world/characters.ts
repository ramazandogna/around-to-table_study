import { CHARACTER_SKINS, type Appearance } from '@att/shared';
import {
  Box3,
  MeshStandardMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type AnimationClip,
  type Group,
  type Mesh,
  type Texture,
} from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createSitPose, walkFromRun } from './poses';

const PATH = 'models/characters/';
/** Character height in tiles (a tile is about a meter); doors are 2 tiles tall. */
const CHARACTER_HEIGHT = 1.7;
/** How far the walk is pulled from the run towards standing still (0 = run, 1 = idle). */
const WALK_CALM = 0.55;

export type CharacterKit = {
  create: (look: Appearance) => Group;
  clips: { idle: AnimationClip; walk: AnimationClip; sit: AnimationClip };
  /** Height of the hip joint above the soles while seated. */
  seatedHipHeight: number;
};

/** Each FBX holds a one-frame "Targeting Pose" next to the real clip, so clips are picked by name. */
function clipNamed(animations: AnimationClip[], name: string): AnimationClip {
  const clip = animations.find((c) => c.name.endsWith(`|${name}`));
  if (!clip) throw new Error(`Character animation ${name} is missing`);
  return clip;
}

/** Loads the Kenney "Animated Characters" model, its animations and skins once. */
export async function loadCharacterKit(): Promise<CharacterKit> {
  const fbx = new FBXLoader().setPath(PATH);
  const [base, idleFile, runFile, ...skins] = await Promise.all([
    fbx.loadAsync('characterMedium.fbx'),
    fbx.loadAsync('idle.fbx'),
    fbx.loadAsync('run.fbx'),
    ...CHARACTER_SKINS.map((skin) => new TextureLoader().loadAsync(`${PATH}skins/${skin}.png`)),
  ]);
  skins.forEach((texture: Texture) => (texture.colorSpace = SRGBColorSpace));

  const height = new Box3().setFromObject(base).getSize(new Vector3()).y;
  base.scale.setScalar(CHARACTER_HEIGHT / height);

  const idle = clipNamed(idleFile.animations, 'Idle');
  const run = clipNamed(runFile.animations, 'Run');
  const sit = createSitPose(clone(base), idle);

  return {
    clips: { idle, walk: walkFromRun(run, idle, WALK_CALM), sit: sit.clip },
    seatedHipHeight: sit.hipHeight,
    create: (look) => {
      const model = clone(base) as Group;
      const skin = skins[look.skin] ?? skins[0];
      model.traverse((child) => {
        const mesh = child as Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        // The FBX material is dark and untextured; the skin texture carries all the color.
        mesh.material = new MeshStandardMaterial({ map: skin ?? null, roughness: 0.8 });
      });
      return model;
    },
  };
}
