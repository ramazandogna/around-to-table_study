import type { Appearance } from '@att/shared';
import {
  AnimationMixer,
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  type Group,
} from 'three';
import { loadCharacterKit, type CharacterKit } from './characters';

const TURN_EASE = 8;

/** A small stage that shows one character turning in place, for the character creator. */
export class PreviewStage {
  private readonly renderer = new WebGLRenderer({ antialias: true, alpha: true });
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(26, 1, 0.1, 20);
  private readonly resizeObserver: ResizeObserver;
  private kit: CharacterKit | null = null;
  private model: Group | null = null;
  private mixer: AnimationMixer | null = null;
  private yaw = 0;
  private disposed = false;

  constructor(
    private readonly host: HTMLElement,
    private look: Appearance,
  ) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(this.renderer.domElement);
    this.camera.position.set(0, 1.05, 4.6);
    this.camera.lookAt(0, 0.85, 0);
    const sun = new DirectionalLight(0xfff1dc, 2);
    sun.position.set(2, 4, 3);
    this.scene.add(new HemisphereLight(0xfff4e0, 0x5a4636, 1.8), sun);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();

    void loadCharacterKit().then((kit) => {
      if (this.disposed) return;
      this.kit = kit;
      this.model = kit.create(this.look);
      this.mixer = new AnimationMixer(this.model);
      this.mixer.clipAction(kit.clips.idle).play();
      this.scene.add(this.model);
    });

    let last = performance.now();
    this.renderer.setAnimationLoop((now) => {
      const delta = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (this.model) {
        const ease = 1 - Math.exp(-TURN_EASE * delta);
        this.model.rotation.y = MathUtils.lerp(this.model.rotation.y, this.yaw, ease);
      }
      this.mixer?.update(delta);
      this.renderer.render(this.scene, this.camera);
    });
  }

  setLook(look: Appearance): void {
    this.look = look;
    if (this.kit && this.model) this.kit.dress(this.model, look);
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
