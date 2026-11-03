import type { Appearance } from '@att/shared';
import {
  AnimationMixer,
  Box3,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
  type Mesh,
} from 'three';
import { loadCharacterKit } from './characters';

/** Portraits are drawn this many pixels square (shown at half that, sharp on phones). */
const SIZE = 96;

let stage: { renderer: WebGLRenderer; scene: Scene; camera: PerspectiveCamera } | null = null;
const cache = new Map<string, Promise<string>>();
/** One portrait at a time through the one small renderer. */
let queue: Promise<unknown> = Promise.resolve();

function stageOnce() {
  if (stage) return stage;
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE, false);
  const scene = new Scene();
  const sun = new DirectionalLight(0xfff1dc, 2.2);
  sun.position.set(1.5, 3, 4);
  scene.add(new HemisphereLight(0xfff4e0, 0x5a4636, 1.9), sun);
  stage = { renderer, scene, camera: new PerspectiveCamera(24, 1, 0.05, 20) };
  return stage;
}

/**
 * A small picture of someone's face, made from their character, as a data
 * URL: one hidden renderer draws them one after another, and each look is
 * drawn once. Used where a name alone is not enough, like a name search.
 */
export function portrait(look: Appearance): Promise<string> {
  const key = JSON.stringify(look);
  let found = cache.get(key);
  if (!found) {
    found = queue = queue.then(
      () => draw(look),
      () => draw(look),
    );
    cache.set(key, found);
  }
  return found;
}

async function draw(look: Appearance): Promise<string> {
  const kit = await loadCharacterKit();
  const { renderer, scene, camera } = stageOnce();
  const { model, clips } = kit.create({ ...look, pet: undefined } as Appearance);
  // Standing still, as in the idle pose's first moment.
  const mixer = new AnimationMixer(model);
  mixer.clipAction(clips.idle).play();
  mixer.update(0);
  scene.add(model);
  model.updateMatrixWorld(true);
  // The head is the top of the body: frame it from the front, a little above.
  const box = new Box3().setFromObject(model);
  const height = box.max.y - box.min.y;
  const head = new Vector3(0, box.max.y - height * 0.25, 0);
  camera.position.set(0, head.y + height * 0.06, height * 1.35);
  camera.lookAt(head);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  mixer.stopAllAction();
  scene.remove(model);
  model.traverse((child) => {
    const mesh = child as Mesh;
    if (mesh.isMesh) mesh.geometry.dispose();
  });
  return url;
}
