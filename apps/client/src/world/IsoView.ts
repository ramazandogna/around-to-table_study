import type { Point } from '@att/shared';
import {
  Color,
  DirectionalLight,
  HemisphereLight,
  OrthographicCamera,
  PCFShadowMap,
  Plane,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

/** The camera looks from the south-east, so the north and west walls are the back walls. */
const ISO_DIRECTION = new Vector3(1, 1.05, 1).normalize();
const CAMERA_DISTANCE = 40;
/** World units visible across the shorter side of the screen. */
const VIEW_SHORT_SIDE = { phone: 8, desktop: 11 };
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 3;

/** Renderer, isometric camera, lights and DOM label layer for one container. */
export class IsoView {
  readonly scene = new Scene();
  readonly camera = new OrthographicCamera();
  private readonly renderer: WebGLRenderer;
  private readonly labels = new CSS2DRenderer();
  private readonly sun = new DirectionalLight(0xfff1dc, 2.2);
  private readonly focus = new Vector3();
  private readonly raycaster = new Raycaster();
  private readonly floor = new Plane(new Vector3(0, 1, 0), 0);
  private readonly resizeObserver: ResizeObserver;
  /** Active touch points, for pinch zoom. */
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinchDistance = 0;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    const labels = this.labels.domElement;
    labels.className = 'world-labels';
    container.appendChild(labels);

    this.scene.background = new Color(0x1b1512);
    this.scene.add(new HemisphereLight(0xfff4e0, 0x5a4636, 1.6));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    const canvas = this.renderer.domElement;
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
  }

  /** True while two fingers are on the screen, so taps are not treated as walking. */
  get isPinching(): boolean {
    return this.pointers.size > 1;
  }

  zoomBy(factor: number): void {
    this.camera.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.camera.zoom * factor));
    this.camera.updateProjectionMatrix();
  }

  private readonly onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.zoomBy(Math.exp(-event.deltaY * 0.0015));
  };

  private readonly onPointerDown = (event: PointerEvent) => {
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.pinchDistance = this.currentPinchDistance();
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const distance = this.currentPinchDistance();
    if (distance > 0 && this.pinchDistance > 0) this.zoomBy(distance / this.pinchDistance);
    this.pinchDistance = distance;
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    this.pointers.delete(event.pointerId);
    this.pinchDistance = this.currentPinchDistance();
  };

  private currentPinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /** Fits the sun's shadow camera around a room of the given size. */
  setBounds(width: number, depth: number): void {
    const center = new Vector3(width / 2, 0, depth / 2);
    this.sun.position.copy(center).add(new Vector3(-8, 20, 10));
    this.sun.target.position.copy(center);
    const shadow = this.sun.shadow.camera;
    const extent = Math.max(width, depth) * 0.8;
    shadow.left = -extent;
    shadow.right = extent;
    shadow.top = extent;
    shadow.bottom = -extent;
    shadow.near = 1;
    shadow.far = 60;
    shadow.updateProjectionMatrix();
  }

  /** Moves the camera focus towards a world point; lerp 1 jumps straight there. */
  follow(x: number, z: number, lerp: number): void {
    this.focus.x += (x - this.focus.x) * lerp;
    this.focus.z += (z - this.focus.z) * lerp;
    this.camera.position.copy(this.focus).addScaledVector(ISO_DIRECTION, CAMERA_DISTANCE);
    this.camera.lookAt(this.focus);
  }

  /** The floor tile under a screen position, if any. */
  pickTile(clientX: number, clientY: number): Point | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.floor, new Vector3());
    return hit ? { x: Math.floor(hit.x), y: Math.floor(hit.z) } : null;
  }

  add(object: Object3D): void {
    this.scene.add(object);
  }

  remove(object: Object3D): void {
    this.scene.remove(object);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }

  setLoop(callback: ((deltaSeconds: number) => void) | null): void {
    let last = performance.now();
    this.renderer.setAnimationLoop(
      callback &&
        ((now: number) => {
          const delta = Math.min((now - last) / 1000, 0.1);
          last = now;
          callback(delta);
          this.render();
        }),
    );
  }

  dispose(): void {
    this.setLoop(null);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('wheel', this.onWheel);
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.resizeObserver.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    const short = Math.min(w, h) < 700 ? VIEW_SHORT_SIDE.phone : VIEW_SHORT_SIDE.desktop;
    const halfW = (w < h ? short : (short * w) / h) / 2;
    const halfH = (w < h ? (short * h) / w : short) / 2;
    Object.assign(this.camera, {
      left: -halfW,
      right: halfW,
      top: halfH,
      bottom: -halfH,
      near: 0.1,
      far: 200,
    });
    this.camera.updateProjectionMatrix();
  }
}
