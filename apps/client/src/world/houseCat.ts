import {
  CAT_ARRIVE_MS,
  CAT_NAME,
  CAT_ROOMS,
  catCompanion,
  catPick,
  catPlan,
  findPath,
  smoothPath,
  TILE,
  type AreaGrid,
  type AreaId,
  type CatPlan,
  type CatRoom,
  type Focuser,
  type Point,
} from '@att/shared';
import { Group } from 'three';
import { FLOOR_Y, SOFA_SEAT_HEIGHT } from './buildArea';
import { instance } from './instancing';
import type { Furniture, ModelTemplate } from './models';
import { Pet, type PetContext } from './Pet';
import type { PetKit } from './pets';

/**
 * Simit, the building's cat (see shared `houseCat.ts` for her day). This
 * puts her in the room when the building's clock says she is here: coming in
 * through the door, looking around, napping on her bed or a sofa, and in the
 * library curling up next to whoever has been studying longest. She is no
 * player: she takes no seat, stands in nobody's way and counts in no numbers.
 * In the library she is silent and shows nothing over her head.
 */

/** Her bed (a flat cushion) in the rooms that have one, by tile: a quiet corner by a plant. */
const BEDS: Partial<Record<CatRoom, Point>> = {
  hall: { x: 2, y: 9 },
  library: { x: 2, y: 15 },
};

/** Ginger, like a fresh simit, with a bell on her collar. */
const DRESS = { petColor: 0, petAccessory: 'bell' } as const;

type FloorXZ = { x: number; z: number };

/** Where she wants to be right now, and how. */
type Wanted = {
  /** Changes whenever she should set off somewhere else. */
  key: string;
  at: FloorXZ;
  /** Through this door she comes in, if she is just arriving. */
  enterFrom?: FloorXZ;
  /** Gone through the door once there. */
  away?: boolean;
  nap?: boolean;
  perch?: number;
  /** Who she curls up next to, to face them. */
  facing?: FloorXZ;
};

/** What the room tells her each frame: who studies where, and where she must not lie down. */
export type CatSurroundings = {
  focusers: readonly Focuser[];
  /** The seat someone sits on, by their id. */
  seatOf: (id: string) => Point | null;
  /** Whether a person (or a pet) is on or right by a tile. */
  taken: (tile: Point) => boolean;
};

const center = (p: Point): FloorXZ => ({ x: p.x + 0.5, z: p.y + 0.5 });
const tileOf = (p: FloorXZ): Point => ({ x: Math.floor(p.x), y: Math.floor(p.z) });

export class HouseCat {
  readonly pet: Pet;
  readonly root = new Group();
  private readonly room: CatRoom;
  private readonly roam: Point[];
  private readonly sofas: Point[];
  private readonly bed: Point | null;
  private key: string | null = null;
  private shown = false;
  private wanted: Wanted | null = null;

  /** The cat for a room she visits, or null in rooms she never goes to. */
  static create(
    kit: PetKit,
    furniture: Furniture,
    grid: AreaGrid,
    context: PetContext,
  ): HouseCat | null {
    const area = grid.area.id;
    return (CAT_ROOMS as readonly AreaId[]).includes(area)
      ? new HouseCat(kit, furniture, grid, context, area as CatRoom)
      : null;
  }

  private constructor(
    kit: PetKit,
    furniture: Furniture,
    private readonly grid: AreaGrid,
    context: PetContext,
    room: CatRoom,
  ) {
    this.room = room;
    this.pet = new Pet(kit, 'cat', center(grid.area.spawn), `house:${CAT_NAME}`, context, DRESS);
    this.pet.setTag(CAT_NAME);
    this.pet.setQuiet(room === 'library');
    this.pet.root.visible = false;
    const bed = BEDS[room] ?? null;
    this.bed = bed && grid.isWalkable(bed) ? bed : null;
    if (this.bed) this.root.add(catBed(furniture.pillow, this.bed));
    const open: Point[] = [];
    const sofas: Point[] = [];
    grid.area.layout.forEach((row, y) =>
      [...row].forEach((c, x) => {
        const p = { x, y };
        // Only sofas that face the camera: on the others their back would hide her.
        if (c === TILE.bench) {
          if (y < grid.height / 2) sofas.push(p);
        } else if (c === TILE.floor && grid.isWalkable(p) && !nextToDoor(grid, p)) open.push(p);
      }),
    );
    // A handful of spots spread over the room to look around at.
    this.roam = open.filter((_, i) => i % 7 === 3);
    this.sofas = sofas;
  }

  get position(): FloorXZ {
    return this.pet.position;
  }

  /** Whether she is in the room to be seen (and tapped). */
  get visible(): boolean {
    return this.pet.root.visible;
  }

  /** Petted: she leans in (and purrs, outside the library). Returns whether to purr. */
  pat(): boolean {
    this.pet.pat();
    return this.room !== 'library';
  }

  update(delta: number, now: number, around: CatSurroundings): void {
    const plan = catPlan(now);
    if (plan.room !== this.room) {
      this.pet.root.visible = false;
      this.shown = false;
      this.key = null;
      return;
    }
    const wanted = this.want(plan, around);
    this.wanted = wanted;
    if (wanted.key !== this.key) {
      this.key = wanted.key;
      this.go(wanted, plan);
    }
    const there = !this.pet.walking;
    this.pet.setNapping(!!wanted.nap && there);
    this.pet.setPerch(there ? (wanted.perch ?? 0) : 0);
    if (there && wanted.facing) {
      // Turned towards whoever she keeps company.
      const { x, z } = this.pet.position;
      this.pet.root.rotation.y = Math.atan2(wanted.facing.x - x, wanted.facing.z - z);
    }
    this.pet.root.visible = !(wanted.away && there);
    this.pet.update(delta, null);
  }

  /** Where the plan puts her in this room now. */
  private want(plan: CatPlan, around: CatSurroundings): Wanted {
    const slot = plan.slot;
    if (plan.phase === 'arrive' && plan.from) {
      return {
        key: `arrive:${slot}`,
        at: center(this.grid.arrivalPoint(plan.from)),
        enterFrom: this.doorTo(plan.from),
      };
    }
    if (plan.phase === 'leave' && plan.to) {
      return { key: `leave:${slot}`, at: this.doorTo(plan.to), away: true };
    }
    if (plan.phase === 'roam') {
      const spot = this.free(this.roam, catPick(slot, plan.step, this.roam.length), around);
      return { key: `roam:${slot}:${plan.step}:${spot.x},${spot.y}`, at: center(spot) };
    }
    // Napping: in the library next to the longest studier, else on her bed or a sofa.
    if (this.room === 'library') {
      const id = catCompanion(around.focusers);
      const seat = id ? around.seatOf(id) : null;
      const beside = seat ? this.besideSeat(seat, around) : null;
      if (seat && beside) {
        return {
          key: `nap:${slot}:by:${id}:${beside.x},${beside.y}`,
          at: {
            // In the middle of the tile beside the chair, a little towards the room's
            // front, so the person sitting there does not hide her.
            x: beside.x + 0.5,
            z: beside.y + 0.7,
          },
          nap: true,
          facing: center(seat),
        };
      }
    }
    const sofa = this.sofas[catPick(slot, 99, this.sofas.length)];
    // Her bed most of the time where she has one; a sofa now and then (always in the smoking room).
    const onSofa = sofa && !around.taken(sofa) && (!this.bed || catPick(slot, 98, 3) === 0);
    if (onSofa && sofa) {
      return {
        key: `nap:${slot}:sofa:${sofa.x},${sofa.y}`,
        at: center(sofa),
        nap: true,
        perch: SOFA_SEAT_HEIGHT,
      };
    }
    if (this.bed && !around.taken(this.bed)) {
      return { key: `nap:${slot}:bed`, at: center(this.bed), nap: true, perch: 0.1 };
    }
    const spot = this.free(this.roam, catPick(slot, 97, this.roam.length), around);
    return { key: `nap:${slot}:floor:${spot.x},${spot.y}`, at: center(spot), nap: true };
  }

  /** The middle of the door to another room, just inside it. */
  private doorTo(area: AreaId): FloorXZ {
    const inside = this.grid.arrivalPoint(area);
    const door = [
      { x: inside.x, y: inside.y - 1 },
      { x: inside.x, y: inside.y + 1 },
      { x: inside.x - 1, y: inside.y },
      { x: inside.x + 1, y: inside.y },
    ].find((p) => this.grid.doorTarget(p) === area);
    return center(door ?? inside);
  }

  /** The first spot from `start` on that nobody stands on. */
  private free(spots: readonly Point[], start: number, around: CatSurroundings): Point {
    for (let i = 0; i < spots.length; i++) {
      const spot = spots[(start + i) % spots.length];
      if (spot && !around.taken(spot)) return spot;
    }
    return spots[start] ?? this.grid.area.spawn;
  }

  /** Open floor beside a seat (to its side, else behind it) that is free and not a seat. */
  private besideSeat(seat: Point, around: CatSurroundings): Point | null {
    const toTable = this.grid.seatFacing(seat) ?? { x: 0, y: 1 };
    const side = { x: toTable.y, y: toTable.x };
    const candidates = [
      { x: seat.x + side.x, y: seat.y + side.y },
      { x: seat.x - side.x, y: seat.y - side.y },
      { x: seat.x - toTable.x, y: seat.y - toTable.y },
      { x: seat.x - toTable.x + side.x, y: seat.y - toTable.y + side.y },
      { x: seat.x - toTable.x - side.x, y: seat.y - toTable.y - side.y },
    ];
    return (
      candidates.find(
        (p) =>
          this.grid.isWalkable(p) &&
          !this.grid.isSeat(p) &&
          this.grid.doorTarget(p) === null &&
          !around.taken(p),
      ) ?? null
    );
  }

  /** Walks there, or, on first sight mid-way through something, is simply there. */
  private go(wanted: Wanted, plan: CatPlan): void {
    if (!this.shown) {
      this.shown = true;
      if (wanted.enterFrom && plan.into < CAT_ARRIVE_MS * 0.75) {
        // Just coming in: from the doorway.
        this.pet.placeAt(wanted.enterFrom);
        this.walk(wanted.at);
      } else {
        this.pet.placeAt(wanted.at, wanted.facing);
      }
      this.pet.root.visible = true;
      return;
    }
    this.walk(wanted.at);
  }

  private walk(to: FloorXZ): void {
    const from = this.pet.position;
    const start = tileOf(from);
    const goal = tileOf(to);
    const path = findPath(this.grid, start, goal);
    if (!path) {
      this.pet.walkRoute([to]);
      return;
    }
    const route = smoothPath(this.grid, { x: from.x, y: from.z }, [start, ...path]).map((p) => ({
      x: p.x,
      z: p.y,
    }));
    // The last stretch to exactly where she lies down, not the tile's middle.
    route.pop();
    this.pet.walkRoute([...route, to]);
  }

  /** What she is doing, for tests and the curious. */
  get state(): { visible: boolean; key: string | null; napping: boolean; at: FloorXZ } {
    return {
      visible: this.visible,
      key: this.key,
      napping: !!this.wanted?.nap && !this.pet.walking,
      at: this.pet.position,
    };
  }

  dispose(): void {
    this.pet.dispose();
    this.root.removeFromParent();
    // The bed's geometry is the shared furniture model's; nothing of its own to free.
    this.root.clear();
  }
}

/** Floor tiles right by a door stay clear: people come through there. */
function nextToDoor(grid: AreaGrid, p: Point): boolean {
  return [
    { x: p.x, y: p.y - 1 },
    { x: p.x, y: p.y + 1 },
    { x: p.x - 1, y: p.y },
    { x: p.x + 1, y: p.y },
  ].some((n) => grid.doorTarget(n) !== null || grid.tileAt(n) === TILE.entrance);
}

/** Her bed: the kit's cushion laid flat on the floor, a little askew. */
function catBed(pillow: ModelTemplate, tile: Point): Group {
  // Instanced like all furniture: the shared model is never freed with the room.
  const cushion = instance(pillow, [{ x: 0, z: 0 }]);
  // The cushion stands upright in the kit: lay it on its back, flatter and wider, its middle on 0.
  const scale = { wide: 1.4, thick: 0.8 };
  cushion.scale.set(scale.wide, scale.wide, scale.thick);
  cushion.rotation.x = -Math.PI / 2;
  cushion.position.set(0, (pillow.size.z * scale.thick) / 2, (pillow.size.y * scale.wide) / 2);
  const bed = new Group();
  bed.add(cushion);
  bed.position.set(tile.x + 0.5, FLOOR_Y, tile.y + 0.5);
  bed.rotation.y = 0.35;
  return bed;
}
