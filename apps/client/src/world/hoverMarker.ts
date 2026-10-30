import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Texture,
} from 'three';

/** A plain floor tile, or something that does more than walking: a person, door, seat or board. */
export type HoverKind = 'floor' | 'special';

const COLORS: Record<HoverKind, number> = { floor: 0xfff8ea, special: 0xffd36b };
/** Above rugs, so the marker never shares a plane with anything (that flickers). */
const LIFT = 0.035;

/** A soft rounded square on the floor under the mouse, so players see what a tap will do. */
export function createHoverMarker() {
  const texture = roundedSquare();
  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    color: COLORS.floor,
  });
  const mesh = new Mesh(new PlaneGeometry(0.94, 0.94), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 2;
  mesh.visible = false;

  return {
    mesh,
    show(at: { x: number; y: number; z: number } | null, kind: HoverKind | null): void {
      mesh.visible = at !== null && kind !== null;
      if (!at || !kind) return;
      mesh.position.set(at.x, at.y + LIFT, at.z);
      material.color.setHex(COLORS[kind]);
    },
    dispose(): void {
      mesh.geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}

function roundedSquare(): Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (g) {
    g.beginPath();
    g.roundRect(4, 4, size - 8, size - 8, 12);
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
