import { Box3, Vector3, type Group, type Mesh } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const PATH = 'models/arcade/';

/** The smoking room's machines, from Kenney's Mini Arcade (CC0). */
export const MACHINES = ['arcade', 'claw', 'vending'] as const;
export type Machine = (typeof MACHINES)[number];

const FILES: Record<Machine, { file: string; height: number }> = {
  // A little taller than a person, as these cabinets are.
  arcade: { file: 'arcade-machine', height: 1.55 },
  claw: { file: 'claw-machine', height: 1.65 },
  vending: { file: 'vending-machine', height: 1.6 },
};

export type ArcadeKit = { create: (machine: Machine) => Group };

let kit: Promise<ArcadeKit> | null = null;

/** Loads the machines once, each scaled to its height and standing on y = 0. */
export function loadArcadeKit(): Promise<ArcadeKit> {
  kit ??= (async () => {
    const loader = new GLTFLoader().setPath(PATH);
    const loaded = new Map<Machine, Group>();
    await Promise.all(
      MACHINES.map(async (machine) => {
        const { file, height } = FILES[machine];
        const scene = (await loader.loadAsync(`${file}.glb`)).scene;
        const box = new Box3().setFromObject(scene);
        const scale = height / box.getSize(new Vector3()).y;
        scene.scale.setScalar(scale);
        scene.position.y = -box.min.y * scale;
        scene.traverse((child) => {
          const mesh = child as Mesh;
          if (mesh.isMesh) mesh.castShadow = true;
        });
        loaded.set(machine, scene);
      }),
    );
    return {
      create: (machine) => {
        const source = loaded.get(machine);
        if (!source) throw new Error(`Machine ${machine} is missing`);
        return source.clone();
      },
    };
  })();
  return kit;
}
