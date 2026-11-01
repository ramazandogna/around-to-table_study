import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three';

/**
 * A cigarette between the fingers and the smoke that comes of it: a slow
 * breath of soft puffs after each drag, and a thin wisp from the ember now
 * and then. Built from simple shapes, small next to the chunky characters.
 */

const PAPER = new MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.8 });
const FILTER = new MeshStandardMaterial({ color: '#d9a35b', roughness: 0.8 });
const STICK = new CylinderGeometry(0.014, 0.014, 0.11, 8);
const TIP = new CylinderGeometry(0.0145, 0.0145, 0.035, 8);
const ASH = new CylinderGeometry(0.0142, 0.0142, 0.012, 8);
const PUFF = new SphereGeometry(1, 10, 8);

export class Cigarette {
  readonly group = new Group();
  private readonly ember: MeshStandardMaterial;

  constructor() {
    this.ember = new MeshStandardMaterial({
      color: '#5a2b16',
      emissive: '#ff5a1f',
      emissiveIntensity: 0.6,
      roughness: 0.6,
    });
    // Held across the fingers, pointing forwards.
    const paper = new Mesh(STICK, PAPER);
    const filter = new Mesh(TIP, FILTER);
    filter.position.y = -0.07;
    const ember = new Mesh(ASH, this.ember);
    ember.position.y = 0.06;
    this.group.add(paper, filter, ember);
    this.group.rotation.x = Math.PI / 2;
    this.group.visible = false;
  }

  /** The ember's world position, where the wisps rise from. */
  emberAt(target: Vector3): Vector3 {
    return this.group.localToWorld(target.set(0, 0.07, 0));
  }

  /** 0 resting, 1 during a drag. */
  glow(level: number): void {
    this.ember.emissiveIntensity = 0.5 + level * 1.8;
  }

  dispose(): void {
    this.ember.dispose();
    this.group.removeFromParent();
  }
}

type Puff = {
  mesh: Mesh;
  material: MeshBasicMaterial;
  age: number;
  life: number;
  drift: Vector3;
  size: number;
};

/** Soft grey puffs that rise, swell and fade; they live in the room, not on the body. */
export class SmokePuffs {
  readonly group = new Group();
  private readonly puffs: Puff[] = [];

  /** A breath out: a few puffs from the mouth, drifting the way the person faces. */
  breathe(from: Vector3, facing: number): void {
    for (let i = 0; i < 4; i++) {
      this.add(
        from,
        new Vector3(Math.sin(facing) * 0.18, 0.22 + i * 0.03, Math.cos(facing) * 0.18),
        0.035 + i * 0.008,
        2.2 + i * 0.3,
        i * 0.12,
      );
    }
  }

  /** A thin wisp from the ember. */
  wisp(from: Vector3): void {
    this.add(from, new Vector3((Math.random() - 0.5) * 0.04, 0.16, 0), 0.012, 1.6, 0);
  }

  private add(from: Vector3, drift: Vector3, size: number, life: number, delay: number): void {
    const material = new MeshBasicMaterial({
      color: '#e8e6e2',
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const mesh = new Mesh(PUFF, material);
    mesh.position.copy(from);
    mesh.scale.setScalar(size);
    this.group.add(mesh);
    this.puffs.push({ mesh, material, age: -delay, life, drift, size });
  }

  update(delta: number): void {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const puff = this.puffs[i];
      if (!puff) continue;
      puff.age += delta;
      if (puff.age < 0) continue;
      const share = puff.age / puff.life;
      if (share >= 1) {
        puff.material.dispose();
        puff.mesh.removeFromParent();
        this.puffs.splice(i, 1);
        continue;
      }
      puff.mesh.position.addScaledVector(puff.drift, delta * (1 - share * 0.6));
      puff.mesh.scale.setScalar(puff.size * (1 + share * 3.5));
      puff.material.opacity = 0.42 * Math.min(1, share * 6) * (1 - share);
    }
  }

  dispose(): void {
    for (const puff of this.puffs) puff.material.dispose();
    this.puffs.length = 0;
    this.group.removeFromParent();
  }
}
