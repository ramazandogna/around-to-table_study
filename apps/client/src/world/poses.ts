import {
  AnimationClip,
  Euler,
  MathUtils,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
  type KeyframeTrack,
} from 'three';

/**
 * Kenney's Mini Characters ship idle, walk, sit and a few gestures. What a
 * study place needs on top (sitting at a table, dancing, waving) is posed here
 * on their simple rig: a root with two legs, a torso, two arms and a head.
 * The characters face +z. Legs and the body rest upright; the arms rest
 * straight out to the sides (a T-pose), so arms are posed by where they point.
 */

/** Which way each arm points at rest. */
const ARM_REST = { 'arm-left': new Vector3(1, 0, 0), 'arm-right': new Vector3(-1, 0, 0) } as const;
type Arm = keyof typeof ARM_REST;
type Direction = readonly [number, number, number];

/** An arm rotation that points it along [x (its own side), y (up), z (forward)]. */
function pointArm(arm: Arm, [side, up, forward]: Direction): number[] {
  const rest = ARM_REST[arm];
  const target = new Vector3(rest.x * side, up, forward).normalize();
  return new Quaternion().setFromUnitVectors(rest, target).toArray();
}

/** A looping arm track from [time, direction] keys. */
function arms(arm: Arm, keys: readonly (readonly [number, Direction])[]) {
  return new QuaternionKeyframeTrack(
    `${arm}.quaternion`,
    keys.map(([time]) => time),
    keys.flatMap(([, direction]) => pointArm(arm, direction)),
  );
}

/** Arms hanging loosely by the sides. */
const DOWN: Direction = [0.36, -0.93, 0];

/** A rotation from degrees about x, y and z. */
function rotation(x: number, y = 0, z = 0): number[] {
  const euler = new Euler(MathUtils.degToRad(x), MathUtils.degToRad(y), MathUtils.degToRad(z));
  return new Quaternion().setFromEuler(euler).toArray();
}

/** A looping rotation track from [time, x, y, z] keys in degrees. */
function turns(node: string, keys: readonly (readonly [number, number, number?, number?])[]) {
  return new QuaternionKeyframeTrack(
    `${node}.quaternion`,
    keys.map(([time]) => time),
    keys.flatMap(([, x, y, z]) => rotation(x, y, z)),
  );
}

/**
 * Sitting at a table: the sit pose with the forearms on the table top, the
 * back leaning in and the head down to the work, breathing slowly.
 */
export function createStudyPose(sit: AnimationClip): AnimationClip {
  const breath = 3.2;
  const kept = sit.tracks.filter((track) => !/^(arm-left|arm-right|torso|head)\./.test(track.name));
  const tracks: KeyframeTrack[] = kept.map((track) => {
    // Hold the sit pose's first frame for the whole breath.
    const size = track.getValueSize();
    const first = Array.from(track.values.slice(0, size));
    const TrackType = track.constructor as new (
      name: string,
      times: number[],
      values: number[],
    ) => KeyframeTrack;
    return new TrackType(track.name, [0], first);
  });
  tracks.push(
    turns('torso', [
      [0, 9],
      [breath / 2, 12],
      [breath, 9],
    ]),
    turns('head', [
      [0, 14],
      [breath / 2, 12],
      [breath, 14],
    ]),
    // Forearms forward onto the desk, hands a little towards each other.
    arms('arm-left', [[0, [-0.1, -0.32, 0.94]]]),
    arms('arm-right', [[0, [-0.1, -0.32, 0.94]]]),
  );
  return new AnimationClip('study', breath, tracks);
}

/** A cheerful two-beat dance: bouncing, swaying, arms up in turn and little kicks. */
export function createDanceCycle(): AnimationClip {
  const beat = 0.5;
  const times = [0, beat / 2, beat, (beat * 3) / 2, beat * 2];
  const tracks: KeyframeTrack[] = [
    new VectorKeyframeTrack(
      'root.position',
      times,
      times.flatMap((time, i) => [0, i % 2 ? 0.025 : 0, 0]),
    ),
    turns('torso', [
      [0, 0, 0, 0],
      [beat / 2, 4, 10, 9],
      [beat, 0, 0, 0],
      [(beat * 3) / 2, 4, -10, -9],
      [beat * 2, 0, 0, 0],
    ]),
    turns('head', [
      [0, -6, 0, 0],
      [beat / 2, 8, 0, -8],
      [beat, -6, 0, 0],
      [(beat * 3) / 2, 8, 0, 8],
      [beat * 2, -6, 0, 0],
    ]),
    // One arm up while the other swings down, then the other way round.
    arms('arm-left', [
      [0, [0.35, 0.94, 0.05]],
      [beat / 2, [1, 0.15, 0.3]],
      [beat, [0.5, -0.85, 0.2]],
      [(beat * 3) / 2, [1, 0.15, 0.3]],
      [beat * 2, [0.35, 0.94, 0.05]],
    ]),
    arms('arm-right', [
      [0, [0.5, -0.85, 0.2]],
      [beat / 2, [1, 0.15, 0.3]],
      [beat, [0.35, 0.94, 0.05]],
      [(beat * 3) / 2, [1, 0.15, 0.3]],
      [beat * 2, [0.5, -0.85, 0.2]],
    ]),
    turns('leg-left', [
      [0, 0],
      [beat / 2, -28],
      [beat, 0],
      [beat * 2, 0],
    ]),
    turns('leg-right', [
      [0, 0],
      [beat, 0],
      [(beat * 3) / 2, -28],
      [beat * 2, 0],
    ]),
  ];
  return new AnimationClip('dance', beat * 2, tracks);
}

/** Raises the right hand and waves it a few times. */
export function createWaveGesture(): AnimationClip {
  const tracks = [
    arms('arm-right', [
      [0, DOWN],
      [0.2, [0.45, 0.88, 0.12]],
      [0.4, [0.75, 0.62, 0.12]],
      [0.6, [0.3, 0.94, 0.12]],
      [0.8, [0.75, 0.62, 0.12]],
      [1.0, [0.45, 0.88, 0.12]],
      [1.25, DOWN],
    ]),
    turns('head', [
      [0, 0, 0, 0],
      [0.3, 0, 0, 6],
      [1.0, 0, 0, 6],
      [1.25, 0, 0, 0],
    ]),
  ];
  return new AnimationClip('wave', 1.25, tracks);
}

/** When in the smoking cycle the smoke comes out, in seconds. */
export const SMOKE_EXHALE_AT = 3.1;
/** When in the smoking cycle the cigarette is at the lips (the ember glows). */
export const SMOKE_DRAG = { from: 1.6, to: 2.5 } as const;

/**
 * Smoking while standing: the cigarette held low by the right hand, raised to
 * the lips for a slow drag, lowered again, then a breath of smoke out with the
 * chin up a little. The rest of the body keeps its idle breathing (its tracks
 * are repeated to fill the cycle).
 */
export function createSmokeCycle(idle: AnimationClip): AnimationClip {
  const repeats = Math.max(1, Math.round(5 / idle.duration));
  const length = idle.duration * repeats;
  const tracks: KeyframeTrack[] = idle.tracks
    .filter((track) => !/^(arm-right|head)\./.test(track.name))
    .map((track) => repeat(track, idle.duration, repeats));
  const low: Direction = [0.5, -0.7, 0.5];
  const lips: Direction = [-0.5, 0.5, 0.7];
  const at = (share: number) => (share / 5) * length;
  tracks.push(
    arms('arm-right', [
      [0, low],
      [at(1.2), low],
      [at(SMOKE_DRAG.from), lips],
      [at(SMOKE_DRAG.to), lips],
      [at(2.9), low],
      [length, low],
    ]),
    turns('head', [
      [0, 0],
      [at(SMOKE_DRAG.from), -4],
      [at(SMOKE_DRAG.to), -8],
      [at(SMOKE_EXHALE_AT), -14, 6],
      [at(3.9), -2],
      [length, 0],
    ]),
  );
  return new AnimationClip('smoke', length, tracks);
}

/** A track played `times` over in a row, so a short loop fills a longer clip. */
function repeat(track: KeyframeTrack, duration: number, times: number): KeyframeTrack {
  const keys = track.times.length;
  const size = track.getValueSize();
  const timesOut: number[] = [];
  const valuesOut: number[] = [];
  for (let n = 0; n < times; n++) {
    for (let i = 0; i < keys; i++) {
      const time = (track.times[i] ?? 0) + n * duration;
      // The first key of a later round sits where the last one of the round before ended.
      if (n > 0 && i === 0 && time <= (timesOut[timesOut.length - 1] ?? -1)) continue;
      timesOut.push(time);
      valuesOut.push(...Array.from(track.values.slice(i * size, (i + 1) * size)));
    }
  }
  const TrackType = track.constructor as new (
    name: string,
    times: number[],
    values: number[],
  ) => KeyframeTrack;
  return new TrackType(track.name, timesOut, valuesOut);
}
