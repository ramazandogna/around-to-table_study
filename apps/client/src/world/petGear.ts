import type { PetAccessory } from '@att/shared';
import {
  Box3,
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Object3D,
} from 'three';

/**
 * Small things a pet can wear, built from simple shapes in the same chunky
 * style as Kenney's Cube Pets. They hang on the pet's body, so they bob along
 * when it walks. Each is placed by the size of that body, so any kind of pet
 * can wear any of them.
 */

const material = (color: string, metal = false) =>
  new MeshStandardMaterial({ color, roughness: metal ? 0.3 : 0.8, metalness: metal ? 0.7 : 0 });

/** Marks meshes made here, so the pet throws them away with itself. */
function own(mesh: Mesh): Mesh {
  mesh.userData.ownGear = true;
  mesh.castShadow = true;
  return mesh;
}

export function dressPet(model: Group, accessory: PetAccessory): void {
  // Most pets wear things on their body (head and body in one); a turtle on its head.
  const anchor = (model.userData.gearOn as string | undefined) ?? 'body';
  const body = (model.getObjectByName(anchor) ?? model) as Object3D & { geometry?: BufferGeometry };
  const geometry = body.geometry;
  if (!geometry) return;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox ?? new Box3();
  const w = box.max.x - box.min.x;
  const h = box.max.y - box.min.y;
  const d = box.max.z - box.min.z;
  const cx = (box.min.x + box.max.x) / 2;
  const front = box.max.z;
  const top = box.max.y;
  const gear = new Group();
  gear.name = 'gear';

  const band = (y: number, height: number, colour: string) =>
    own(new Mesh(new BoxGeometry(w * 1.04, height, d * 1.04), material(colour)))
      .translateX(cx)
      .translateY(y)
      .translateZ((box.min.z + box.max.z) / 2);

  switch (accessory) {
    case 'collar':
      gear.add(band(box.min.y + h * 0.28, h * 0.07, '#c0392b'));
      break;
    case 'bell': {
      gear.add(band(box.min.y + h * 0.28, h * 0.06, '#2e6fd8'));
      const bell = own(new Mesh(new SphereGeometry(h * 0.08, 10, 8), material('#f2c230', true)));
      bell.position.set(cx, box.min.y + h * 0.2, front + h * 0.05);
      gear.add(bell);
      break;
    }
    case 'scarf': {
      gear.add(band(box.min.y + h * 0.3, h * 0.1, '#5cc37c'));
      const tail = own(
        new Mesh(new BoxGeometry(w * 0.16, h * 0.28, h * 0.04), material('#e65f4f')),
      );
      tail.position.set(cx + w * 0.22, box.min.y + h * 0.16, front + h * 0.03);
      tail.rotation.z = 0.15;
      gear.add(tail);
      break;
    }
    case 'bow': {
      // On one ear, as a ribbon is.
      const pink = material('#f07fb4');
      for (const side of [-1, 1]) {
        const loop = own(new Mesh(new ConeGeometry(h * 0.09, h * 0.16, 4), pink));
        loop.rotation.z = (side * Math.PI) / 2;
        loop.position.set(box.min.x + w * 0.22 + side * h * 0.08, top + h * 0.02, front - d * 0.25);
        gear.add(loop);
      }
      const knot = own(new Mesh(new SphereGeometry(h * 0.045, 8, 6), pink));
      knot.position.set(box.min.x + w * 0.22, top + h * 0.02, front - d * 0.25);
      gear.add(knot);
      break;
    }
    case 'hat': {
      // A party hat, a little crooked.
      const cone = own(new Mesh(new ConeGeometry(h * 0.16, h * 0.42, 12), material('#4f7fd8')));
      cone.position.set(cx + w * 0.08, top + h * 0.2, (box.min.z + box.max.z) / 2);
      cone.rotation.z = -0.18;
      gear.add(cone);
      const pom = own(new Mesh(new SphereGeometry(h * 0.06, 8, 6), material('#f7d154')));
      pom.position.set(cx + w * 0.08 + h * 0.07, top + h * 0.41, (box.min.z + box.max.z) / 2);
      gear.add(pom);
      const brim = own(
        new Mesh(new CylinderGeometry(h * 0.17, h * 0.17, h * 0.02, 12), material('#f7d154')),
      );
      brim.position.set(cx + w * 0.08, top + 0.002, (box.min.z + box.max.z) / 2);
      gear.add(brim);
      break;
    }
    case 'glasses': {
      const dark = material('#26262b');
      const eyeY = box.min.y + h * 0.62;
      for (const side of [-1, 1]) {
        const ring = own(new Mesh(new TorusGeometry(h * 0.1, h * 0.022, 6, 14), dark));
        ring.position.set(cx + side * w * 0.2, eyeY, front + h * 0.02);
        gear.add(ring);
      }
      const bridge = own(new Mesh(new BoxGeometry(w * 0.18, h * 0.03, h * 0.02), dark));
      bridge.position.set(cx, eyeY, front + h * 0.02);
      gear.add(bridge);
      break;
    }
  }
  body.add(gear);
}
