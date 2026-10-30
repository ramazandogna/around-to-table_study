import type { Activity } from '@att/shared';
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
} from 'three';
import { instance } from './instancing';
import type { Furniture } from './models';

/**
 * Builds what lies on the table in front of a seated person, by activity.
 * Props are built in a local frame: origin on the table top in front of the
 * seat, +z pointing away from the person, -x towards their right hand.
 */
export type TableProps = (activity: Activity) => Group | null;

const MUG_RADIUS = 0.045;
const MUG_HEIGHT = 0.1;

export function createTableProps(furniture: Furniture): TableProps {
  const ceramic = new MeshStandardMaterial({ color: 0xf3ece0, roughness: 0.4 });
  const coffee = new MeshStandardMaterial({ color: 0x4a2c1a, roughness: 0.2 });
  const cover = new MeshStandardMaterial({ color: 0x8b2e2e, roughness: 0.8 });
  const paper = new MeshStandardMaterial({ color: 0xf6efdc, roughness: 0.9 });
  const pencilWood = new MeshStandardMaterial({ color: 0xe8b33a, roughness: 0.7 });

  const mug = () => {
    const group = new Group();
    const body = new Mesh(
      new CylinderGeometry(MUG_RADIUS, MUG_RADIUS * 0.9, MUG_HEIGHT, 16),
      ceramic,
    );
    body.position.y = MUG_HEIGHT / 2;
    const top = new Mesh(
      new CylinderGeometry(MUG_RADIUS * 0.85, MUG_RADIUS * 0.85, 0.004, 16),
      coffee,
    );
    top.position.y = MUG_HEIGHT - 0.012;
    const handle = new Mesh(new TorusGeometry(0.026, 0.008, 6, 12), ceramic);
    handle.position.set(-MUG_RADIUS - 0.012, MUG_HEIGHT / 2, 0);
    group.add(body, top, handle);
    return group;
  };

  const openBook = () => {
    const group = new Group();
    const back = new Mesh(new BoxGeometry(0.36, 0.012, 0.25), cover);
    back.position.y = 0.006;
    group.add(back);
    // Pages rise slightly towards the spine, the way an open book lies.
    for (const side of [-1, 1]) {
      const page = new Mesh(new BoxGeometry(0.165, 0.018, 0.23), paper);
      page.position.set(side * 0.086, 0.02, 0);
      page.rotation.z = side * -0.07;
      group.add(page);
    }
    const pencil = new Mesh(new CylinderGeometry(0.006, 0.006, 0.17, 6), pencilWood);
    pencil.rotation.set(Math.PI / 2, 0, 0.5);
    pencil.position.set(-0.24, 0.007, 0.02);
    group.add(pencil);
    const stack = instance(furniture.books, [
      { x: 0.3, z: 0.08, rotation: 0.4, scale: [0.7, 0.7, 0.7] },
    ]);
    group.add(stack);
    return group;
  };

  const laptop = () => instance(furniture.laptop, [{ x: 0, z: 0.02, scale: [0.75, 0.75, 0.75] }]);

  return (activity) => {
    let props: Group | null = null;
    if (activity === 'focus') {
      props = mug();
      props.position.set(-0.18, 0, -0.06);
      props.rotation.y = 2.4;
    } else if (activity === 'reading') props = openBook();
    else if (activity === 'online') props = laptop();
    props?.traverse((child) => {
      child.castShadow = true;
      child.receiveShadow = true;
    });
    return props && new Group().add(props);
  };
}
