import { TILE, type AreaGrid, type Weather } from '@att/shared';
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
} from 'three';
import { REDUCED_MOTION } from './ambience';

/**
 * The bit of street in front of the hall's entrance: a strip of pavement, and
 * the building's weather falling on it (rain or snow), so whoever stands in
 * the hall sees what it is like outside without a window. Rooms without a
 * street door get none.
 */

/** How far the strip reaches out from the wall, and past the doors on each side, in tiles. */
const DEPTH = 2.4;
const SIDE = 1.2;
const TOP = 3.2;
const RAIN_DROPS = 160;
const SNOW_FLAKES = 120;
const RAIN_SPEED = 7.5;
const RAIN_LENGTH = 0.28;
const SNOW_SPEED = 0.55;

const PAVEMENT: Record<Weather, string> = {
  clear: '#76706a',
  cloudy: '#6c6762',
  rain: '#4b4845',
  snow: '#d8dce2',
};

export type Street = {
  root: Group;
  setWeather: (weather: Weather) => void;
  update: (delta: number) => void;
  dispose: () => void;
};

export function buildStreet(grid: AreaGrid, floorY: number): Street | null {
  const doors: number[] = [];
  let row = -1;
  grid.area.layout.forEach((line, y) =>
    [...line].forEach((c, x) => {
      if (c !== TILE.entrance) return;
      doors.push(x);
      row = y;
    }),
  );
  // Only a door in the bottom wall opens onto the street in view.
  if (doors.length === 0 || row !== grid.height - 1) return null;
  const left = Math.min(...doors) - SIDE;
  const right = Math.max(...doors) + 1 + SIDE;
  const near = row + 1;
  const width = right - left;

  const root = new Group();
  const ground = new MeshStandardMaterial({ color: PAVEMENT.clear, roughness: 0.9 });
  const pavement = new Mesh(new BoxGeometry(width, 0.1, DEPTH), ground);
  pavement.position.set(left + width / 2, floorY - 0.06, near + DEPTH / 2);
  pavement.receiveShadow = true;
  root.add(pavement);

  const random = (low: number, high: number) => low + Math.random() * (high - low);
  const spot = () => ({ x: random(left, right), z: random(near, near + DEPTH) });

  // Rain: short streaks, each two points of a line, falling fast.
  const rainPositions = new Float32Array(RAIN_DROPS * 6);
  for (let i = 0; i < RAIN_DROPS; i++) {
    const { x, z } = spot();
    const y = random(0, TOP);
    rainPositions.set([x, y, z, x - 0.02, y + RAIN_LENGTH, z], i * 6);
  }
  const rainGeometry = new BufferGeometry();
  const rainAttribute = new BufferAttribute(rainPositions, 3);
  rainGeometry.setAttribute('position', rainAttribute);
  const rainMaterial = new LineBasicMaterial({ color: '#b7c9de', transparent: true, opacity: 0.6 });
  const rain = new LineSegments(rainGeometry, rainMaterial);
  rain.frustumCulled = false;
  rain.visible = false;

  // Snow: soft flakes drifting down, swaying a little.
  const snowPositions = new Float32Array(SNOW_FLAKES * 3);
  const sway = new Float32Array(SNOW_FLAKES);
  for (let i = 0; i < SNOW_FLAKES; i++) {
    const { x, z } = spot();
    snowPositions.set([x, random(0, TOP), z], i * 3);
    sway[i] = random(0, Math.PI * 2);
  }
  const snowGeometry = new BufferGeometry();
  const snowAttribute = new BufferAttribute(snowPositions, 3);
  snowGeometry.setAttribute('position', snowAttribute);
  const snowMaterial = new PointsMaterial({ color: '#ffffff', size: 0.07, transparent: true });
  const snow = new Points(snowGeometry, snowMaterial);
  snow.frustumCulled = false;
  snow.visible = false;
  root.add(rain, snow);

  let weather: Weather = 'clear';
  let clock = 0;
  return {
    root,
    setWeather: (next) => {
      weather = next;
      ground.color.set(PAVEMENT[next]);
      // Less motion asked for: the pavement still shows it, nothing falls.
      rain.visible = next === 'rain' && !REDUCED_MOTION;
      snow.visible = next === 'snow' && !REDUCED_MOTION;
    },
    update: (delta) => {
      clock += delta;
      if (weather === 'rain' && rain.visible) {
        for (let i = 0; i < RAIN_DROPS; i++) {
          const at = i * 6;
          let y = (rainPositions[at + 1] ?? 0) - RAIN_SPEED * delta;
          if (y < floorY) {
            const { x, z } = spot();
            y = TOP;
            rainPositions[at] = x;
            rainPositions[at + 2] = z;
            rainPositions[at + 3] = x - 0.02;
            rainPositions[at + 5] = z;
          }
          rainPositions[at + 1] = y;
          rainPositions[at + 4] = y + RAIN_LENGTH;
        }
        rainAttribute.needsUpdate = true;
      } else if (weather === 'snow' && snow.visible) {
        for (let i = 0; i < SNOW_FLAKES; i++) {
          const at = i * 3;
          let y = (snowPositions[at + 1] ?? 0) - SNOW_SPEED * delta;
          if (y < floorY) {
            const { x, z } = spot();
            y = TOP;
            snowPositions[at] = x;
            snowPositions[at + 2] = z;
          }
          snowPositions[at + 1] = y;
          snowPositions[at] =
            (snowPositions[at] ?? 0) + Math.sin(clock * 1.3 + (sway[i] ?? 0)) * 0.12 * delta;
        }
        snowAttribute.needsUpdate = true;
      }
    },
    dispose: () => {
      root.removeFromParent();
      pavement.geometry.dispose();
      ground.dispose();
      rainGeometry.dispose();
      rainMaterial.dispose();
      snowGeometry.dispose();
      snowMaterial.dispose();
    },
  };
}
