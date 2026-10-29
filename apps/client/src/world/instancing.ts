import { Euler, Group, InstancedMesh, Matrix4, Quaternion, Vector3, type Material } from 'three';
import type { ModelTemplate } from './models';

export type Placement = {
  x: number;
  z: number;
  y?: number;
  /** Radians around the vertical axis. */
  rotation?: number;
  scale?: readonly [number, number, number];
};

type Options = {
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** Replaces every material of the model. */
  material?: Material;
  /** Replaces materials by their MTL name, e.g. to tint only the plaster of a wall. */
  materialsByName?: Readonly<Record<string, Material>>;
};

function resolveMaterial(material: Material | Material[], options: Options): Material | Material[] {
  if (options.material) return options.material;
  const byName = options.materialsByName;
  if (!byName) return material;
  const swap = (m: Material) => byName[m.name] ?? m;
  return Array.isArray(material) ? material.map(swap) : swap(material);
}

/** Rotation that turns a Kenney model's front (+z) towards the given direction. */
export function facing(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

/** Places many copies of a model with one draw call per material part. */
export function instance(
  template: ModelTemplate,
  placements: readonly Placement[],
  options: Options = {},
): Group {
  const group = new Group();
  if (placements.length === 0) return group;

  const matrix = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const euler = new Euler();

  for (const part of template.parts) {
    const mesh = new InstancedMesh(
      part.geometry,
      resolveMaterial(part.material, options),
      placements.length,
    );
    placements.forEach((p, i) => {
      position.set(p.x, p.y ?? 0, p.z);
      rotation.setFromEuler(euler.set(0, p.rotation ?? 0, 0));
      scale.set(...(p.scale ?? [1, 1, 1]));
      mesh.setMatrixAt(i, matrix.compose(position, rotation, scale));
    });
    mesh.castShadow = options.castShadow ?? true;
    mesh.receiveShadow = options.receiveShadow ?? true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}
