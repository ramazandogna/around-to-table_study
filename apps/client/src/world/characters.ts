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

const PATH = 'models/characters/';
/** Character height in tiles; furniture is scaled so that one tile is about a meter. */
const CHARACTER_HEIGHT = 0.95;

export type CharacterKit = {
  create: (look: Appearance) => Group;
  clips: { idle: AnimationClip; walk: AnimationClip };
};

/** Loads the Kenney "Animated Characters" model, its animations and skins once. */
export async function loadCharacterKit(): Promise<CharacterKit> {
  const fbx = new FBXLoader().setPath(PATH);
  const [base, idle, run, ...skins] = await Promise.all([
    fbx.loadAsync('characterMedium.fbx'),
    fbx.loadAsync('idle.fbx'),
    fbx.loadAsync('run.fbx'),
    ...CHARACTER_SKINS.map((skin) => new TextureLoader().loadAsync(`${PATH}skins/${skin}.png`)),
  ]);
  skins.forEach((texture: Texture) => (texture.colorSpace = SRGBColorSpace));

  const height = new Box3().setFromObject(base).getSize(new Vector3()).y;
  base.scale.setScalar(CHARACTER_HEIGHT / height);

  const idleClip = idle.animations[0];
  const runClip = run.animations[0];
  if (!idleClip || !runClip) throw new Error('Character animations are missing');

  return {
    clips: { idle: idleClip, walk: runClip },
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
