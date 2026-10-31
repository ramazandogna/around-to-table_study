import type { Point } from '@att/shared';
import {
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';

/** Just above the floor and rugs, under the hover marker. */
const LIFT = 0.03;
const OPACITY = 0.55;

/**
 * Soft circles on the free chairs of a room, so it is clear where to sit
 * without hovering (phones have no hover). They hide while you sit and under
 * anyone already sitting. Still and quiet, as the library asks.
 */
export function createSeatMarkers(seats: readonly Point[], floorY: number) {
  const texture = softCircle();
  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    opacity: OPACITY,
  });
  const geometry = new PlaneGeometry(0.8, 0.8);
  const root = new Group();
  const markers = seats.map((seat) => {
    const mesh = new Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(seat.x + 0.5, floorY + LIFT, seat.y + 0.5);
    mesh.renderOrder = 1;
    root.add(mesh);
    return { seat, mesh };
  });

  return {
    root,
    /** Shows the markers on free seats, or none at all while `show` is false. */
    update(show: boolean, taken: readonly Point[]): void {
      for (const { seat, mesh } of markers) {
        mesh.visible = show && !taken.some((p) => p.x === seat.x && p.y === seat.y);
      }
    },
    dispose(): void {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}

function softCircle(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (g) {
    const glow = g.createRadialGradient(32, 32, 6, 32, 32, 30);
    glow.addColorStop(0, 'rgba(255, 226, 150, 0.55)');
    glow.addColorStop(0.7, 'rgba(255, 214, 120, 0.3)');
    glow.addColorStop(1, 'rgba(255, 214, 120, 0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, size, size);
    g.beginPath();
    g.arc(32, 32, 22, 0, Math.PI * 2);
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(255, 240, 200, 0.9)';
    g.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
