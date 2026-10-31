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
 * pose are posed here on the skeleton, starting from the idle, so no extra
 * assets are needed. Directions are in model space: the character faces +z.
 */

const STRIDE_SAMPLES = 120;
/** A foot counts as planted while it is this close to its lowest point (fraction of its lift). */
const PLANTED = 0.2;

/**
 * How fast the ground passes under a planted foot when `walk` plays at normal
 * speed, in world units per second. Matching the avatar's speed to this stops
 * the feet from sliding. `model` must be a scaled, unrotated copy of the character.
 */
export function measureStrideSpeed(model: Object3D, walk: AnimationClip): number {
  const mixer = new AnimationMixer(model);
  mixer.clipAction(walk).play();
  const dt = walk.duration / STRIDE_SAMPLES;
  let total = 0;
  let count = 0;
  for (const side of ['Left', 'Right']) {
    const foot = model.getObjectByName(`${side}Foot`);
    if (!foot) throw new Error(`Character bone ${side}Foot is missing`);
    const samples: Vector3[] = [];
    mixer.setTime(0);
    for (let i = 0; i <= STRIDE_SAMPLES; i++) {
      mixer.setTime(i * dt);
      model.updateMatrixWorld(true);
      samples.push(foot.getWorldPosition(new Vector3()));
    }
    const ys = samples.map((p) => p.y);
    const low = Math.min(...ys);
    const planted = low + (Math.max(...ys) - low) * PLANTED;
    for (let i = 1; i < samples.length; i++) {
      const [a, b] = [samples[i - 1], samples[i]];
      if (!a || !b || a.y > planted || b.y > planted) continue;
      // The character faces +z, so a planted foot slides towards -z.
      total += (a.z - b.z) / dt;
      count++;
    }
  }
  mixer.stopAllAction();
  if (count === 0 || total <= 0) throw new Error('Walk clip has no planted feet');
  return total / count;
}

const WALK_KEYS = 32;
const WALK_SECONDS = 1;
/** How far each thigh swings forward and back from straight down, in degrees. */
const THIGH_SWING = 27;
const ARM_SWING = 0.8;
const UP = new Vector3(0, 1, 0);

/** A smooth bump around `center` on a looping 0..1 phase. */
function bump(phase: number, center: number, width: number): number {
  const d = MathUtils.euclideanModulo(phase - center + 0.5, 1) - 0.5;
  return Math.exp(-(d * d) / (2 * width * width));
}

/** A direction in the model's forward/up plane, `degrees` forward of straight down. */
function downAndForward(degrees: number, sideways = 0): Vector3 {
  const r = MathUtils.degToRad(degrees);
  return new Vector3(sideways, -Math.cos(r), Math.sin(r));
}

/**
 * A relaxed walk cycle posed bone by bone, since the pack has no walk. One
 * second holds two steps: each thigh swings forward and back, the knee bends
 * most while the leg swings through and a little as weight lands on it, the
 * foot rolls from heel to toe, the arms swing against the legs with soft
 * elbows, and the hips rise and fall so the standing foot stays on the floor.
 * `model` must be a scaled, unrotated copy of the character; it is posed in place.
 */
export function createWalkCycle(model: Object3D, idle: AnimationClip): AnimationClip {
  new AnimationMixer(model).clipAction(idle).play().getMixer().update(0);
  model.updateMatrixWorld(true);

  const bone = (name: string) => {
    const found = model.getObjectByName(name);
    if (!found) throw new Error(`Character bone ${name} is missing`);
    return found as Bone;
  };
  // Every bone with its standing pose and the keys recorded for it.
  const keyed: { bone: Bone; quaternion: Quaternion; position: Vector3; keys: number[] }[] = [];
  model.traverse((node) => {
    const b = node as Bone;
    if (b.isBone) {
      keyed.push({
        bone: b,
        quaternion: b.quaternion.clone(),
        position: b.position.clone(),
        keys: [],
      });
    }
  });
  const restore = () => {
    for (const k of keyed) {
      k.bone.quaternion.copy(k.quaternion);
      k.bone.position.copy(k.position);
    }
    model.updateMatrixWorld(true);
  };
  const world = (b: Bone) => b.getWorldPosition(new Vector3());
  const ankleRest = world(bone('LeftFoot')).y;
  const toeRest = { Left: new Vector3(), Right: new Vector3() };
  for (const side of ['Left', 'Right'] as const) {
    toeRest[side] = world(bone(`${side}Toes`))
      .sub(world(bone(`${side}Foot`)))
      .normalize();
  }
  const hips = bone('HipsCtrl');

  const times: number[] = [];
  const hipPositions: number[] = [];
  for (let i = 0; i <= WALK_KEYS; i++) {
    const phase = i / WALK_KEYS;
    restore();
    for (const side of ['Left', 'Right'] as const) {
      const p = side === 'Left' ? phase : phase + 0.5;
      const out = Math.sign(world(bone(`${side}UpLeg`)).x);
      const thigh = THIGH_SWING * Math.sin(2 * Math.PI * p);
      // Most bend while swinging through, a little as the heel takes the weight.
      const knee =
        5 +
        58 * Math.pow(Math.max(0, Math.cos(2 * Math.PI * (p + 0.04))), 1.5) +
        12 * bump(p, 0.36, 0.06);
      aim(bone(`${side}UpLeg`), bone(`${side}Leg`), downAndForward(thigh, out * 0.04));
      aim(bone(`${side}Leg`), bone(`${side}Foot`), downAndForward(thigh - knee, out * 0.02));
      // Heel first (toes up), flat while standing, pushing off the toes, then toes up to clear the floor.
      const roll = 22 * bump(p, 0.7, 0.07) - 12 * bump(p, 0.26, 0.05) - 8 * bump(p, 0.02, 0.1);
      const toes = toeRest[side].clone().applyAxisAngle(SIDEWAYS, MathUtils.degToRad(roll));
      aim(bone(`${side}Foot`), bone(`${side}Toes`), toes);

      // Arms swing against the leg on the same side; elbows stay soft and bend more going forward.
      const arm = -ARM_SWING * thigh;
      aim(bone(`${side}Arm`), bone(`${side}ForeArm`), downAndForward(arm, out * 0.16));
      aim(
        bone(`${side}ForeArm`),
        bone(`${side}Hand`),
        downAndForward(arm + 14 + Math.max(0, arm) * 0.6, out * 0.06),
      );
    }
    // The shoulders turn a little against the hips.
    const twist = Math.sin(2 * Math.PI * phase);
    rotateInWorld(
      bone('Hips'),
      new Quaternion().setFromAxisAngle(UP, MathUtils.degToRad(-5 * twist)),
    );
    rotateInWorld(
      bone('Chest'),
      new Quaternion().setFromAxisAngle(UP, MathUtils.degToRad(8 * twist)),
    );
    tilt(bone('Spine'), 3);

    // Lift or lower the body so the lower ankle is back at standing height.
    const low = Math.min(world(bone('LeftFoot')).y, world(bone('RightFoot')).y);
    const shifted = world(hips).setY(world(hips).y + ankleRest - low);
    hips.position.copy(hips.parent ? hips.parent.worldToLocal(shifted) : shifted);
    model.updateMatrixWorld(true);

    times.push(phase * WALK_SECONDS);
    for (const k of keyed) k.keys.push(...k.bone.quaternion.toArray());
    hipPositions.push(...hips.position.toArray());
  }
  restore();

  const tracks: (QuaternionKeyframeTrack | VectorKeyframeTrack)[] = [];
  for (const { bone: b, position, keys } of keyed) {
    tracks.push(new QuaternionKeyframeTrack(`${b.name}.quaternion`, times, keys));
    tracks.push(
      b === hips
        ? new VectorKeyframeTrack(`${b.name}.position`, times, hipPositions)
        : new VectorKeyframeTrack(`${b.name}.position`, [0], position.toArray()),
    );
  }
  return new AnimationClip('Walk', WALK_SECONDS, tracks);
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
