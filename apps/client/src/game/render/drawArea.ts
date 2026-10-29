import { TILE, TILE_SIZE, type AreaGrid } from '@att/shared';
import type Phaser from 'phaser';
import { t } from '../../i18n/t';
import { PALETTE } from './palette';

const S = TILE_SIZE;

function drawTile(g: Phaser.GameObjects.Graphics, char: string, x: number, y: number): void {
  const px = x * S;
  const py = y * S;
  g.fillStyle((x + y) % 2 ? PALETTE.floorA : PALETTE.floorB).fillRect(px, py, S, S);

  switch (char) {
    case TILE.wall:
      g.fillStyle(PALETTE.wall).fillRect(px, py, S, S);
      g.fillStyle(PALETTE.wallTop).fillRect(px, py, S, 4);
      break;
    case TILE.bookcase:
      g.fillStyle(PALETTE.bookcase).fillRect(px, py, S, S);
      for (let shelf = 0; shelf < 2; shelf++) {
        for (let i = 0; i < 6; i++) {
          g.fillStyle(
            PALETTE.books[(x * 3 + i + shelf) % PALETTE.books.length] ?? PALETTE.books[0],
          );
          g.fillRect(px + 2 + i * 2, py + 2 + shelf * 7, 2, 5);
        }
      }
      break;
    case TILE.table:
      g.fillStyle(PALETTE.table).fillRect(px, py, S, S);
      g.fillStyle(PALETTE.tableEdge).fillRect(px, py + S - 2, S, 2);
      break;
    case TILE.seat:
      g.fillStyle(PALETTE.seat).fillRect(px + 3, py + 3, S - 6, S - 6);
      break;
    case TILE.plant:
      g.fillStyle(PALETTE.plantPot).fillRect(px + 4, py + 9, 8, 6);
      g.fillStyle(PALETTE.plant).fillRect(px + 2, py + 1, 12, 9);
      break;
    case TILE.receptionDesk:
      g.fillStyle(PALETTE.desk).fillRect(px, py + 2, S, S - 2);
      g.fillStyle(PALETTE.deskTop).fillRect(px, py + 2, S, 4);
      break;
    case TILE.bench:
      g.fillStyle(PALETTE.bench).fillRect(px, py + 4, S, 8);
      break;
    case TILE.ashtray:
      g.fillStyle(PALETTE.ashtray).fillRect(px + 5, py + 5, 6, 6);
      break;
    case TILE.elevator:
      g.fillStyle(PALETTE.elevator).fillRect(px, py, S, S);
      g.fillStyle(PALETTE.shade, 0.3).fillRect(px + 7, py, 2, S);
      break;
    case TILE.doorToLibrary:
      g.fillStyle(PALETTE.glassDoor, 0.8).fillRect(px, py, S, S);
      break;
    case TILE.doorToHall:
    case TILE.doorToSmoking:
      g.fillStyle(PALETTE.woodDoor).fillRect(px, py, S, S);
      break;
  }
}

function drawRenovation(scene: Phaser.Scene, grid: AreaGrid, g: Phaser.GameObjects.Graphics): void {
  for (const zone of grid.area.renovation) {
    if (grid.userCount >= zone.unlockAtUsers) continue;
    const zx = zone.x * S;
    const zy = zone.y * S;
    g.fillStyle(PALETTE.shade, 0.45).fillRect(zx, zy, zone.w * S, zone.h * S);

    // Striped tape along the open edge of the zone.
    for (let y = zy; y < zy + zone.h * S; y += 4) {
      g.fillStyle((y / 4) % 2 ? PALETTE.tapeBlack : PALETTE.tapeYellow).fillRect(zx, y, 3, 4);
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

/** Draws the placeholder art for a whole area. Replaced by Tiled tilemaps later. */
export function drawArea(scene: Phaser.Scene, grid: AreaGrid): void {
  const g = scene.add.graphics().setDepth(0);
  grid.area.layout.forEach((row, y) => [...row].forEach((char, x) => drawTile(g, char, x, y)));
  drawRenovation(scene, grid, g);
}
