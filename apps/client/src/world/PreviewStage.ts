import type { Appearance } from '@att/shared';
import {
  AnimationMixer,
  DirectionalLight,
  Group,
  HemisphereLight,
  MathUtils,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  type Mesh,
} from 'three';
import { loadCharacterKit, type CharacterKit } from './characters';
import { loadPetKit, type PetKit } from './pets';

const TURN_EASE = 8;
/** With a pet the person steps aside a little, and the pet sits at their feet. */
const WITH_PET_SHIFT = -0.22;
const PET_SPOT = { x: 0.42, z: 0.28 };

/** A small stage that shows one character turning in place, for the character creator. */
export class PreviewStage {
  private readonly renderer = new WebGLRenderer({ antialias: true, alpha: true });
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(26, 1, 0.1, 20);
  private readonly resizeObserver: ResizeObserver;
  private kit: CharacterKit | null = null;
  private petKit: PetKit | null = null;
  /** Turns as one: the character and, beside them, their pet. */
  private readonly turntable = new Group();
  private model: Group | null = null;
  private pet: Group | null = null;
  private mixer: AnimationMixer | null = null;
  private petMixer: AnimationMixer | null = null;
  private yaw = 0;
  private disposed = false;

  constructor(
    private readonly host: HTMLElement,
    private look: Appearance,
  ) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(this.renderer.domElement);
    this.camera.position.set(0, 0.95, 4.2);
    this.camera.lookAt(0, 0.72, 0);
    const sun = new DirectionalLight(0xfff1dc, 2);
    sun.position.set(2, 4, 3);
    this.scene.add(new HemisphereLight(0xfff4e0, 0x5a4636, 1.8), sun, this.turntable);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();

    void Promise.all([loadCharacterKit(), loadPetKit()]).then(([kit, petKit]) => {
      if (this.disposed) return;
      this.kit = kit;
      this.petKit = petKit;
      this.show(this.look);
    });

    let last = performance.now();
    this.renderer.setAnimationLoop((now) => {
      const delta = Math.min((now - last) / 1000, 0.1);
      last = now;
      const ease = 1 - Math.exp(-TURN_EASE * delta);
      this.turntable.rotation.y = MathUtils.lerp(this.turntable.rotation.y, this.yaw, ease);
      this.mixer?.update(delta);
      this.petMixer?.update(delta);
      this.renderer.render(this.scene, this.camera);
    });
  }

  setLook(look: Appearance): void {
    this.look = look;
    if (this.kit) this.show(look);
  }

  /** Swaps in the chosen character, and their pet if they have one. */
  private show(look: Appearance): void {
    if (!this.kit) return;
    this.mixer?.stopAllAction();
    this.removeModel();
    const { model, clips } = this.kit.create(look);
    this.model = model;
    this.mixer = new AnimationMixer(model);
    this.mixer.clipAction(clips.idle).play();
    this.turntable.add(model);

    this.petMixer?.stopAllAction();
    this.pet?.removeFromParent();
    this.pet = null;
    this.petMixer = null;
    model.position.x = look.pet ? WITH_PET_SHIFT : 0;
    if (look.pet && this.petKit) {
      const pet = this.petKit.create(look.pet, {
        ...(look.petColor !== undefined ? { petColor: look.petColor } : {}),
        ...(look.petAccessory ? { petAccessory: look.petAccessory } : {}),
      });
      pet.model.position.set(PET_SPOT.x, 0, PET_SPOT.z);
      pet.model.rotation.y = -0.4;
      this.pet = pet.model;
      this.petMixer = new AnimationMixer(pet.model);
      this.petMixer.clipAction(pet.clips.idle).play();
      this.turntable.add(pet.model);
    }
  }

  /** The character's own geometry (coloured for its look) goes with it. */
  private removeModel(): void {
    if (!this.model) return;
    this.model.removeFromParent();
    this.model.traverse((child) => {
      const mesh = child as Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    this.model = null;
  }

  /** Turns the character to face `yaw` radians away from the camera's view. */
  setYaw(yaw: number): void {
    this.yaw = yaw;
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.mixer?.stopAllAction();
    this.petMixer?.stopAllAction();
    this.removeModel();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
