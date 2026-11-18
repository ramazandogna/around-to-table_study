import { BOOKS, PALETTES, type AreaGrid, type BookView, type Point } from '@att/shared';
import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  Euler,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Object3D,
} from 'three';
import { FLOOR_Y, TABLE_HEIGHT } from './buildArea';

/**
 * Books left behind: every finished block of a quarter hour or more leaves a
 * closed book on the table by that chair, in the colour of the finisher's
 * top; a shared block leaves two. They pile up through the day at the outer
 * corner of the place, clear of the chair and of what a seated person has on
 * the table. All of them are two instanced meshes (covers and pages).
 */
export type Books = {
  /** The covers: what a tap or the mouse finds. */
  root: Object3D;
  set: (books: readonly BookView[]) => void;
  add: (book: BookView) => void;
  /** Drops books older than a day's worth of hours (on the server's clock). */
  expire: (serverNow: number) => void;
  /** The book an instance of the covers mesh shows. */
  bookAt: (instanceId: number) => BookView | null;
  dispose: () => void;
};

/** Room for the most books a room keeps in a day, each possibly a pair. */
const CAPACITY = BOOKS.perRoom * 2;
/** More than this many on one place would tower; the rest are under the pile. */
const MAX_PILE = 6;
const SIZE = { w: 0.13, h: 0.028, d: 0.18 } as const;
/** A top "as drawn" has no palette colour: a plain leather binding. */
const PLAIN = '#7b4a2e';

export function createBooks(grid: AreaGrid): Books {
  const coverGeometry = new BoxGeometry(SIZE.w, SIZE.h, SIZE.d);
  const pageGeometry = new BoxGeometry(SIZE.w * 0.92, SIZE.h * 0.7, SIZE.d * 0.9);
  const cover = new MeshStandardMaterial({ roughness: 0.75 });
  const paper = new MeshStandardMaterial({ color: 0xf3ead2, roughness: 0.95 });
  const covers = new InstancedMesh(coverGeometry, cover, CAPACITY);
  const pages = new InstancedMesh(pageGeometry, paper, CAPACITY);
  covers.name = 'books';
  covers.instanceMatrix.setUsage(DynamicDrawUsage);
  pages.instanceMatrix.setUsage(DynamicDrawUsage);
  covers.castShadow = true;
  covers.add(pages);
  // Picking walks the covers only; the pages ride along under them.
  pages.raycast = () => {};
  covers.count = 0;
  pages.count = 0;

  let books: BookView[] = [];
  /** Which book each cover instance belongs to. */
  let owners: BookView[] = [];
  const matrix = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const euler = new Euler();
  const scale = new Vector3(1, 1, 1);
  const color = new Color();

  /** The outer corner of a place: on the table, beside the pad, on the chair's side. */
  const placeOf = (seat: Point): { x: number; z: number; turn: number } | null => {
    const toTable = grid.seatFacing(seat);
    if (!toTable) return null;
    const table = { x: seat.x + toTable.x, y: seat.y + toTable.y };
    // Along the table: outwards, away from the middle of the run of table tiles.
    const along = { x: toTable.y !== 0 ? 1 : 0, y: toTable.x !== 0 ? 1 : 0 };
    const tile = (p: Point) => grid.tileAt(p) === 'T';
    const before = tile({ x: table.x - along.x, y: table.y - along.y });
    const after = tile({ x: table.x + along.x, y: table.y + along.y });
    const outward = before && !after ? 1 : !before && after ? -1 : 1;
    return {
      x: table.x + 0.5 + along.x * outward * 0.33 - toTable.x * 0.24,
      z: table.y + 0.5 + along.y * outward * 0.33 - toTable.y * 0.24,
      turn: Math.atan2(toTable.x, toTable.y),
    };
  };

  const layout = () => {
    const piles = new Map<string, number>();
    owners = [];
    let i = 0;
    const sorted = [...books].sort((a, b) => a.at - b.at);
    for (const book of sorted) {
      const place = placeOf(book.seat);
      if (!place) continue;
      const key = `${book.seat.x},${book.seat.y}`;
      for (const shade of book.pair === null ? [book.top] : [book.top, book.pair]) {
        const level = piles.get(key) ?? 0;
        piles.set(key, level + 1);
        if (level >= MAX_PILE || i >= CAPACITY) continue;
        // Each one a little askew, the way books are put down.
        const wobble = (((book.at / 7919 + level * 0.37) % 1) - 0.5) * 0.5;
        position.set(place.x, FLOOR_Y + TABLE_HEIGHT + SIZE.h / 2 + level * SIZE.h, place.z);
        rotation.setFromEuler(euler.set(0, place.turn + wobble, 0));
        matrix.compose(position, rotation, scale);
        covers.setMatrixAt(i, matrix);
        pages.setMatrixAt(i, matrix);
        covers.setColorAt(i, color.set(PALETTES.top[shade] ?? PLAIN));
        owners[i] = book;
        i++;
      }
    }
    covers.count = i;
    pages.count = i;
    covers.instanceMatrix.needsUpdate = true;
    pages.instanceMatrix.needsUpdate = true;
    if (covers.instanceColor) covers.instanceColor.needsUpdate = true;
    covers.computeBoundingSphere();
  };

  return {
    root: covers,
    set(next) {
      books = [...next];
      layout();
    },
    add(book) {
      if (books.some((b) => b.id === book.id)) return;
      books.push(book);
      layout();
    },
    expire(serverNow) {
      const kept = books.filter((b) => serverNow - b.at < BOOKS.keepMs);
      if (kept.length === books.length) return;
      books = kept;
      layout();
    },
    bookAt: (instanceId) => owners[instanceId] ?? null,
    dispose() {
      covers.removeFromParent();
      coverGeometry.dispose();
      pageGeometry.dispose();
      cover.dispose();
      paper.dispose();
      covers.dispose();
      pages.dispose();
    },
  };
}
