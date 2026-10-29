import { TILE, TILE_SIZE, type AreaGrid, type AreaId, type Rect } from '@att/shared';
import type Phaser from 'phaser';
import { t } from '../../i18n/t';
import { bookcaseKey, createBookcaseTextures } from './bookcase';
import { BASE, INDOOR, SHEETS } from './tileset';

const S = TILE_SIZE;

/** The area is drawn with one extra wall-top row above the map, like Kenney's sample rooms. */
export const WALL_TOP_ROWS = 1;

type CarpetSet = readonly (readonly number[])[];

const AREA_STYLE: Record<AreaId, { floor: number; carpet: CarpetSet }> = {
  hall: { floor: BASE.floorStone, carpet: BASE.carpetOrange },
  library: { floor: BASE.floorParquet, carpet: BASE.carpetGreen },
  smoking: { floor: BASE.floorPlanks, carpet: BASE.carpetGreen },
};

const DOORS: ReadonlySet<string> = new Set([
  TILE.doorToHall,
  TILE.doorToLibrary,
  TILE.doorToSmoking,
]);

const TAPE_YELLOW = 0xf2c230;
const TAPE_BLACK = 0x1d1d1d;

/** Draws a whole area into one render texture, plus the renovation overlay. */
export function drawArea(scene: Phaser.Scene, grid: AreaGrid): void {
  createBookcaseTextures(scene);
  const style = AREA_STYLE[grid.area.id];
  const rt = scene.add
    .renderTexture(0, -WALL_TOP_ROWS * S, grid.width * S, (grid.height + WALL_TOP_ROWS) * S)
    .setOrigin(0, 0)
    .setDepth(0);

  const stamp = (key: string, frame: number | undefined, x: number, y: number) =>
    rt.stamp(key, frame, x * S, (y + WALL_TOP_ROWS) * S, { originX: 0, originY: 0 });
  const base = (frame: number, x: number, y: number) => stamp(SHEETS.base.key, frame, x, y);
  const indoor = (frame: number, x: number, y: number) => stamp(SHEETS.indoor.key, frame, x, y);

  const at = (x: number, y: number) => grid.tileAt({ x, y });
  // A door in the top wall is part of the wall face; elsewhere a door is a gap in the wall.
  const isWall = (x: number, y: number) => {
    if (x < 0 || x >= grid.width || y < -WALL_TOP_ROWS || y >= grid.height) return false;
    if (y < 0) return true;
    const c = at(x, y);
    return c === TILE.wall || c === TILE.elevator || (y === 0 && DOORS.has(c));
  };
  // Only walls with floor below show their front face; the bottom wall is seen from above.
  const isFace = (x: number, y: number) =>
    y >= 0 && y + 1 < grid.height && isWall(x, y) && !isWall(x, y + 1);
  const isWallTop = (x: number, y: number) => isWall(x, y) && !isFace(x, y);

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) base(style.floor, x, y);
  }
  for (const rug of grid.area.rugs) drawCarpet(rug, style.carpet, base);

  for (let y = -WALL_TOP_ROWS; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const c = y < 0 ? TILE.wall : at(x, y);

      if (isWallTop(x, y)) {
        const key = [
          isWallTop(x + 1, y) ? 'E' : '',
          isWallTop(x, y - 1) ? 'N' : '',
          isWallTop(x, y + 1) ? 'S' : '',
          isWallTop(x - 1, y) ? 'W' : '',
        ].join('');
        base(BASE.wallTop[key] ?? BASE.wallTop.ENSW ?? BASE.wallFace, x, y);
        if (c === TILE.elevator) base(BASE.elevatorDoor, x, y);
        continue;
      }
      if (isFace(x, y)) {
        base(BASE.wallFace, x, y);
        if (DOORS.has(c)) base(BASE.doubleDoorGlass, x, y);
        else if (x % 4 === 2) base(BASE.windowArched, x, y);
        continue;
      }

      switch (c) {
        case TILE.bookcase:
          stamp(bookcaseKey(x * 7 + y), undefined, x, y);
          break;
        case TILE.table:
          indoor(pieceOf(at(x - 1, y), at(x + 1, y), TILE.table, OVAL_TABLE), x, y);
          break;
        case TILE.receptionDesk:
          indoor(pieceOf(at(x - 1, y), at(x + 1, y), TILE.receptionDesk, LONG_TABLE), x, y);
          break;
        case TILE.seat:
          base(chairFacing(at, x, y), x, y);
          break;
        case TILE.plant:
          indoor(INDOOR.plant, x, y);
          break;
        case TILE.bench:
          indoor(INDOOR.bench, x, y);
          break;
        case TILE.ashtray:
          indoor(INDOOR.ashtray, x, y);
          break;
      }
    }
  }
  rt.render();

  drawRenovation(scene, grid);
}

const OVAL_TABLE = [INDOOR.ovalTableLeft, INDOOR.ovalTableMiddle, INDOOR.ovalTableRight] as const;
const LONG_TABLE = [INDOOR.longTableLeft, INDOOR.longTableMiddle, INDOOR.longTableRight] as const;

/** Picks the left end, middle or right end of a one-row piece of furniture. */
function pieceOf(
  left: string,
  right: string,
  self: string,
  [leftEnd, middle, rightEnd]: readonly [number, number, number],
): number {
  if (left !== self) return leftEnd;
  if (right !== self) return rightEnd;
  return middle;
}

/** Chairs face the table next to them. */
function chairFacing(at: (x: number, y: number) => string, x: number, y: number): number {
  if (at(x, y + 1) === TILE.table) return BASE.chairFacingDown;
  if (at(x, y - 1) === TILE.table) return BASE.chairFacingUp;
  if (at(x + 1, y) === TILE.table) return BASE.chairFacingRight;
  if (at(x - 1, y) === TILE.table) return BASE.chairFacingLeft;
  return BASE.chairFacingDown;
}

function drawCarpet(
  rug: Rect,
  set: CarpetSet,
  base: (frame: number, x: number, y: number) => unknown,
): void {
  for (let dy = 0; dy < rug.h; dy++) {
    const row = set[dy === 0 ? 0 : dy === rug.h - 1 ? 2 : 1];
    for (let dx = 0; dx < rug.w; dx++) {
      const frame = row?.[dx === 0 ? 0 : dx === rug.w - 1 ? 2 : 1];
      if (frame !== undefined) base(frame, rug.x + dx, rug.y + dy);
    }
  }
}

function drawRenovation(scene: Phaser.Scene, grid: AreaGrid): void {
  const g = scene.add.graphics().setDepth(1);
  for (const zone of grid.area.renovation) {
    if (grid.userCount >= zone.unlockAtUsers) continue;
    const zx = zone.x * S;
    const zy = zone.y * S;
    g.fillStyle(0x000000, 0.5).fillRect(zx, zy, zone.w * S, zone.h * S);

    // Striped tape along the open edge of the zone.
    for (let y = zy; y < zy + zone.h * S; y += 4) {
      g.fillStyle((y / 4) % 2 ? TAPE_BLACK : TAPE_YELLOW).fillRect(zx, y, 3, 4);
    }

    scene.add
      // The sign hangs just past the tape, where people walking up to it can read it.
      .text(zx + 4 * S, zy + (zone.h * S) / 2, t('sign.renovation'), {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#f2c230',
        backgroundColor: '#1d1d1d',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setScale(0.25)
      .setDepth(1);
  }
}
