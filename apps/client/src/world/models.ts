import {
  Box3,
  MeshStandardMaterial,
  Vector3,
  type BufferGeometry,
  type Material,
  type Mesh,
  type MeshPhongMaterial,
} from 'three';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

/** Kenney "Furniture Kit" (CC0) models used in the areas. */
export const FURNITURE = [
  'floorFull',
  'wall',
  'wallWindow',
  'wallDoorway',
  'doorway',
  'doorwayOpen',
  'bookcaseClosedWide',
  'books',
  'chairCushion',
  'desk',
  'laptop',
  'lampRoundTable',
  'lampSquareFloor',
  'pottedPlant',
  'rugRectangle',
  'loungeSofa',
  'tableRound',
  'cardboardBoxClosed',
  'cardboardBoxOpen',
  'coatRackStanding',
] as const;

export type FurnitureName = (typeof FURNITURE)[number];

export type ModelPart = { geometry: BufferGeometry; material: Material | Material[] };

/**
 * A model normalized to tile units: 1 unit = 1 tile, footprint centered on the
 * origin, resting on y = 0. Unless rotated, its front faces +z.
 */
export type ModelTemplate = { parts: ModelPart[]; size: Vector3 };

export type Furniture = Record<FurnitureName, ModelTemplate>;

/** Kenney's furniture grid is 10 units per tile. */
const KENNEY_UNITS_PER_TILE = 10;
const MODEL_PATH = 'models/furniture/';

/** Phong materials from the MTL files look plastic; matte standard materials suit the art. */
function matte(material: Material): Material {
  const phong = material as MeshPhongMaterial;
  return new MeshStandardMaterial({
    name: phong.name,
    color: phong.color,
    roughness: 0.85,
    metalness: 0,
    transparent: phong.transparent,
    opacity: phong.opacity,
  });
}

async function loadModel(name: FurnitureName): Promise<ModelTemplate> {
  const materials = await new MTLLoader().setPath(MODEL_PATH).loadAsync(`${name}.mtl`);
  materials.preload();
  const group = await new OBJLoader()
    .setMaterials(materials)
    .setPath(MODEL_PATH)
    .loadAsync(`${name}.obj`);
  group.scale.setScalar(1 / KENNEY_UNITS_PER_TILE);
  group.updateMatrixWorld(true);

  const box = new Box3().setFromObject(group);
  const center = box.getCenter(new Vector3());
  const parts: ModelPart[] = [];
  group.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    geometry.translate(-center.x, -box.min.y, -center.z);
    const material = Array.isArray(mesh.material) ? mesh.material.map(matte) : matte(mesh.material);
    parts.push({ geometry, material });
  });
  return { parts, size: box.getSize(new Vector3()) };
}

export async function loadFurniture(): Promise<Furniture> {
  const entries = await Promise.all(
    FURNITURE.map(async (name) => [name, await loadModel(name)] as const),
  );
  return Object.fromEntries(entries) as Furniture;
}
