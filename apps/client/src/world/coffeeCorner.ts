import { TILE, type AreaGrid, type Point } from '@att/shared';
import { Group, Mesh, MeshStandardMaterial, CylinderGeometry, type Material } from 'three';
import { instance } from './instancing';
import type { Furniture, ModelTemplate } from './models';

/**
 * The smoking room's coffee corner, from Kenney's Furniture Kit (CC0): a run
 * of kitchen counter against the wall with the coffee machine on it, a little
 * plant and a stack of cups, and bar stools tucked in under the front edge
 * (they stand inside the counter's tile, so they never block the floor).
 * Tapping it pours a coffee.
 */

export type CoffeeCorner = {
  root: Group;
  /** Where to stand to take a coffee, facing the counter. */
  stand: Point;
  /** The machine itself, in the room, for the soundscape's hiss. */
  machine: { x: number; z: number };
  materials: Material[];
};

/**
 * One copy of a furniture model, as a group to move about. Instanced like all
 * furniture, so the room's clean-up leaves the shared model alone.
 */
function place(template: ModelTemplate): Group {
  return instance(template, [{ x: 0, z: 0 }]);
}

/** Builds the corner on the room's coffee counter tiles; null where there are none. */
export function buildCoffeeCorner(
  grid: AreaGrid,
  furniture: Furniture,
  floorY: number,
): CoffeeCorner | null {
  const tiles: Point[] = [];
  grid.area.layout.forEach((row, y) =>
    [...row].forEach((c, x) => c === TILE.coffeeCounter && tiles.push({ x, y })),
  );
  const first = tiles[0];
  if (!first) return null;
  // Against the west wall, facing east into the room (the layout puts it there).
  const facing = Math.PI / 2;
  const root = new Group();
  const counterTop = furniture.kitchenCabinet.size.y;
  tiles.forEach((tile, i) => {
    const counter = place(i === 0 ? furniture.kitchenCabinet : furniture.kitchenBar);
    // Pushed back against the wall: the kit's counters are deeper than the bar.
    const depth = i === 0 ? furniture.kitchenCabinet.size.z : furniture.kitchenBar.size.z;
    counter.position.set(tile.x + 0.02 + depth / 2, floorY, tile.y + 0.5);
    counter.rotation.y = facing;
    root.add(counter);
  });
  // The machine on the first stretch of counter, with a plant at the far end.
  const machine = place(furniture.kitchenCoffeeMachine);
  machine.position.set(first.x + 0.35, floorY + counterTop, first.y + 0.5);
  machine.rotation.y = facing;
  root.add(machine);
  const last = tiles[tiles.length - 1] ?? first;
  const plant = place(furniture.plantSmall1);
  plant.position.set(last.x + 0.3, floorY + furniture.kitchenBar.size.y, last.y + 0.72);
  root.add(plant);
  // A stack of cups beside the machine, made here: a few short cylinders.
  const cup = new MeshStandardMaterial({ color: '#f4efe6', roughness: 0.6 });
  const cups = new Group();
  for (let i = 0; i < 3; i++) {
    const mesh = new Mesh(new CylinderGeometry(0.045, 0.035, 0.07, 10), cup);
    mesh.position.y = 0.035 + i * 0.05;
    mesh.castShadow = true;
    cups.add(mesh);
  }
  cups.position.set(first.x + 0.32, floorY + counterTop, first.y + 0.86);
  root.add(cups);
  // Bar stools along the bar, half under its overhang.
  for (const tile of tiles.slice(1)) {
    const stool = place(furniture.stoolBar);
    stool.scale.setScalar(0.8);
    stool.position.set(tile.x + 0.82, floorY, tile.y + 0.5);
    stool.rotation.y = facing;
    root.add(stool);
  }
  root.traverse((node) => (node.userData.examine = 'coffee'));
  const middle = tiles[Math.floor((tiles.length - 1) / 2)] ?? first;
  return {
    root,
    stand: { x: middle.x + 1, y: middle.y },
    machine: { x: first.x + 0.35, z: first.y + 0.5 },
    materials: [cup],
  };
}
