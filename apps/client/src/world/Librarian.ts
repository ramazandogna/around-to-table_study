import {
  findPath,
  smoothPath,
  TILE,
  type Appearance,
  type AreaGrid,
  type Emote,
  type Point,
} from '@att/shared';
import { t, type MessageKey } from '../i18n/t';
import { Avatar, type AvatarContext } from './Avatar';
import type { CharacterKit } from './characters';

/**
 * The librarian: she sits at her desk working on the laptop, now and then gets
 * up to look something up on the shelves and comes back, and nods off a little
 * in the slow hours. She lives on everyone's screen at once: what she does is
 * worked out from the clock, so every visitor sees her at the same shelf at
 * the same moment, with nothing to send. She is not a player: she takes no
 * seat at the tables and counts in no numbers.
 */

/** One round of her day, in seconds. */
const CYCLE = 150;
/** When in the round she is away at the shelves. */
const AWAY = { from: 70, to: 100 };
/** Little moments at the desk: [second of the round, emote]. */
const DESK_MOMENTS: readonly (readonly [number, Emote])[] = [
  [24, 'thinking'],
  [52, 'sleepy'],
  [118, 'sleepy'],
  [136, 'coffee'],
];
/** At the shelf she reaches for a book every so often. */
const REACH_SECONDS = 4.5;

const LOOK: Appearance = { character: 3, top: 3, bottom: 7, hair: 1 };

/** What she says when someone taps her name. */
const LINES: readonly MessageKey[] = ['npc.line.1', 'npc.line.2', 'npc.line.3', 'npc.line.4'];

type Shelf = { stand: Point; facing: Point };

export class Librarian {
  readonly avatar: Avatar;
  private readonly chair: Point;
  /** The open floor just behind her chair, where she steps out. */
  private readonly aisle: Point;
  private readonly shelves: Shelf[];
  private at: 'desk' | number | null = null;
  private lastSecond = -1;
  private reachIn = REACH_SECONDS;
  private lineIndex = 0;

  /** Null when the room has no staff chair. */
  static create(kit: CharacterKit, grid: AreaGrid, context: AvatarContext): Librarian | null {
    let chair: Point | null = null;
    grid.area.layout.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c === TILE.staffChair) chair = { x, y };
      }),
    );
    return chair ? new Librarian(kit, grid, chair, context) : null;
  }

  private constructor(
    kit: CharacterKit,
    private readonly grid: AreaGrid,
    chair: Point,
    context: AvatarContext,
  ) {
    this.chair = chair;
    const desk = [
      { x: chair.x, y: chair.y - 1 },
      { x: chair.x, y: chair.y + 1 },
      { x: chair.x - 1, y: chair.y },
      { x: chair.x + 1, y: chair.y },
    ].find((p) => grid.tileAt(p) === TILE.receptionDesk) ?? { x: chair.x, y: chair.y - 1 };
    const facing = { x: desk.x - chair.x, y: desk.y - chair.y };
    this.aisle = { x: chair.x - facing.x, y: chair.y - facing.y };
    this.shelves = shelvesIn(grid);
    const own: AvatarContext = {
      ...context,
      // Her chair is a seat for her alone, facing the desk.
      seats: (tile) =>
        tile.x === chair.x && tile.y === chair.y ? { kind: 'chair', facing } : null,
      walkable: (tile) => (tile.x === chair.x && tile.y === chair.y) || grid.isWalkable(tile),
    };
    this.avatar = new Avatar(kit, LOOK, chair, t('npc.librarian'), false, own);
    this.avatar.onTap = () => {
      const line = LINES[this.lineIndex++ % LINES.length];
      if (line) this.avatar.say(t(line));
    };
  }

  update(delta: number, now = Date.now()): void {
    const seconds = now / 1000;
    const second = Math.floor(seconds % CYCLE);
    const round = Math.floor(seconds / CYCLE);
    const away = second >= AWAY.from && second < AWAY.to && this.shelves.length > 0;
    const wanted = away ? round % this.shelves.length : 'desk';

    if (wanted !== this.at) this.go(wanted, this.at === null);
    this.at = wanted;

    if (second !== this.lastSecond) {
      this.lastSecond = second;
      if (!away) {
        const moment = DESK_MOMENTS.find(([at]) => at === second);
        if (moment) this.avatar.emote(moment[1], true);
      }
    }
    if (away && !this.avatar.isMoving) {
      const shelf = this.shelves[wanted as number];
      if (shelf) this.avatar.face(shelf.facing.x, shelf.facing.y);
      this.reachIn -= delta;
      if (this.reachIn <= 0) {
        this.reachIn = REACH_SECONDS;
        this.avatar.play('poke');
      }
    }
    this.avatar.update(delta);
  }

  /** Walks to the desk or a shelf; on arrival in the room she is simply already there. */
  private go(to: 'desk' | number, now: boolean): void {
    const shelf = to === 'desk' ? null : this.shelves[to];
    const goal = shelf ? shelf.stand : this.chair;
    if (now) {
      this.avatar.teleport(goal);
      return;
    }
    const from = this.avatar.tile;
    const start = from.x === this.chair.x && from.y === this.chair.y ? this.aisle : from;
    const end = shelf ? shelf.stand : this.aisle;
    const path = findPath(this.grid, start, end);
    if (!path) {
      this.avatar.teleport(goal);
      return;
    }
    const route = smoothPath(this.grid, this.avatar.floorPosition, [start, ...path]);
    if (!shelf) route.push({ x: this.chair.x + 0.5, y: this.chair.y + 0.5 });
    this.avatar.follow(route);
  }

  dispose(): void {
    this.avatar.dispose();
  }
}

/** Open floor in front of a bookcase, with the way to face it; a few spread over the room. */
function shelvesIn(grid: AreaGrid): Shelf[] {
  const found: Shelf[] = [];
  const sides = [
    { x: 0, y: -1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ];
  grid.area.layout.forEach((row, y) =>
    [...row].forEach((_, x) => {
      const stand = { x, y };
      if (!grid.isWalkable(stand) || grid.isSeat(stand)) return;
      const side = sides.find((d) => grid.tileAt({ x: x + d.x, y: y + d.y }) === TILE.bookcase);
      if (side) found.push({ stand, facing: side });
    }),
  );
  // Every fourth one is plenty, and keeps her trips varied.
  return found.filter((_, i) => i % 4 === 1);
}
