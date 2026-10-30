import {
  AnimationClip,
  AnimationMixer,
  MathUtils,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
  type Bone,
  type Object3D,
} from 'three';

/**
 * Kenney's character pack only ships idle, run and jump. The walk and the sit
 * pose are derived here from those clips and the skeleton, so no extra assets
 * are needed. Directions are in model space: the character faces +z.
 */

/**
 * A walk made from the run cycle: every key is pulled towards the idle pose,
 * which shortens the stride, lowers the arms and removes most of the bounce.
 */
export function walkFromRun(run: AnimationClip, idle: AnimationClip, calm: number): AnimationClip {
  const walk = run.clone();
  walk.name = 'Walk';
  const key = new Quaternion();
  const restKey = new Quaternion();
  for (const track of walk.tracks) {
    const rest = idle.tracks.find((t) => t.name === track.name);
    if (!rest) continue;
    const size = track.getValueSize();
    const values = track.values;
    for (let i = 0; i < values.length; i += size) {
      if (track instanceof QuaternionKeyframeTrack) {
        restKey.fromArray(rest.values);
        key.fromArray(values, i).slerp(restKey, calm).toArray(values, i);
      } else {
        for (let j = 0; j < size; j++) {
          values[i + j] = MathUtils.lerp(values[i + j] ?? 0, rest.values[j] ?? 0, calm);
        }
      }
    }
  }
  return walk;
}

export type SitPose = {
  clip: AnimationClip;
  /** Height of the hip joint above the soles while seated, in world units. */
  hipHeight: number;
};

const SIDEWAYS = new Vector3(1, 0, 0);
const BREATH_SECONDS = 3.2;

/**
 * Builds a seated "studying" pose: thighs forward, shins down, forearms resting
 * in front on the table, back and head leaning slightly forward.
 * `model` must be a scaled, unrotated copy of the character; it is posed in place.
 */
export function createSitPose(model: Object3D, idle: AnimationClip): SitPose {
  // Not stopped afterwards: stopping would restore the bind pose over our edits.
  new AnimationMixer(model).clipAction(idle).play().getMixer().update(0);
  model.updateMatrixWorld(true);

  const bone = (name: string) => {
    const found = model.getObjectByName(name);
    if (!found) throw new Error(`Character bone ${name} is missing`);
    return found as Bone;
  };
  const worldY = (name: string) => bone(name).getWorldPosition(new Vector3()).y;
  const footBefore = worldY('LeftFoot');

  for (const side of ['Left', 'Right'] as const) {
    const out = Math.sign(bone(`${side}UpLeg`).getWorldPosition(new Vector3()).x);
    aim(bone(`${side}UpLeg`), bone(`${side}Leg`), new Vector3(out * 0.12, -0.08, 1));
    aim(bone(`${side}Leg`), bone(`${side}Foot`), new Vector3(0, -1, 0.12));
    aim(bone(`${side}Arm`), bone(`${side}ForeArm`), new Vector3(out * 0.3, -0.75, 0.6));
    aim(bone(`${side}ForeArm`), bone(`${side}Hand`), new Vector3(-out * 0.45, -0.1, 1));
  }
  tilt(bone('Spine'), 8);
  tilt(bone('Head'), 14);

  // Lower the whole body until the feet are back on the floor.
  const hips = bone('HipsCtrl');
  const drop = worldY('LeftFoot') - footBefore;
  const lowered = hips.getWorldPosition(new Vector3()).setY(worldY('HipsCtrl') - drop);
  hips.position.copy(hips.parent ? hips.parent.worldToLocal(lowered) : lowered);
  model.updateMatrixWorld(true);
  // The model stands on y = 0, and the feet are back where they were.
  const hipHeight = worldY('LeftUpLeg');

  // A slow breath keeps a seated person from looking frozen.
  const chest = bone('Chest');
  const exhale = chest.quaternion.toArray();
  tilt(chest, -2.5);
  const inhale = chest.quaternion.toArray();

  const tracks: (QuaternionKeyframeTrack | VectorKeyframeTrack)[] = [];
  model.traverse((node) => {
    if (!(node as Bone).isBone) return;
    tracks.push(new VectorKeyframeTrack(`${node.name}.position`, [0], node.position.toArray()));
    if (node === chest) {
      tracks.push(
        new QuaternionKeyframeTrack(
          `${node.name}.quaternion`,
          [0, BREATH_SECONDS / 2, BREATH_SECONDS],
          [...exhale, ...inhale, ...exhale],
        ),
      );
    } else {
      tracks.push(
        new QuaternionKeyframeTrack(`${node.name}.quaternion`, [0], node.quaternion.toArray()),
      );
    }
  });
  return { clip: new AnimationClip('Sit', BREATH_SECONDS, tracks), hipHeight };
}

/** Rotates `bone` so the segment towards `child` points along `direction` (model space). */
function aim(bone: Bone, child: Bone, direction: Vector3): void {
  const from = child
    .getWorldPosition(new Vector3())
    .sub(bone.getWorldPosition(new Vector3()))
    .normalize();
  const turn = new Quaternion().setFromUnitVectors(from, direction.clone().normalize());
  rotateInWorld(bone, turn);
}

/** Leans a bone forward by `degrees` around the model's sideways axis. */
function tilt(bone: Bone, degrees: number): void {
  rotateInWorld(bone, new Quaternion().setFromAxisAngle(SIDEWAYS, MathUtils.degToRad(degrees)));
}

function rotateInWorld(bone: Bone, turn: Quaternion): void {
  const world = bone.getWorldQuaternion(new Quaternion()).premultiply(turn);
  const parent = bone.parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion();
  bone.quaternion.copy(parent.invert().multiply(world));
  bone.updateMatrixWorld(true);
}
