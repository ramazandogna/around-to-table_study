import {
  conferenceRole,
  type Emote,
  AREA_RULES,
  EVENT_THEMES,
  DECOR_LEAD_MS,
  EVENTS,
  themeOf,
  isRoomArea,
  roomArea,
  TILE,
  eventNow,
  createAreaGrid,
  onDuty,
  rulesFor,
  dayPhase,
  type DayPhase,
  type RoomRules,
  findPath,
  resolveWalkTarget,
  smoothPath,
  type AreaGrid,
  type AreaId,
  type BlockReason,
  type PlayerSnapshot,
  type Appearance,
  type Point,
  type ServerMessage,
  type WaitingPet,
} from '@att/shared';
import { playMusic, stopMusic } from '../audio/music';
import { play, unlockAudio } from '../audio/sound';
import { RENOVATION_NOTES, SHELF_TOPICS } from '../content/discoveries';
import { eventTitle } from '../content/events';
import { TOPICS } from '../content/topics';
import { t, type MessageKey } from '../i18n/t';
import { AreaConnection } from '../net/AreaConnection';
import { isMuted, mayRing } from '../net/social';
import { studyStatus, useGameStore, type ConfirmChoice, type RunningBlock } from '../state/store';
import { Avatar, type AvatarContext, type FloorPoint } from './Avatar';
import { DAYLIGHT } from './ambience';
import {
  buildArea,
  CHAIR_INSET,
  CHAIR_PULLED,
  CHAIR_TUCKED,
  FLOOR_Y,
  type BuiltArea,
  type Examinable,
} from './buildArea';
import type { CharacterKit } from './characters';
import { MACHINES, type ArcadeKit } from './arcade';
import { cursorFor, type CursorKind } from './cursors';
import { buildEventDecor, type EventDecor } from './eventDecor';
import { closedSign, Staff } from './Staff';
import { Pet, type PetContext } from './Pet';
import type { PetDress, PetKit } from './pets';
import type { IsoView } from './IsoView';
import { minimap, type MapPerson } from './minimap';
import type { Furniture } from './models';
import { Mesh, MeshBasicMaterial, RingGeometry, Vector3 } from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createTableProps } from './tableProps';
import { createHoverMarker, type HoverKind } from './hoverMarker';
import { createSeatMarkers } from './seatMarkers';
import { STAGE_HEIGHT } from './conferenceProps';
import { setGround } from './ground';
import { stageView, type ScreenQuad } from './stageView';

/** With this many people around, far and off-screen people are drawn with less detail. */
const DETAIL_CROWD = 12;
/** Further than this from the player (in tiles), someone loses their shadow and name tag. */
const FAR_TILES = 9;
/** Past the screen's edge by this much (1 is the edge), someone is not drawn at all. */
const OFF_SCREEN = 1.15;
const DETAIL_EVERY_SECONDS = 0.3;

const BLOCK_MESSAGES: Partial<Record<BlockReason, MessageKey>> = {
  renovation: 'blocked.renovation',
  elevator: 'blocked.elevator',
};
const BLOCK_MESSAGE_COOLDOWN_MS = 2500;
const CAMERA_LERP = 0.12;
/** Heights checked when a tap misses the floor, up to the top of the tallest door. */
const DOOR_PICK_HEIGHTS = [0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.1];
const FADE_MS = 120;
/** Library lamps are due on from this hour (15:30) through the night, until morning (07:00). */
const LAMPS_ON_FROM = 15.5;
const LAMPS_OFF_FROM = 7;
/** How long the librarian lets a lamp switched against the rule be (2 to 4 minutes in all, with the walk). */
const LAMP_PATIENCE_MS = 120_000;

/** Nothing done this long: a 💤 shows for everyone. */
const AFK_AFTER_SECONDS = 120;
/** Idle this long: the character wanders to something to look at, now and then. */
const WANDER_AFTER_SECONDS = 300;
const WANDER_EVERY: readonly [number, number] = [50, 110];
/** What an idle character goes to look at. */
const IDLE_LOOKS = new Set<Examinable['kind']>(['shelf', 'painting', 'lost', 'flaw', 'jukebox']);
/** Of the idle wanders, this share goes to sit on a sofa or armchair instead. */
const IDLE_SIT_SHARE = 0.35;
/** Idle this long, the character fidgets now and then: looks around, yawns, thinks. */
const FIDGET_AFTER_SECONDS = 60;
const FIDGET_EVERY: readonly [number, number] = [14, 32];
const FIDGET_EMOTES: readonly Emote[] = ['sleepy', 'thinking', 'coffee'];

/** Three or more people this close (tiles) share one name tag. */
const MERGE_DISTANCE = 0.9;
const MERGE_AT = 3;

/** How often name tags and bubbles are checked for crowding. */
const CROWD_CHECK_SECONDS = 0.2;
/** More people than this on screen fold everyone's status lines into icons. */
const CROWD_SIZE = 6;
/** Name tags closer than this (in pixels) count as overlapping. */
const NEAR_X = 80;
const NEAR_Y = 34;
/** A bubble moved up further than this folds to 💬 instead. */
const MAX_BUBBLE_SHIFT = 110;
const BUBBLE_GAP = 4;
/** How often the minimap is redrawn. */
const MAP_SECONDS = 0.1;
/** Footsteps no closer together than this. */
const STEP_SECONDS = 0.26;
/** How far apart people sharing one tile stand, at most (tiles from its middle). */
const SPREAD_RADIUS = 0.3;

/** Keys point where they point on screen: [right, down]. Two keys together walk diagonally. */
const KEY_DIRECTIONS: Record<string, readonly [number, number]> = {
  ArrowUp: [0, -1],
  KeyW: [0, -1],
  ArrowDown: [0, 1],
  KeyS: [0, 1],
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
};

/**
 * Turns a screen direction into a floor direction. The camera looks from the
 * south-east, so screen-right is (+x, -y) on the map and screen-up is (-x, -y).
 */
function screenToFloor(right: number, down: number): FloorPoint | null {
  const x = right + down;
  const y = down - right;
  const length = Math.hypot(x, y);
  return length > 0 ? { x: x / length, y: y / length } : null;
}

const sameTile = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
/** Whether two pets would look the same: same fur colour and the same thing worn. */
const sameDress = (a: PetDress, b: PetDress) =>
  a.petColor === b.petColor && a.petAccessory === b.petAccessory;
/** Tiles apart, counting diagonal steps as one. */
const reach = (a: Point, b: Point) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

type Assets = { furniture: Furniture; characters: CharacterKit; pets: PetKit; arcade: ArcadeKit };

/** A chair's back reaches about this high, and it is about this wide, for tapping it. */
const SEAT_PICK_HEIGHT = 0.82;
const SEAT_PICK_RADIUS = 0.3;
/** Pets sit this far apart beside the library door. */
const PET_SPACING = 0.42;
/** A chair left out this long is put on the librarian's list. */
const TIDY_AFTER_SECONDS = 40;
/** How often the shifts are checked, to change who sits at the desk. */
const SHIFT_CHECK_SECONDS = 20;

/** The viewer's hour of the day with its minutes, for the shifts. */
const localHour = (now = new Date()) => now.getHours() + now.getMinutes() / 60;
/** The right mouse button. */
const RIGHT_BUTTON = 2;

/** Something to do once the player has walked over to it. */
type Pending =
  | { kind: 'person'; id: string }
  | { kind: 'examine'; examinable: Examinable }
  | { kind: 'desk'; tile: Point }
  /** The elevator up to the private rooms. */
  | { kind: 'elevator' }
  /** With a key in hand: into the elevator and up to the room. */
  | { kind: 'ride'; to: AreaId }
  /** Petting someone's pet (by its person's id; 'self' for the player's own). */
  | { kind: 'pat'; owner: string }
  /** Idle: wandered over to look at something, with nothing opened. */
  | { kind: 'gaze' };

/** What the mouse is over: a person, something to look at, or a tile. */
type Target =
  | { kind: 'self' }
  | { kind: 'person'; id: string }
  | { kind: 'pet'; owner: string }
  | { kind: 'examine'; examinable: Examinable }
  | { kind: 'tile'; tile: Point };

/** Runs one area at a time: builds the room, moves avatars and talks to the server. */
export class AreaWorld {
  private areaId: AreaId = 'hall';
  private grid!: AreaGrid;
  private built: BuiltArea | null = null;
  private readonly projected = new Vector3();
  private detailIn = 0;
  private readonly ring = createPersonRing();
  private ringClock = 0;
  private player: Avatar | null = null;
  private readonly others = new Map<string, Avatar>();
  /** Everyone's look, for bringing their pets back when a room lets pets in again. */
  private readonly looks = new Map<string, Appearance>();
  /** The people listed for a private room's owner, as last told to the store. */
  private peopleKey = '';
  private connection: AreaConnection | null = null;
  private readonly heldKeys = new Set<string>();
  /** Where the keys point the player, or null when no key is held. */
  private steerDirection: FloorPoint | null = null;
  /** The last tile told to the server while steering, so each is sent once. */
  private steerSent: Point | null = null;
  private leaving = false;
  private lastBlockMessageAt = -Infinity;
  private boards: Point[] = [];
  private nearBoard = false;
  /** Where a mouse rests over the canvas; touch screens have no hover. */
  private pointer: { x: number; y: number } | null = null;
  private readonly hover = createHoverMarker();
  /** Says what a click would do, next to the mouse. */
  private readonly tip = document.createElement('div');
  private seatMarkers: ReturnType<typeof createSeatMarkers> | null = null;
  private crowdTimer = 0;
  /** Seconds since the player last did anything (see `idle`). */
  private idleFor = 0;
  /** Library lamps switched against the house rule, and when (for the librarian's patience). */
  private readonly lampFlips = new Map<number, number>();
  private lampTimer = 0;
  /** The hall's sign to a room where an event is on. */
  private eventSign: CSS2DObject | null = null;
  private eventSignKey = '';
  private afk = false;
  /** Seconds until an idle player wanders to the next thing to look at. */
  private wanderIn = 0;
  private fidgetIn = 0;
  /** Whether the current walk is an idle wander (any real input ends it). */
  private wandering = false;
  /** Name tags folded into one: the one showing "+N", and everyone in its group. */
  private readonly mergedWith = new Map<string, string[]>();
  private mapTimer = 0;
  private stepTimer = 0;
  private pending: Pending | null = null;
  /** The person lit up under the mouse. */
  private highlighted: Avatar | null = null;
  /** True while the mouse rests on the player, so the ring opens once per visit. */
  private overSelf = false;
  private readonly context: AvatarContext;
  private readonly petContext: PetContext;
  /** Pets walking along with people in this room, by their person's id ('self' for the player). */
  private readonly pets = new Map<string, Pet>();
  /** In the hall: pets sitting at the library door while their people study, by person. */
  private readonly waiting = new Map<string, Pet>();
  /** Whoever works at this room's desk on this shift, or a "back at" sign when nobody does. */
  private staff: Staff | null = null;
  private deskSign: CSS2DObject | null = null;
  private shiftTimer = SHIFT_CHECK_SECONDS;
  /** Chairs at tables by tile ("x,y"): how far out each is and whether it was left out. */
  private readonly chairs = new Map<
    string,
    { tile: Point; toTable: Point; offset: number; out: boolean; emptyFor: number }
  >();
  /** The chair the player sat on, to push it back in on standing up. */
  private satAt: Point | null = null;
  private tidyTimer = 5;
  private phase: DayPhase | null = null;
  /** True once the player was asked what to do at the chair they stand at. */
  private chairAsked = false;
  /** The room dressed up while an event is on, and which event that is. */
  private decor: EventDecor | null = null;
  private eventId: string | null = null;
  private eventTimer = 0;
  /** Every chair and sofa that is open, for tapping them by any part. */
  private seatTiles: Point[] = [];
  private readonly unsubscribe: () => void;

  constructor(
    private readonly view: IsoView,
    private readonly assets: Assets,
    private readonly fader: HTMLElement,
  ) {
    this.context = {
      seats: (tile) => this.grid.seatAt(tile),
      props: createTableProps(assets.furniture),
      // Only the player steers with keys: someone else's seat is as good as a wall.
      walkable: (tile) => this.grid.isWalkable(tile) && !this.seatTaken(tile),
    };
    this.petContext = { walkable: (tile) => this.grid.isWalkable(tile) };
    // The player's own look and status live in the store; the world shows them and the server shares them.
    this.unsubscribe = useGameStore.subscribe((state, before) => {
      if (state.look && state.look !== before.look) {
        this.player?.setLook(state.look);
        this.connection?.changeLook(state.look);
        this.walkPet('self', this.player, state.look);
      }
      if (state.waitingPets !== before.waitingPets) this.seatWaitingPets(state.waitingPets);
      // A ticket to a private room: take the elevator up.
      if (
        state.room &&
        state.room !== before.room &&
        this.areaId !== roomArea(state.room.room.size)
      ) {
        this.rideUp(roomArea(state.room.room.size));
      }
      if (state.friends !== before.friends) this.markFriends();
      if (state.dancing !== before.dancing || state.danceMove !== before.danceMove) {
        this.dance(state.dancing, state.danceMove);
      }
      if (state.smoking !== before.smoking) this.smoke(state.smoking);
      if (state.buzzAt !== before.buzzAt) this.player?.buzz();
      if (state.travel && state.travel !== before.travel) this.travel(state.travel);
      if (state.deskWalk !== before.deskWalk) this.walkToDesk();
      // The owner changed the private room's rules (here, or told by the room).
      if (state.roomRules && before.roomRules && state.roomRules !== before.roomRules) {
        this.applyRoomRules(state.roomRules, before.roomRules);
      }
      // Chose what to work on at the chair: now they sit down.
      if (state.activity && !before.activity && this.player) this.player.chairAllowed = true;
      // Asking the reception for a room: the receptionist walks over to call the elevator.
      if (
        (state.roomsOpen && !before.roomsOpen) ||
        (state.room && state.room !== before.room && this.areaId === 'hall')
      ) {
        this.staff?.escort();
      }
      if (state.lines !== before.lines) {
        this.player?.setLines(state.lines);
        this.connection?.setLines(state.lines);
      }
      if (
        state.activity === before.activity &&
        state.study?.round === before.study?.round &&
        state.timer === before.timer &&
        state.dnd === before.dnd
      )
        return;
      const status = studyStatus(state);
      this.player?.setStatus(status);
      this.connection?.status(status);
    });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    view.canvas.addEventListener('pointerdown', this.onPointerDown);
    view.canvas.addEventListener('contextmenu', this.onContextMenu);
    view.canvas.addEventListener('pointermove', this.onPointerMove);
    view.canvas.addEventListener('pointerleave', this.onPointerLeave);
    view.add(this.hover.mesh);
    view.add(this.ring);
    this.tip.className = 'world-tip';
    this.tip.hidden = true;
    view.canvas.parentElement?.append(this.tip);
    view.setLoop((delta) => this.update(delta));
  }

  enter(area: AreaId, from?: AreaId): void {
    this.teardown();
    const session = useGameStore.getState().session;
    if (!session) throw new Error('AreaWorld needs a guest session');

    // A private room needs its ticket to come in; it is kept on the way out, to go back or invite.
    const ticket = isRoomArea(area) ? useGameStore.getState().room : null;
    if (isRoomArea(area) && !ticket) area = 'hall';
    this.areaId = area;
    useGameStore.getState().setRoomRules(isRoomArea(area) && ticket ? ticket.room.rules : null);
    this.peopleKey = '';
    this.buildRoom(useGameStore.getState().opened[area] ?? 0);
    this.view.setBounds(this.grid.width, this.grid.height);
    this.boards = [];
    this.grid.area.layout.forEach((row, y) =>
      [...row].forEach((c, x) => c === TILE.noticeBoard && this.boards.push({ x, y })),
    );
    this.nearBoard = false;
    this.pending = null;

    const look = useGameStore.getState().look;
    if (!look) throw new Error('AreaWorld needs a character look');
    const start = from ? this.grid.arrivalPoint(from) : this.grid.area.spawn;
    this.player = new Avatar(this.assets.characters, look, start, session.name, true, this.context);
    this.player.setStatus(studyStatus());
    this.player.setLines(useGameStore.getState().lines);
    this.player.onTap = () => this.player?.toggleDetails();
    this.view.add(this.player.root);
    this.view.follow(start.x + 0.5, start.y + 0.5, 1);

    // Pets wait outside the library; coming back out, yours is right there at the door.
    const pet = look.pet;
    if (pet && this.rules().pets) {
      const own = this.walkPet('self', this.player, look);
      const door = from === 'library' ? this.doorSpots()[0] : undefined;
      const doorway = from && !door ? this.doorwayFrom(from, start) : null;
      if (own && door) own.wait(door.spot, door.facing);
      own?.follow();
      // Through any other door it comes in after its person, rather than appearing by them.
      if (own && doorway) own.enterThrough(doorway.at, doorway.facing);
    } else if (pet) {
      useGameStore.getState().setNotice('pet_waits');
      play('mew');
    }
    this.seatStaff();
    this.seatWaitingPets(useGameStore.getState().waitingPets);

    const store = useGameStore.getState();
    store.setArea(area);
    store.setPlayersHere(1);
    this.connection = new AreaConnection({
      area,
      from,
      token: session.token,
      room: ticket ? { code: ticket.room.code, pass: ticket.pass } : undefined,
      look: () => useGameStore.getState().look ?? look,
      status: () => studyStatus(),
      lines: () => useGameStore.getState().lines,
      onMessage: (message) => this.onServerMessage(message),
      onStatus: (connected) => useGameStore.getState().setConnected(connected),
    });
    store.setConnection(this.connection);
    this.leaving = false;
    this.fader.classList.remove('world-fader--dark');
  }

  dispose(): void {
    this.teardown();
    this.unsubscribe();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.view.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.view.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.view.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.view.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.view.remove(this.hover.mesh);
    this.hover.dispose();
    this.view.remove(this.ring);
    this.ring.geometry.dispose();
    (this.ring.material as MeshBasicMaterial).dispose();
    this.tip.remove();
    this.view.canvas.style.cursor = '';
    this.view.setLoop(null);
  }

  /** Builds (or rebuilds, when the room grows) the room around the people in it. */
  private buildRoom(opened: number): void {
    this.removeRoom();
    this.grid = createAreaGrid(this.areaId, opened);
    this.built = buildArea(this.grid, this.assets.furniture, {
      arcade: this.assets.arcade,
      roomRules: useGameStore.getState().roomRules,
    });
    this.view.add(this.built.root);
    const grid = this.grid;
    setGround((tile) => (grid.isStage(tile) ? STAGE_HEIGHT : 0));
    const stage = this.built.stage;
    stageView.quad = stage ? () => this.screenQuad(stage.screenCorners) : () => null;
    stage?.setLit(!!useGameStore.getState().stage);
    // Chairs start pushed in; who sits, or left one out, is worked out every frame.
    this.chairs.clear();
    this.grid.area.layout.forEach((row, y) =>
      [...row].forEach((c, x) => {
        const toTable = c === TILE.seat ? this.grid.seatFacing({ x, y }) : null;
        if (toTable) {
          this.chairs.set(`${x},${y}`, {
            tile: { x, y },
            toTable,
            offset: CHAIR_TUCKED,
            out: false,
            emptyFor: 0,
          });
        }
      }),
    );
    this.phase = null;
    this.updateDaylight();
    this.seatMarkers = createSeatMarkers(this.grid.openChairs(), FLOOR_Y);
    this.seatTiles = [];
    this.grid.area.layout.forEach((row, y) =>
      [...row].forEach((_, x) => {
        const tile = { x, y };
        if (this.grid.isSeat(tile) && this.grid.isWalkable(tile)) this.seatTiles.push(tile);
      }),
    );
    this.view.add(this.seatMarkers.root);
    minimap.setGrid(this.grid);
  }

  /** Where the big screen's corners land on the page, in CSS pixels. */
  private screenQuad(corners: readonly Vector3[]): ScreenQuad {
    const bounds = this.view.canvas.getBoundingClientRect();
    const points = corners.map((corner) => {
      const p = this.projected.copy(corner).project(this.view.camera);
      return {
        x: bounds.left + ((p.x + 1) / 2) * bounds.width,
        y: bounds.top + ((1 - p.y) / 2) * bounds.height,
      };
    });
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return {
      corners: points,
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  }

  private removeRoom(): void {
    if (this.seatMarkers) {
      this.view.remove(this.seatMarkers.root);
      this.seatMarkers.dispose();
      this.seatMarkers = null;
    }
    if (this.built) {
      this.view.remove(this.built.root);
      this.built.dispose();
      this.built = null;
    }
  }

  /** The room grew (or we learned how big it is): rebuild it with the new desks open. */
  private regrow(opened: number, announce: boolean): void {
    useGameStore.getState().setOpened(this.areaId, opened);
    if (opened === this.grid.opened) return;
    this.buildRoom(opened);
    if (!announce) return;
    useGameStore.getState().setNotice('desk_opened');
    play('chime');
  }

  private teardown(): void {
    this.connection?.close();
    this.connection = null;
    useGameStore.getState().setConnection(null);
    for (const other of this.others.values()) other.dispose();
    this.others.clear();
    this.looks.clear();
    for (const pet of [...this.pets.values(), ...this.waiting.values()]) pet.dispose();
    this.pets.clear();
    this.waiting.clear();
    this.removeStaff();
    this.decor?.dispose();
    this.decor = null;
    this.eventId = null;
    this.eventTimer = 0;
    this.eventSign?.removeFromParent();
    this.eventSign?.element.remove();
    this.eventSign = null;
    this.eventSignKey = '';
    stopMusic();
    this.player?.dispose();
    this.player = null;
    this.highlighted = null;
    const store = useGameStore.getState();
    store.setSeated(false);
    store.ask(null);
    this.removeRoom();
  }

  private update(delta: number): void {
    const player = this.player;
    if (!player || this.leaving) return;
    this.handleKeyboard(player);
    this.idle(delta, player);
    this.keepLamps(delta);

    const entered = player.update(delta);
    if (this.steerDirection) this.sendSteering(player, this.steerDirection);
    if (entered) this.checkDoor(entered);
    this.stepTimer -= delta;
    if (player.isMoving && this.stepTimer <= 0) {
      this.stepTimer = STEP_SECONDS;
      play('step');
    }
    const store = useGameStore.getState();
    // Only a chair at a table counts as studying; a sofa is for resting.
    const studying = player.seatKind === 'chair';
    if (studying !== store.seated) store.setSeated(studying);
    if (store.dancing && !player.isDancing) store.setDancing(false);
    if (store.smoking && !player.isSmoking) store.setSmoking(false);
    if (store.radial && player.isMoving) store.setRadial(null);
    // Walking off puts the book back.
    if (store.discovery && player.isMoving) store.setDiscovery(null);
    // A board opened at the librarian's desk closes again once the player walks on.
    if (store.boardOpen && player.isMoving && !this.nearBoard) store.setBoardOpen(false);
    if (this.pending && !player.isMoving) this.arrive(player, this.pending);
    this.updateBoard(player);
    this.updateHover();
    for (const other of this.others.values()) other.update(delta);
    this.detailIn -= delta;
    if (this.detailIn <= 0) {
      this.detailIn = DETAIL_EVERY_SECONDS;
      this.updateDetail(player);
    }
    this.updateMicrophone(player);
    this.updateRing(delta);
    this.staff?.update(delta);
    this.updateChairs(delta);
    this.askAtChair(player);
    this.shiftTimer -= delta;
    if (this.shiftTimer <= 0) {
      this.shiftTimer = SHIFT_CHECK_SECONDS;
      if ((this.staff?.id ?? null) !== onDuty(this.areaId, localHour())) this.seatStaff();
      this.updateDaylight();
    }
    this.updatePets(delta);
    this.updateEvent(delta);
    this.arrangeCrowd(delta);
    this.mapTimer -= delta;
    if (this.mapTimer <= 0) {
      this.mapTimer = MAP_SECONDS;
      this.drawMap(player);
    }
    const people = [player.position, ...[...this.others.values()].map((o) => o.position)];
    this.built?.update(delta, people);

    const { x, z } = player.position;
    this.view.follow(x, z, CAMERA_LERP);
  }

  private onServerMessage(message: ServerMessage): void {
    const store = useGameStore.getState();
    const self = store.session;
    const selfId = self?.id;
    const nameOf = (id: string) => (id === selfId ? self?.name : this.others.get(id)?.name) ?? '?';
    switch (message.t) {
      case 'welcome':
        store.setLoading(false);
        for (const id of this.others.keys()) this.walkPet(id, null, null);
        for (const other of this.others.values()) other.dispose();
        this.others.clear();
        this.regrow(message.opened, false);
        this.lampFlips.clear();
        for (const index of message.lamps ?? []) this.lampFlips.set(index, performance.now());
        this.applyLamps();
        if (this.areaId === 'conference') {
          store.setStage(message.stage ?? null, message.now, message.presenter ?? false);
          this.built?.stage?.setLit(!!message.stage);
        }
        message.players.forEach((p) => this.addOther(p));
        // After a reconnect the server puts us at the door; walk back to where we are,
        // then repeat the status, since an activity only counts once seated.
        if (this.player && !sameTile(message.tile, this.player.tile)) {
          this.connection?.move(this.player.tile);
          this.connection?.status(studyStatus());
        }
        break;
      case 'joined':
        if (message.player.id === selfId) break;
        this.addOther(message.player, true);
        store.addChatLine({ kind: 'joined', name: message.player.name, self: false });
        break;
      case 'left': {
        const other = this.others.get(message.id);
        if (!other) break;
        store.addChatLine({ kind: 'left', name: other.name, self: false });
        this.walkPet(message.id, null, null);
        other.dispose();
        this.others.delete(message.id);
        if (store.selected?.id === message.id) store.setSelected(null);
        break;
      }
      case 'moved': {
        const other = this.others.get(message.id);
        if (!other) break;
        const route = this.routeFor(other, message.to);
        if (route) other.follow(route);
        else other.teleport(message.to);
        // Standing up clears the table and walking ends a dance or a cigarette, as on the server.
        other.clearActivity();
        other.setDancing(false);
        other.setSmoking(false);
        break;
      }
      case 'grew':
        this.regrow(message.opened, true);
        break;
      case 'danced':
        if (message.id !== selfId) {
          this.others.get(message.id)?.setDancing(message.on, message.move);
        }
        break;
      case 'lamped':
        if (message.flipped) this.lampFlips.set(message.index, performance.now());
        else this.lampFlips.delete(message.index);
        this.applyLamps();
        play('pop');
        break;
      case 'afked':
        if (message.id !== selfId) this.others.get(message.id)?.setAfk(message.on);
        else this.player?.setAfk(message.on);
        break;
      case 'smoked':
        if (message.id !== selfId) this.others.get(message.id)?.setSmoking(message.on);
        break;
      case 'patted': {
        const petter = message.id === selfId ? this.player : this.others.get(message.id);
        const pet = this.petOf(message.owner === selfId ? 'self' : message.owner);
        if (petter && pet) {
          petter.face(pet.position.x - petter.position.x, pet.position.z - petter.position.z);
          petter.play('poke');
        }
        pet?.pat();
        if (pet) play('purr');
        break;
      }
      case 'table':
        store.setTable(message.kind, message.table);
        break;
      case 'tableError':
        // Only "not your turn" and the like: the table panel shows whose turn it is anyway.
        break;
      case 'jukebox':
        store.setJukebox(message.state);
        break;
      case 'staged':
        store.setStage(message.stage, message.now);
        this.built?.stage?.setLit(!!message.stage);
        break;
      case 'status':
        if (message.id !== selfId) this.others.get(message.id)?.setStatus(message.status);
        break;
      case 'lined':
        if (message.id !== selfId) this.others.get(message.id)?.setLines(message.lines);
        break;
      case 'emoted': {
        const quiet = !AREA_RULES[this.areaId].effectsVisible;
        (message.id === selfId ? this.player : this.others.get(message.id))?.emote(
          message.emote,
          quiet,
        );
        if (!quiet) play('pop');
        break;
      }
      case 'looked': {
        const other = this.others.get(message.id);
        other?.setLook(message.look);
        this.looks.set(message.id, message.look);
        if (other) this.walkPet(message.id, other, message.look);
        break;
      }
      case 'finished':
        // A finished session: the whole room sees it; the sound was the finisher's alone.
        (message.id === selfId ? this.player : this.others.get(message.id))?.celebrate();
        break;
      case 'placed':
        if (message.id === selfId && this.player && !sameTile(this.player.tile, message.tile)) {
          this.player.teleport(message.tile);
        }
        break;
      case 'said': {
        const mine = message.id === selfId;
        // "Do not disturb" hides everyone else's chatter, in the room and in the chat panel;
        // muting or blocking someone hides theirs.
        if (!mine && (store.dnd || isMuted(message.id))) break;
        (mine ? this.player : this.others.get(message.id))?.say(message.text);
        store.addChatLine({
          kind: 'say',
          name: nameOf(message.id),
          text: message.text,
          self: mine,
          at: message.at,
        });
        break;
      }
      case 'whispered':
        if (message.from !== selfId && isMuted(message.from)) break;
        store.addChatLine({
          kind: 'whisper',
          name: nameOf(message.from),
          to: nameOf(message.to),
          text: message.text,
          self: message.from === selfId,
          at: message.at,
        });
        if (message.from !== selfId) store.setChatOpen(true);
        break;
      case 'invited': {
        if (store.dnd || isMuted(message.from)) break;
        store.setInvite({ from: nameOf(message.from), code: message.code, name: message.name });
        store.notify({
          kind: 'invite',
          name: nameOf(message.from),
          from: message.from,
          code: message.code,
        });
        if (mayRing()) play('clink');
        break;
      }
      case 'poked': {
        // Only the two of them see it: the poker reaches out, the poked one jumps.
        const poker = message.from === selfId ? this.player : this.others.get(message.from);
        const poked = message.to === selfId ? this.player : this.others.get(message.to);
        if (poker && poked) {
          poker.face(poked.position.x - poker.position.x, poked.position.z - poker.position.z);
        }
        poker?.play('poke');
        poked?.poked(nameOf(message.from), message.to === selfId);
        if (message.to === selfId && !isMuted(message.from)) {
          store.notify({ kind: 'poke', name: nameOf(message.from), from: message.from }, 'poked');
          if (mayRing()) play('poke');
        }
        break;
      }
      case 'roomRules':
        store.setRoomRules(message.rules);
        break;
      case 'chaired':
        this.setChair(message.tile, message.pulled);
        break;
      case 'error':
        // A known wait shows on the send button; anything else gets a short notice.
        if (message.code === 'rate_limited' && message.retryInMs) {
          store.setCooldown(this.areaId, Date.now() + message.retryInMs);
        } else if (message.code === 'seat_taken') {
          this.stepOffSeat();
          store.setNotice('seat_taken');
        } else if (
          message.code === 'kicked' ||
          message.code === 'banned' ||
          message.code === 'room_closed'
        ) {
          // Sent out of a private room: back down to the hall, and told why.
          const room = store.room?.room.name ?? '';
          store.notify({ kind: message.code, name: room }, message.code);
          if (message.code !== 'kicked') store.setRoom(null);
          this.connection?.close();
          this.goThrough('hall');
        } else if (message.code === 'blocked') {
          store.setNotice('blocked_between');
        } else if (message.code !== 'bad_message') {
          store.setNotice(message.code);
        }
        break;
    }
    useGameStore.getState().setPlayersHere(this.others.size + 1);
    this.listRoomPeople();
  }

  /** In a private room, its owner sees who is inside, to send someone out. */
  private listRoomPeople(): void {
    if (!isRoomArea(this.areaId)) return;
    const people = [...this.others].map(([id, avatar]) => ({ id, name: avatar.name }));
    const key = people.map((p) => p.id).join(',');
    if (key === this.peopleKey) return;
    this.peopleKey = key;
    useGameStore.getState().setRoomPeople(people);
  }

  /** Puts whoever is on shift behind this room's desk, or a sign when the desk is closed. */
  private seatStaff(): void {
    this.removeStaff();
    const ambience = this.built?.ambience;
    this.staff = Staff.create(this.assets.characters, this.grid, this.context, localHour(), {
      windows: (ambience?.windows ?? []).map((w) => ({
        stand: w.stand,
        facing: { x: -w.normal.x, y: -w.normal.z },
      })),
      toggleWindow: (i) => ambience?.setWindowOpen(i, !ambience.isWindowOpen(i)),
      daytime: () => ['morning', 'day', 'afternoon'].includes(dayPhase(localHour())),
    });
    if (this.staff) {
      this.view.add(this.staff.avatar.root);
      return;
    }
    this.deskSign = closedSign(this.grid, t('staff.closed'));
    if (this.deskSign) this.view.add(this.deskSign);
  }

  private removeStaff(): void {
    this.staff?.dispose();
    this.staff = null;
    if (this.deskSign) {
      this.deskSign.element.remove();
      this.deskSign.removeFromParent();
      this.deskSign = null;
    }
  }

  /**
   * Chairs at tables: pulled out for whoever stands at one, slid in under
   * whoever sits, and left out when someone walks off without sitting (or
   * leaves the building seated). Whoever stood up after sitting pushes theirs
   * back in; the librarian tidies the rest after a while.
   */
  private updateChairs(delta: number): void {
    const built = this.built;
    if (!built) return;
    const bodies = [this.player, ...this.others.values()].filter((b): b is Avatar => !!b);
    for (const chair of this.chairs.values()) {
      const someone = bodies.find((b) => sameTile(b.tile, chair.tile) && !b.isMoving);
      let target = chair.out ? CHAIR_PULLED : CHAIR_TUCKED;
      if (someone?.isSeated) target = CHAIR_INSET;
      else if (someone) target = CHAIR_PULLED;
      if (someone) {
        chair.out = true;
        chair.emptyFor = 0;
      } else if (chair.out) {
        chair.emptyFor += delta;
      }
      if (Math.abs(target - chair.offset) < 0.002) continue;
      chair.offset += (target - chair.offset) * Math.min(1, delta * 6);
      built.setChair(chair.tile, chair.offset);
    }
    // Stood up after sitting: push the chair back in, for everyone.
    const player = this.player;
    if (player?.isSeated) this.satAt = player.tile;
    else if (this.satAt && player && !sameTile(player.tile, this.satAt)) {
      const chair = this.chairs.get(`${this.satAt.x},${this.satAt.y}`);
      if (chair) {
        chair.out = false;
        this.connection?.chair(chair.tile, false);
      }
      this.satAt = null;
    }
    // The librarian's job: chairs left out for a while.
    this.tidyTimer -= delta;
    if (this.tidyTimer > 0 || this.staff?.kind !== 'librarian') return;
    this.tidyTimer = 5;
    const staff = this.staff;
    for (const chair of this.chairs.values()) {
      if (!chair.out || chair.emptyFor < TIDY_AFTER_SECONDS) continue;
      if (
        staff.choresWaiting.some(
          (c) => sameTile(c.facing, chair.toTable) && sameTile(c.stand, this.tidyStand(chair)),
        )
      )
        continue;
      staff.addChore({
        stand: this.tidyStand(chair),
        facing: chair.toTable,
        done: () => {
          chair.out = false;
        },
      });
    }
  }

  /** Where to stand to push a chair in: behind it, or on its tile when that is blocked. */
  private tidyStand(chair: { tile: Point; toTable: Point }): Point {
    const behind = { x: chair.tile.x - chair.toTable.x, y: chair.tile.y - chair.toTable.y };
    return this.grid.isWalkable(behind) && !this.grid.isSeat(behind) ? behind : chair.tile;
  }

  /**
   * At a chair: it is pulled out and the player is asked what they will work
   * on; they sit once they choose. Saying "not now" steps them back off it.
   */
  private askAtChair(player: Avatar): void {
    const store = useGameStore.getState();
    if (!player.isAtChair) {
      if (!player.isSeated) this.chairAsked = false;
      if (!player.isAtChair && !player.isSeated && !player.isMoving) {
        player.chairAllowed = false;
        player.sofaAllowed = false;
      }
      return;
    }
    // A theatre chair: no question, people come to sit and watch.
    if (player.waitingKind === 'sofa' && this.grid.tileAt(player.tile) === TILE.theaterSeat) {
      player.sofaAllowed = true;
      return;
    }
    // Wandering while idle, the body just sits down; the player is not there to ask.
    if (player.waitingKind === 'sofa' && this.wandering) {
      player.sofaAllowed = true;
      return;
    }
    // A sofa: just a question, and a little jump onto it.
    if (player.waitingKind === 'sofa') {
      if (this.chairAsked) return;
      this.chairAsked = true;
      store.ask({
        kind: 'sofa',
        answer: (choice) => {
          store.ask(null);
          if (choice === 'end') player.sofaAllowed = true;
          else this.stepOffSeat();
          this.chairAsked = false;
        },
      });
      return;
    }
    if (!this.chairAsked) {
      this.chairAsked = true;
      if (store.activity) player.chairAllowed = true;
      else store.setSitStep('activity');
      return;
    }
    // Asked, and the question was closed without a choice.
    if (!store.sitStep && !store.activity && !player.chairAllowed) {
      this.chairAsked = false;
      this.stepOffSeat();
    }
  }

  /** A chair someone else moved (pulled out, or pushed back in). */
  private setChair(tile: Point, pulled: boolean): void {
    const chair = this.chairs.get(`${tile.x},${tile.y}`);
    if (chair) chair.out = pulled;
  }

  /** The light of the hour, checked now and then: the sun, the sky in the windows, the lamps. */
  private updateDaylight(): void {
    const phase = dayPhase(localHour());
    if (phase === this.phase) return;
    this.phase = phase;
    this.view.setDaylight(DAYLIGHT[phase]);
    this.built?.ambience.setPhase(phase);
  }

  /** This room's rules, with a private room's owner's choices on top. */
  private rules() {
    return rulesFor(this.areaId, useGameStore.getState().roomRules);
  }

  /**
   * The owner changed the private room's rules: pets come or go, and the
   * game table is set up or put away.
   */
  private applyRoomRules(rules: RoomRules, before: RoomRules): void {
    const store = useGameStore.getState();
    if (before.games !== rules.games) this.buildRoom(this.grid.opened);
    if (before.pets === rules.pets) return;
    this.walkPet('self', this.player, store.look);
    for (const [id, other] of this.others) this.walkPet(id, other, this.looks.get(id) ?? null);
  }

  /** A pet in the room by its person ('self' for the player's), walking along or waiting at the door. */
  private petOf(owner: string): Pet | null {
    return this.pets.get(owner) ?? this.waiting.get(owner) ?? null;
  }

  private addOther(player: PlayerSnapshot, arriving = false): void {
    this.others.get(player.id)?.dispose();
    const avatar = new Avatar(
      this.assets.characters,
      player.look,
      player.tile,
      player.name,
      false,
      this.context,
    );
    avatar.setStatus(player.status);
    avatar.setLines(player.lines);
    avatar.setFriend(this.isFriend(player.id));
    avatar.setDancing(player.dancing, player.danceMove ?? 0);
    avatar.setAfk(player.afk ?? false);
    avatar.setSmoking(player.smoking ?? false);
    avatar.onTap = () => this.tapPerson(player.id);
    this.others.set(player.id, avatar);
    this.view.add(avatar.root);
    this.looks.set(player.id, player.look);
    const pet = this.walkPet(player.id, avatar, player.look);
    // Someone who just came in through a door: their pet follows them in.
    const from = arriving ? this.grid.doorNextTo(player.tile) : null;
    const doorway = from ? this.doorwayFrom(from, player.tile) : null;
    if (pet && doorway) pet.enterThrough(doorway.at, doorway.facing);
  }

  /**
   * In the hall, a sign over the door to a room where an event is on (or
   * about to start), so people coming in know where to go.
   */
  private pointToEvent(now: number, proposed: Parameters<typeof eventNow>[3]): void {
    let key = '';
    let to: AreaId | null = null;
    let title = '';
    if (this.areaId === 'hall') {
      for (const area of ['conference', 'smoking', 'library'] as const) {
        const live = eventNow(area, now, EVENTS, proposed, DECOR_LEAD_MS);
        if (!live) continue;
        to = area;
        title = eventTitle(live.event);
        key = `${area}:${live.event.id}`;
        break;
      }
    }
    if (key === this.eventSignKey) return;
    this.eventSignKey = key;
    if (this.eventSign) {
      this.eventSign.removeFromParent();
      this.eventSign.element.remove();
      this.eventSign = null;
    }
    if (!to) return;
    const doors: Point[] = [];
    this.grid.area.layout.forEach((row, y) =>
      [...row].forEach((_, x) => {
        if (this.grid.doorTarget({ x, y }) === to) doors.push({ x, y });
      }),
    );
    if (doors.length === 0) return;
    const x = doors.reduce((sum, p) => sum + p.x, 0) / doors.length + 0.5;
    const z = doors.reduce((sum, p) => sum + p.y, 0) / doors.length + 0.5;
    const element = document.createElement('div');
    element.className = 'world-sign world-sign--event';
    element.textContent = `🎉 ${title} →`;
    this.eventSign = new CSS2DObject(element);
    this.eventSign.position.set(x, 2.6, z);
    this.view.add(this.eventSign);
  }

  /**
   * Checks the clock once a second: when an event starts in this room it
   * dresses up and its music plays; when it ends, both go away again.
   */
  private updateEvent(delta: number): void {
    this.decor?.update(delta);
    this.eventTimer -= delta;
    if (this.eventTimer > 0) return;
    this.eventTimer = 1;
    const now = Date.now();
    const { proposed } = useGameStore.getState();
    // Dressed from 15 minutes before; the music waits for the start itself.
    const live = eventNow(this.areaId, now, EVENTS, proposed, DECOR_LEAD_MS);
    const id = live?.event.id ?? null;
    this.pointToEvent(now, proposed);
    if (id !== this.eventId) {
      this.eventId = id;
      this.decor?.dispose();
      this.decor = null;
      if (live) {
        const title = eventTitle(live.event);
        this.decor = buildEventDecor(this.grid, EVENT_THEMES[themeOf(live.event)], title);
        this.view.add(this.decor.root);
      }
    }
    // The smoking room always has its own music (see RoomMusic); elsewhere an event brings some.
    const { musicOn } = useGameStore.getState();
    if (live && now >= live.start && musicOn && this.areaId !== 'smoking') {
      playMusic(EVENT_THEMES[themeOf(live.event)].music);
    } else stopMusic();
  }

  /**
   * Gives someone's pet to the room, swaps it for another kind, or takes it
   * away (no pet, or no owner). Rooms that keep pets out (the library) get
   * none. Returns the pet walking with them, if any.
   */
  private walkPet(id: string, owner: Avatar | null, look: Appearance | null): Pet | null {
    const kind = look?.pet;
    const dress: PetDress = {
      ...(look?.petColor !== undefined ? { petColor: look.petColor } : {}),
      ...(look?.petAccessory ? { petAccessory: look.petAccessory } : {}),
    };
    const current = this.pets.get(id);
    if (current && owner && current.kind === kind && sameDress(current.dress, dress))
      return current;
    current?.dispose();
    this.pets.delete(id);
    if (!owner || !kind || !this.rules().pets) return null;
    const { x, z } = owner.position;
    const pet = new Pet(this.assets.pets, kind, { x, z }, `${id}:${kind}`, this.petContext, dress);
    pet.placeBy({ x, z });
    this.pets.set(id, pet);
    this.view.add(pet.root);
    return pet;
  }

  private updatePets(delta: number): void {
    for (const [id, pet] of this.pets) {
      const owner = id === 'self' ? this.player : this.others.get(id);
      if (!owner) continue;
      const { x, z } = owner.position;
      pet.update(delta, { x, z, moving: owner.isMoving });
    }
    for (const pet of this.waiting.values()) pet.update(delta, null);
  }

  /**
   * In the hall, the pets of people studying in the library sit by its door,
   * each with a small name tag, until their person comes back out.
   */
  private seatWaitingPets(waiting: readonly WaitingPet[]): void {
    const selfId = useGameStore.getState().session?.id;
    const here = this.areaId === 'hall' ? waiting.filter((w) => w.id !== selfId) : [];
    for (const [id, pet] of this.waiting) {
      if (here.some((w) => w.id === id && w.pet === pet.kind && sameDress(pet.dress, w))) continue;
      pet.dispose();
      this.waiting.delete(id);
    }
    const spots = this.doorSpots();
    here.forEach((w, i) => {
      const spot = spots[i % Math.max(1, spots.length)];
      if (!spot) return;
      let pet = this.waiting.get(w.id);
      if (!pet) {
        const dress: PetDress = {
          ...(w.petColor !== undefined ? { petColor: w.petColor } : {}),
          ...(w.petAccessory ? { petAccessory: w.petAccessory } : {}),
        };
        pet = new Pet(
          this.assets.pets,
          w.pet,
          spot.spot,
          `${w.id}:${w.pet}`,
          this.petContext,
          dress,
        );
        const sex = w.petSex === 'female' ? ' ♀' : w.petSex === 'male' ? ' ♂' : '';
        pet.setTag(`${t('pet.waiting', { name: w.name, pet: t(`pet.kind.${w.pet}`) })}${sex}`);
        this.waiting.set(w.id, pet);
        this.view.add(pet.root);
      }
      pet.wait(spot.spot, spot.facing);
    });
  }

  /** Places beside the library door, inside the hall, facing the door. */
  /** The doorway someone coming from `from` steps in through, next to where they arrive. */
  private doorwayFrom(
    from: AreaId,
    inside: Point,
  ): { at: { x: number; z: number }; facing: { x: number; z: number } } | null {
    const door = [
      { x: inside.x, y: inside.y - 1 },
      { x: inside.x, y: inside.y + 1 },
      { x: inside.x - 1, y: inside.y },
      { x: inside.x + 1, y: inside.y },
    ].find((p) => this.grid.doorTarget(p) === from);
    if (!door) return null;
    const into = { x: inside.x - door.x, z: inside.y - door.y };
    return { at: { x: door.x + 0.5 - into.x * 0.2, z: door.y + 0.5 - into.z * 0.2 }, facing: into };
  }

  private doorSpots(): { spot: { x: number; z: number }; facing: { x: number; z: number } }[] {
    if (this.areaId !== 'hall') return [];
    const inside = this.grid.arrivalPoint('library');
    const door = [
      { x: inside.x, y: inside.y - 1 },
      { x: inside.x, y: inside.y + 1 },
      { x: inside.x - 1, y: inside.y },
      { x: inside.x + 1, y: inside.y },
    ].find((p) => this.grid.doorTarget(p) === 'library');
    if (!door) return [];
    const into = { x: inside.x - door.x, z: inside.y - door.y };
    const side = { x: -into.z, z: into.x };
    const spots: { spot: { x: number; z: number }; facing: { x: number; z: number } }[] = [];
    for (const k of [1, -1, 2, -2, 3, -3, 4, -4]) {
      const spot = {
        x: inside.x + 0.5 + side.x * k * PET_SPACING + into.x * 0.1,
        z: inside.y + 0.5 + side.z * k * PET_SPACING + into.z * 0.1,
      };
      const tile = { x: Math.floor(spot.x), y: Math.floor(spot.z) };
      if (this.grid.isWalkable(tile) && !this.grid.isSeat(tile)) {
        spots.push({ spot, facing: { x: -into.x, z: -into.z } });
      }
    }
    return spots;
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    this.wake();
    const { typing, wardrobeOpen, statusOpen, confirm } = useGameStore.getState();
    if (typing || wardrobeOpen || statusOpen || confirm || !(event.code in KEY_DIRECTIONS)) return;
    event.preventDefault();
    this.heldKeys.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.heldKeys.delete(event.code);
  };

  private readonly onBlur = () => this.heldKeys.clear();

  /** The right button has its own menu in the world; the browser's would only get in the way. */
  private readonly onContextMenu = (event: MouseEvent) => event.preventDefault();

  private readonly onPointerDown = (event: PointerEvent) => {
    this.wake();
    unlockAudio();
    const store = useGameStore.getState();
    if (this.view.isPinching || store.confirm) return;
    if (store.radial) store.setRadial(null);
    const target = this.targetAt(event.clientX, event.clientY);
    if (!target) return;
    if (event.button === RIGHT_BUTTON) {
      this.rightClick(event, target);
      return;
    }
    switch (target.kind) {
      case 'self': {
        // Tapping yourself opens the ring of things you can do.
        const at = this.selfScreenPoint();
        if (at) store.setRadial(at);
        return;
      }
      case 'person':
        // Tapping someone opens a ring of what you can do with them, around them;
        // where several stand on top of each other, first a choice of who.
        this.ripple(event, 'talk');
        this.tapPersonAt(target.id, event.clientX, event.clientY);
        return;
      case 'pet':
        this.ripple(event, 'talk');
        this.goToPet(target.owner);
        return;
      case 'examine':
        this.ripple(event, 'look');
        this.goTo(target.examinable.stand, { kind: 'examine', examinable: target.examinable });
        return;
      case 'tile': {
        const { tile } = target;
        const kind = this.cursorKind(tile);
        this.ripple(event, kind ?? (this.grid.isWalkable(tile) ? 'walk' : null));
        if (this.grid.tileAt(tile) === TILE.receptionDesk) {
          this.goTo(tile, { kind: 'desk', tile });
          return;
        }
        // The elevator goes up to the private rooms.
        if (this.grid.tileAt(tile) === TILE.elevator) {
          const front = this.grid.arrivalPoint('room3');
          this.goTo(front, { kind: 'elevator' });
          return;
        }
        this.walkTo(tile);
      }
    }
  };

  /**
   * The right button does things at once, without walking: on yourself the
   * ring of actions, on someone their card, on a pet a stroke (if it is near),
   * and anywhere else the ring too, so it is always one click away.
   */
  private rightClick(event: PointerEvent, target: Target): void {
    const store = useGameStore.getState();
    switch (target.kind) {
      case 'person':
        this.ripple(event, 'talk');
        this.tapPersonAt(target.id, event.clientX, event.clientY);
        return;
      case 'pet':
        this.ripple(event, 'talk');
        this.goToPet(target.owner);
        return;
      default: {
        const at = target.kind === 'self' ? this.selfScreenPoint() : null;
        store.setRadial(at ?? { x: event.clientX, y: event.clientY });
      }
    }
  }

  /** Walks up to a pet and pets it; right next to it, at once. */
  private goToPet(owner: string): void {
    const pet = this.petOf(owner);
    const player = this.player;
    if (!pet || !player) return;
    const tile = { x: Math.floor(pet.position.x), y: Math.floor(pet.position.z) };
    const near = Math.hypot(pet.position.x - player.position.x, pet.position.z - player.position.z);
    if (near < 1.3 && !player.isMoving) {
      this.arrive(player, { kind: 'pat', owner });
      return;
    }
    this.goTo(tile, { kind: 'pat', owner });
  }

  private readonly onPointerMove = (event: PointerEvent) => {
    this.pointer = event.pointerType === 'mouse' ? { x: event.clientX, y: event.clientY } : null;
  };

  private readonly onPointerLeave = () => {
    this.pointer = null;
  };

  /** What is under a screen point: a person (by their whole body), something to look at, or a tile. */
  private targetAt(clientX: number, clientY: number): Target | null {
    const person = this.avatarAt(clientX, clientY);
    if (person === 'self') return { kind: 'self' };
    if (person) return { kind: 'person', id: person };
    // Pets are small and walk under feet: they come right after people.
    const pet = this.petAt(clientX, clientY);
    if (pet) return { kind: 'pet', owner: pet };
    // A chair or sofa anywhere on it, back and seat alike, before what stands behind it.
    const seat = this.seatOnScreen(clientX, clientY);
    const examinable = seat ? null : this.examinableAt(clientX, clientY);
    if (examinable) return { kind: 'examine', examinable };
    const tile = seat ?? this.pickTile(clientX, clientY);
    if (!tile) return null;
    // A tap on the floor under someone still means them.
    const someone = this.personAt(tile);
    return someone ? { kind: 'person', id: someone } : { kind: 'tile', tile };
  }

  /**
   * Whose body is under a screen point, the front-most one if several overlap:
   * head, chest or feet all count, not just the tile they stand on.
   */
  private avatarAt(clientX: number, clientY: number): string | 'self' | null {
    let best: { id: string | 'self'; depth: number } | null = null;
    const check = (id: string | 'self', avatar: Avatar) => {
      const box = avatar.bodyBox;
      // Nearer the camera (south-east) is in front. Where someone overlaps the
      // player, they win: the player can open their own ring from anywhere else on them.
      const depth = box.x + box.z - (id === 'self' ? 0.6 : 0);
      if (this.onScreen(box, clientX, clientY) && (!best || depth > best.depth)) {
        best = { id, depth };
      }
    };
    if (this.player) check('self', this.player);
    for (const [id, other] of this.others) check(id, other);
    return (best as { id: string | 'self' } | null)?.id ?? null;
  }

  /** Everyone else whose body is under a screen point, front-most first. */
  private othersAt(clientX: number, clientY: number): string[] {
    return [...this.others]
      .filter(([, other]) => this.onScreen(other.bodyBox, clientX, clientY))
      .sort(([, a], [, b]) => b.bodyBox.x + b.bodyBox.z - (a.bodyBox.x + a.bodyBox.z))
      .map(([id]) => id);
  }

  /** A tap on someone: their ring, or a choice when others stand on top of them. */
  private tapPersonAt(id: string, clientX: number, clientY: number): void {
    const under = this.othersAt(clientX, clientY);
    const crowd = [...this.mergedWith.values()].find((ids) => ids.includes(id)) ?? [];
    const group = [...new Set([id, ...under, ...crowd])];
    if (group.length > 1) this.openPicker(group, clientX, clientY);
    else this.openPersonRing(id);
  }

  /** A tap on a name tag: their ring, or the choice for a "+N" crowd tag. */
  private tapPerson(id: string): void {
    const group = this.mergedWith.get(id);
    const other = this.others.get(id);
    if (group && group.length > 1 && other) {
      const box = other.bodyBox;
      const at = this.view.project(box.x, box.bottom + (box.top - box.bottom) * 0.55, box.z);
      this.openPicker(group, at.x, at.y);
    } else this.openPersonRing(id);
  }

  private openPicker(ids: readonly string[], x: number, y: number): void {
    const people = ids.flatMap((id) => {
      const other = this.others.get(id);
      return other ? [{ id, name: other.name, lines: other.statusLines }] : [];
    });
    useGameStore.getState().setRadial({ x, y, mode: 'pick', people });
  }

  /**
   * Tight crowds (three or more within about a tile) show one name tag with
   * "+N" instead of a pile of tags. The player's own tag and friends' stay.
   */
  private mergeTags(): void {
    const loose = [...this.others].filter(([, o]) => !o.isFriend);
    const groups: string[][] = [];
    const seen = new Set<string>();
    for (const [id] of loose) {
      if (seen.has(id)) continue;
      const group = [id];
      seen.add(id);
      for (let i = 0; i < group.length; i++) {
        const at = this.others.get(group[i] ?? '')?.bodyBox;
        if (!at) continue;
        for (const [otherId, o] of loose) {
          if (seen.has(otherId)) continue;
          const box = o.bodyBox;
          if (Math.hypot(box.x - at.x, box.z - at.z) < MERGE_DISTANCE) {
            seen.add(otherId);
            group.push(otherId);
          }
        }
      }
      groups.push(group);
    }
    this.mergedWith.clear();
    for (const group of groups) {
      if (group.length < MERGE_AT) {
        for (const id of group) this.others.get(id)?.setMerged(false);
        continue;
      }
      // The one nearest the camera keeps the tag.
      const sorted = [...group].sort((a, b) => {
        const A = this.others.get(a)?.bodyBox;
        const B = this.others.get(b)?.bodyBox;
        return (B ? B.x + B.z : 0) - (A ? A.x + A.z : 0);
      });
      sorted.forEach((id, i) =>
        this.others.get(id)?.setMerged(i > 0, i === 0 ? group.length - 1 : 0),
      );
      const host = sorted[0];
      if (host) this.mergedWith.set(host, sorted);
    }
    for (const [, other] of this.others) if (other.isFriend) other.setMerged(false);
  }

  /** Whose pet is under a screen point ('self' for the player's own), the front-most one. */
  private petAt(clientX: number, clientY: number): string | null {
    let best: { owner: string; depth: number } | null = null;
    for (const [owner, pet] of [...this.pets, ...this.waiting]) {
      const box = pet.pickBox;
      const depth = box.x + box.z;
      if (this.onScreen(box, clientX, clientY) && (!best || depth > best.depth)) {
        best = { owner, depth };
      }
    }
    return best?.owner ?? null;
  }

  /** Whether a screen point falls on an upright box in the world (a body, a chair). */
  private onScreen(
    box: { x: number; z: number; radius: number; bottom: number; top: number },
    clientX: number,
    clientY: number,
  ): boolean {
    const foot = this.view.project(box.x, box.bottom, box.z);
    const head = this.view.project(box.x, box.top, box.z);
    const side = this.view.project(box.x + box.radius * 0.7, box.bottom, box.z - box.radius * 0.7);
    const half = Math.abs(side.x - foot.x);
    return (
      clientX >= foot.x - half &&
      clientX <= foot.x + half &&
      clientY >= head.y - half * 0.3 &&
      clientY <= foot.y + half * 0.4
    );
  }

  /**
   * The free chair or sofa drawn under a screen point, the front-most if
   * several overlap. Picking the floor alone missed half of every chair: a tap
   * on its back landed on the tile behind it, often the desk.
   */
  private seatOnScreen(clientX: number, clientY: number): Point | null {
    let best: { tile: Point; depth: number } | null = null;
    for (const tile of this.seatTiles) {
      const seat = this.grid.seatAt(tile);
      const toward = seat?.kind === 'chair' ? seat.facing : { x: 0, y: 0 };
      const box = {
        x: tile.x + 0.5 + toward.x * CHAIR_INSET,
        z: tile.y + 0.5 + toward.y * CHAIR_INSET,
        radius: SEAT_PICK_RADIUS,
        bottom: FLOOR_Y,
        top: FLOOR_Y + SEAT_PICK_HEIGHT,
      };
      const depth = box.x + box.z;
      if (this.onScreen(box, clientX, clientY) && (!best || depth > best.depth)) {
        best = { tile, depth };
      }
    }
    return best?.tile ?? null;
  }

  private examinableAt(clientX: number, clientY: number): Examinable | null {
    const built = this.built;
    if (!built) return null;
    const hit = this.view.pickObject(clientX, clientY, built.pickables);
    if (!hit) return null;
    let id: string | undefined;
    for (let node: typeof hit.object | null = hit.object; node && !id; node = node.parent) {
      const byInstance = node.userData.examineByInstance as (string | null)[] | undefined;
      id =
        (node.userData.examine as string | undefined) ??
        (byInstance && hit.instanceId !== undefined
          ? (byInstance[hit.instanceId] ?? undefined)
          : undefined);
    }
    return id ? (built.examinables.get(id) ?? null) : null;
  }

  /** The player's chest on screen, where the ring of actions opens. */
  private selfScreenPoint(): { x: number; y: number } | null {
    const player = this.player;
    if (!player) return null;
    const box = player.bodyBox;
    return this.view.project(box.x, box.bottom + (box.top - box.bottom) * 0.55, box.z);
  }

  /** A short ring where a tap landed, so it is clear what was tapped. */
  private ripple(event: PointerEvent, kind: CursorKind | 'walk' | null): void {
    if (!kind) return;
    const ring = document.createElement('div');
    ring.className = `click-ripple click-ripple--${kind}`;
    ring.style.translate = `${event.clientX}px ${event.clientY}px`;
    this.view.canvas.parentElement?.append(ring);
    ring.addEventListener('animationend', () => ring.remove());
    play('click');
  }

  /** Someone else sits on this seat (they are standing on its tile). */
  private seatTaken(tile: Point): boolean {
    if (!this.grid.isSeat(tile)) return false;
    for (const other of this.others.values()) if (sameTile(other.tile, tile)) return true;
    return false;
  }

  /** The server said the seat was taken first: step to the nearest free tile beside it. */
  private stepOffSeat(): void {
    const player = this.player;
    if (!player) return;
    const seat = player.tile;
    const free = this.grid
      .neighbors(seat)
      .filter((n) => !this.grid.isSeat(n) && !this.personAt(n))
      .sort((a, b) => reach(a, seat) - reach(b, seat))[0];
    if (!free) return;
    player.follow([{ x: free.x + 0.5, y: free.y + 0.5 }]);
    this.connection?.move(free);
  }

  /** Walks to `tile` (or next to it) and does `then` on arrival. */
  private goTo(tile: Point, then: Pending): void {
    const player = this.player;
    if (!player) return;
    const goal = resolveWalkTarget(this.grid, player.tile, tile);
    if (goal && sameTile(goal, player.tile) && !player.isMoving) {
      this.arrive(player, then);
      return;
    }
    this.walkTo(tile);
    this.pending = then;
  }

  /**
   * Away from the keyboard: after a couple of minutes a 💤 shows for everyone;
   * after five the character wanders over to something to look at (a shelf, a
   * painting, the lost-and-found box, a board) and moves on now and then.
   * Studying at a desk never counts as idle. Any key or tap wakes them where
   * they stand.
   */
  private idle(delta: number, player: Avatar): void {
    const store = useGameStore.getState();
    const busy =
      player.seatKind === 'chair' ||
      store.typing ||
      store.stick !== null ||
      this.steerDirection !== null ||
      (player.isMoving && !this.wandering);
    if (busy) {
      this.wake();
      return;
    }
    this.idleFor += delta;
    if (!this.afk && this.idleFor > AFK_AFTER_SECONDS) {
      this.afk = true;
      player.setAfk(true);
      this.connection?.afk(true);
    }
    this.fidget(delta, player);
    if (this.idleFor < WANDER_AFTER_SECONDS || player.isSeated || player.isMoving) return;
    this.wanderIn -= delta;
    if (this.wanderIn > 0) return;
    this.wanderIn = WANDER_EVERY[0] + Math.random() * (WANDER_EVERY[1] - WANDER_EVERY[0]);
    // Now and then a sofa or an armchair instead: they sit there until the player is back.
    const seats = this.seatTiles.filter(
      (tile) => this.grid.seatAt(tile)?.kind === 'sofa' && !this.personAt(tile),
    );
    const seat = seats[Math.floor(Math.random() * seats.length)];
    if (seat && Math.random() < IDLE_SIT_SHARE) {
      this.wandering = true;
      this.walkTo(seat);
      return;
    }
    const spots = [...(this.built?.examinables.values() ?? [])].filter(
      (e) => IDLE_LOOKS.has(e.kind) && this.grid.isWalkable(e.stand) && !this.personAt(e.stand),
    );
    const spot = spots[Math.floor(Math.random() * spots.length)];
    if (!spot) return;
    this.wandering = true;
    this.goTo(spot.stand, { kind: 'gaze' });
  }

  /**
   * Small things an idle body does where it is: turns to look around, and
   * now and then a yawn or a thinking face that the room sees too.
   */
  private fidget(delta: number, player: Avatar): void {
    if (this.idleFor < FIDGET_AFTER_SECONDS || player.isMoving) return;
    this.fidgetIn -= delta;
    if (this.fidgetIn > 0) return;
    this.fidgetIn = FIDGET_EVERY[0] + Math.random() * (FIDGET_EVERY[1] - FIDGET_EVERY[0]);
    if (Math.random() < 0.4) {
      const emote = FIDGET_EMOTES[Math.floor(Math.random() * FIDGET_EMOTES.length)] ?? 'sleepy';
      this.connection?.emote(emote);
    } else if (!player.isSeated) {
      const angle = Math.random() * Math.PI * 2;
      player.face(Math.sin(angle), Math.cos(angle));
    }
  }

  /**
   * The house rule: library lamps are off by day and on from half past three
   * until seven in the morning. Only a librarian on duty puts a switched lamp
   * back; from ten at night to nine in the morning nobody does, and the
   * morning librarian sees to it.
   */
  private lampsDue(): boolean {
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    return hour >= LAMPS_ON_FROM || hour < LAMPS_OFF_FROM;
  }

  private lampOn(index: number): boolean {
    return this.lampsDue() !== this.lampFlips.has(index);
  }

  /** Lights each library lamp as the rule and the switches say. */
  private applyLamps(): void {
    const ambience = this.built?.ambience;
    if (!ambience || this.areaId !== 'library') return;
    const count = [...(this.built?.examinables.values() ?? [])].filter(
      (e) => e.kind === 'lamp',
    ).length;
    for (let i = 0; i < count; i++) ambience.setLamp(i, this.lampOn(i));
  }

  /**
   * Every few seconds: the lamps follow the hour, and a lamp switched against
   * the rule for a while gets a visit from the librarian, who puts it back
   * with a word ("plenty of daylight" by day, "too dark to read" in the evening).
   */
  private keepLamps(delta: number): void {
    this.lampTimer -= delta;
    if (this.lampTimer > 0 || this.areaId !== 'library') return;
    this.lampTimer = 2;
    this.applyLamps();
    const staff = this.staff;
    if (staff?.kind !== 'librarian') return;
    const now = performance.now();
    for (const [index, since] of this.lampFlips) {
      if (now - since < LAMP_PATIENCE_MS) continue;
      const lamp = this.built?.examinables.get(`lamp:${index}`);
      if (!lamp || staff.choresWaiting.some((c) => sameTile(c.stand, lamp.stand))) continue;
      const day = !this.lampsDue();
      staff.addChore({
        stand: lamp.stand,
        facing: { x: 0, y: -1 },
        done: () => {
          if (!this.lampFlips.has(index)) return;
          staff.avatar.say(t(day ? 'staff.lampOff' : 'staff.lampOn'));
          this.connection?.lamp(index, false);
        },
      });
    }
  }

  /** Back at the keyboard: the 💤 goes away and nothing wanders off on its own. */
  private wake(): void {
    this.idleFor = 0;
    this.wanderIn = 0;
    this.fidgetIn = 0;
    if (this.wandering) {
      this.wandering = false;
      if (this.pending?.kind === 'gaze') this.pending = null;
    }
    if (!this.afk) return;
    this.afk = false;
    this.player?.setAfk(false);
    this.connection?.afk(false);
  }

  /** Does what the player walked over for, once they stand still. */
  private arrive(player: Avatar, pending: Pending): void {
    this.pending = null;
    const store = useGameStore.getState();
    const lookAt = (p: Point) =>
      player.face(p.x + 0.5 - player.position.x, p.y + 0.5 - player.position.z);
    switch (pending.kind) {
      case 'person': {
        const other = this.others.get(pending.id);
        if (!other) return;
        lookAt(other.tile);
        this.select(pending.id);
        return;
      }
      case 'examine': {
        const { examinable } = pending;
        if (examinable.kind === 'topic') {
          // A slip from the jar: the player asks the room a question.
          const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
          if (topic) this.connection?.say(`💬 ${topic}`);
          play('pop');
          return;
        }
        if (examinable.kind === 'table') {
          lookAt({ x: examinable.stand.x, y: examinable.stand.y - 1 });
          store.setTableOpen(examinable.index === 0 ? 'darts' : 'menu');
          return;
        }
        if (examinable.kind === 'jukebox') {
          lookAt({ x: examinable.stand.x - 1, y: examinable.stand.y });
          store.setJukeboxOpen(true);
          return;
        }
        if (examinable.kind === 'game') {
          const machine = MACHINES[examinable.index];
          lookAt({ x: examinable.stand.x, y: examinable.stand.y - 1 });
          if (machine === 'vending') {
            // A coffee from the machine: everyone in the room sees you holding one.
            this.connection?.emote('coffee');
            store.setNotice('vending');
            play('pop');
          } else if (machine) {
            store.setGame(machine);
          }
          return;
        }
        if (examinable.kind === 'lamp') {
          const lamp = this.built?.examinables.get(`lamp:${examinable.index}`);
          if (lamp) lookAt({ x: lamp.stand.x, y: lamp.stand.y - 1 });
          this.connection?.lamp(examinable.index, !this.lampFlips.has(examinable.index));
          return;
        }
        if (examinable.kind === 'lost') {
          store.setDiscovery({ kind: 'lost', index: 0, pick: Math.floor(Date.now() / 86_400_000) });
          return;
        }
        const pick =
          examinable.kind === 'shelf'
            ? Math.floor(Math.random() * (SHELF_TOPICS[examinable.index]?.moments.length ?? 1))
            : examinable.kind === 'renovation'
              ? Math.floor(Math.random() * RENOVATION_NOTES.length)
              : 0;
        store.setDiscovery({ kind: examinable.kind, index: examinable.index, pick });
        return;
      }
      case 'desk':
        lookAt(pending.tile);
        // The reception looks after the private rooms (and explains the place); the librarian points to the notices.
        if (this.areaId === 'hall') {
          // The receptionist turns to the player and holds out a key (and says so), then the form.
          this.staff?.avatar.face(
            player.position.x - (this.staff?.avatar.position.x ?? 0),
            player.position.z - (this.staff?.avatar.position.z ?? 0),
          );
          this.staff?.avatar.play('poke');
          store.openRooms(null, true);
        } else store.setBoardOpen(true);
        return;
      case 'elevator':
        store.openRooms();
        return;
      case 'gaze':
        return;
      case 'ride':
        this.goThrough(pending.to);
        return;
      case 'pat': {
        const pet = this.petOf(pending.owner);
        if (!pet) return;
        player.face(pet.position.x - player.position.x, pet.position.z - player.position.z);
        const selfId = store.session?.id;
        const owner = pending.owner === 'self' ? selfId : pending.owner;
        if (owner) this.connection?.pat(owner);
        return;
      }
    }
  }

  /** Lights a cigarette or puts it out, where the room allows it. */
  private smoke(on: boolean): void {
    const player = this.player;
    if (!player || player.isSmoking === on) return;
    if (on && (!AREA_RULES[this.areaId].smoke || player.isSeated)) {
      const store = useGameStore.getState();
      store.setSmoking(false);
      store.setNotice('no_smoke');
      return;
    }
    player.setSmoking(on);
    if (on) play('lighter');
    this.connection?.smoke(on);
  }

  /** Starts or stops dancing, where the room allows it. */
  private dance(on: boolean, move: number): void {
    const player = this.player;
    if (!player || (player.isDancing === on && (!on || player.danceMoveNow === move))) return;
    if (on && (!AREA_RULES[this.areaId].dance || player.isSeated)) {
      const store = useGameStore.getState();
      store.setDancing(false);
      store.setNotice('no_dance');
      return;
    }
    player.setDancing(on, move);
    this.connection?.dance(on, move);
  }

  private drawMap(player: Avatar): void {
    const people: MapPerson[] = [{ x: player.position.x, z: player.position.z, kind: 'me' }];
    for (const [id, other] of this.others) {
      people.push({
        x: other.position.x,
        z: other.position.z,
        kind: this.isFriend(id) ? 'friend' : 'other',
      });
    }
    minimap.draw(people);
  }

  private isFriend(id: string): boolean {
    return useGameStore.getState().friends.some((f) => f.id === id && f.state === 'friend');
  }

  private markFriends(): void {
    for (const [id, other] of this.others) other.setFriend(this.isFriend(id));
  }

  private personAt(tile: Point): string | null {
    for (const [id, other] of this.others) if (sameTile(other.tile, tile)) return id;
    return null;
  }

  /** Opens someone's card, with what they are up to shown over their head. */
  /** The ring of things to do with someone, around their chest on screen. */
  private openPersonRing(id: string): void {
    const other = this.others.get(id);
    if (!other) return;
    const box = other.bodyBox;
    const at = this.view.project(box.x, box.bottom + (box.top - box.bottom) * 0.55, box.z);
    useGameStore.getState().setRadial({
      x: at.x,
      y: at.y,
      mode: 'person',
      id,
      name: other.name,
      lines: other.statusLines,
    });
  }

  private select(id: string): void {
    const other = this.others.get(id);
    if (!other) return;
    other.toggleDetails();
    useGameStore.getState().setSelected({ id, name: other.name, lines: other.statusLines });
  }

  /**
   * Keeps a crowd readable: status lines fold into icons when name tags overlap or
   * many people are on screen, and speech bubbles step up out of each other's way.
   */
  private arrangeCrowd(delta: number): void {
    this.crowdTimer -= delta;
    if (this.crowdTimer > 0 || !this.player) return;
    this.crowdTimer = CROWD_CHECK_SECONDS;
    this.seatMarkers?.update(
      !this.player.isSeated,
      [...this.others.values()].map((o) => o.tile),
    );
    const everyone = [this.player, ...this.others.values()];
    const seated = everyone.filter((a) => a.seatKind === 'chair').length;
    useGameStore.getState().setStudying(seated);
    this.shareBlocks();
    this.spreadOut(everyone);
    this.mergeTags();
    // The player first, so their own bubble keeps its place.
    const avatars = [this.player, ...this.others.values()];
    const screen = this.view.canvas.getBoundingClientRect();
    const names = avatars.map((avatar) => ({ avatar, rect: avatar.nameRect() }));
    const onScreen = names.filter(
      ({ rect: r }) =>
        r.right > screen.left &&
        r.left < screen.right &&
        r.bottom > screen.top &&
        r.top < screen.bottom,
    ).length;
    const centerX = (r: DOMRect) => r.left + r.width / 2;
    for (const { avatar, rect } of names) {
      const near = names.some(
        (other) =>
          other.avatar !== avatar &&
          Math.abs(centerX(other.rect) - centerX(rect)) < NEAR_X &&
          Math.abs(other.rect.top - rect.top) < NEAR_Y,
      );
      avatar.setCrowded(near || onScreen > CROWD_SIZE);
    }

    const placed: DOMRect[] = [];
    for (const avatar of avatars) {
      const rect = avatar.bubbleFolded ? null : avatar.bubbleRect();
      if (!rect) continue;
      let shift = 0;
      for (let moved = true; moved && shift <= MAX_BUBBLE_SHIFT;) {
        moved = false;
        for (const other of placed) {
          const top = rect.top - shift;
          const bottom = rect.bottom - shift;
          const overlaps =
            rect.left < other.right &&
            rect.right > other.left &&
            top < other.bottom + BUBBLE_GAP &&
            bottom > other.top - BUBBLE_GAP;
          if (overlaps) {
            shift = rect.bottom - other.top + BUBBLE_GAP;
            moved = true;
          }
        }
      }
      const folded = shift > MAX_BUBBLE_SHIFT;
      avatar.placeBubble(folded ? 0 : shift, folded);
      if (!folded) placed.push(new DOMRect(rect.x, rect.y - shift, rect.width, rect.height));
    }
  }

  /**
   * Tells the study ring whose focus blocks in this room could be joined:
   * people with more than a minute left, so joining is worth it.
   */
  private shareBlocks(): void {
    const now = Date.now();
    const blocks: RunningBlock[] = [];
    for (const [id, other] of this.others) {
      const timer = other.runningTimer;
      if (timer && timer.endsAt - now > 60_000) {
        blocks.push({ id, name: other.name, endsAt: timer.endsAt, totalMs: timer.totalMs });
      }
    }
    const store = useGameStore.getState();
    const key = (list: readonly RunningBlock[]) => list.map((b) => `${b.id}:${b.endsAt}`).join();
    if (key(blocks) !== key(store.blocksHere)) store.setBlocksHere(blocks);
  }

  /**
   * People standing on the same tile step apart into a small ring, so twenty
   * people in the smoking room stand together instead of inside each other.
   */
  private spreadOut(avatars: readonly Avatar[]): void {
    const byTile = new Map<string, Avatar[]>();
    for (const avatar of avatars) {
      if (avatar.isMoving || avatar.isSeated) {
        avatar.setSpread(0, 0);
        continue;
      }
      const key = `${avatar.tile.x},${avatar.tile.y}`;
      byTile.set(key, [...(byTile.get(key) ?? []), avatar]);
    }
    for (const group of byTile.values()) {
      if (group.length === 1) {
        group[0]?.setSpread(0, 0);
        continue;
      }
      // A steady order, so nobody swaps places every check.
      group.sort((a, b) => a.name.localeCompare(b.name));
      const radius = Math.min(SPREAD_RADIUS, 0.14 + 0.04 * group.length);
      group.forEach((avatar, i) => {
        // Start along the screen's left-right line, so two people stand side by side.
        const angle = (i / group.length) * Math.PI * 2 - Math.PI / 4;
        avatar.setSpread(Math.cos(angle) * radius, Math.sin(angle) * radius);
      });
    }
  }

  /**
   * Shows what a click would do: a cursor of its own, a tip beside the mouse,
   * the person lit up or the tile marked, and the ring of actions when the
   * mouse comes to rest on the player.
   */
  private updateHover(): void {
    const at = this.pointer;
    const store = useGameStore.getState();
    const target = at && !store.confirm ? this.targetAt(at.x, at.y) : null;

    const person = target?.kind === 'person' ? this.others.get(target.id) : undefined;
    if (person !== this.highlighted) {
      this.highlighted?.setHighlight(false);
      person?.setHighlight(true);
      this.highlighted = person ?? null;
    }

    const overSelf = target?.kind === 'self';
    if (overSelf && !this.overSelf && !store.radial && this.player && !this.player.isMoving) {
      const point = this.selfScreenPoint();
      if (point) store.setRadial(point);
    }
    this.overSelf = overSelf;

    const tile = target?.kind === 'tile' ? target.tile : null;
    const kind = tile ? this.hoverKind(tile) : null;
    this.hover.show(tile && kind ? { x: tile.x + 0.5, y: FLOOR_Y, z: tile.y + 0.5 } : null, kind);
    const cursor = target ? this.targetCursor(target) : null;
    this.view.canvas.style.cursor = cursor ? cursorFor(cursor) : kind ? 'pointer' : '';

    const label = target && at ? this.hoverLabel(target) : null;
    this.tip.hidden = !label;
    if (label && at) {
      if (this.tip.textContent !== label) this.tip.textContent = label;
      this.tip.style.translate = `${at.x + 18}px ${at.y + 20}px`;
    }
  }

  private targetCursor(target: Target): CursorKind | null {
    switch (target.kind) {
      case 'self':
        return 'self';
      case 'person':
      case 'pet':
        return 'talk';
      case 'examine':
        return 'look';
      case 'tile':
        return this.cursorKind(target.tile);
    }
  }

  /** The cursor for a tile that does more than walking; null for plain floor. */
  private cursorKind(tile: Point): CursorKind | null {
    if (this.grid.doorTarget(tile)) return 'door';
    const block = this.grid.blockReason(tile);
    if (block === 'elevator') return 'door';
    if (block === 'renovation') return 'closed';
    const c = this.grid.tileAt(tile);
    if (c === TILE.noticeBoard || c === TILE.receptionDesk) return 'read';
    if (this.grid.isSeat(tile)) {
      if (this.seatTaken(tile)) return 'closed';
      return this.player && sameTile(this.player.tile, tile) && this.player.isSeated ? null : 'sit';
    }
    return null;
  }

  /** What clicking does, in a few words; nothing for plain floor. */
  private hoverLabel(target: Target): string | null {
    switch (target.kind) {
      case 'self':
        return t('tip.self');
      case 'person':
        return t('tip.person', { name: this.others.get(target.id)?.name ?? '' });
      case 'pet':
        return t('tip.pet');
      case 'examine': {
        const { examinable } = target;
        if (examinable.kind === 'shelf') {
          return t('tip.shelf', { topic: SHELF_TOPICS[examinable.index]?.name ?? '' });
        }
        if (examinable.kind === 'flaw') return t('tip.flaw');
        if (examinable.kind === 'topic') return t('tip.topic');
        if (examinable.kind === 'table')
          return t(examinable.index === 0 ? 'tip.darts' : 'tip.gameTable');
        if (examinable.kind === 'jukebox') return t('tip.jukebox');
        if (examinable.kind === 'lost') return t('tip.lost');
        if (examinable.kind === 'lamp') {
          return t(this.lampOn(examinable.index) ? 'tip.lamp.off' : 'tip.lamp.on');
        }
        if (examinable.kind === 'game')
          return t(`tip.game.${MACHINES[examinable.index] ?? 'arcade'}`);
        return t(examinable.kind === 'painting' ? 'tip.painting' : 'tip.peek');
      }
      case 'tile':
        break;
    }
    const { tile } = target;
    const to = this.grid.doorTarget(tile);
    if (to) return t('tip.door', { area: t(`area.${to}`) });
    const block = this.grid.blockReason(tile);
    if (block === 'renovation') return t('tip.renovation');
    if (block === 'elevator') return t('tip.elevator');
    const c = this.grid.tileAt(tile);
    if (c === TILE.noticeBoard) return t('tip.board');
    if (c === TILE.receptionDesk)
      return t(this.areaId === 'hall' ? 'tip.reception' : 'tip.librarian');
    const seat = this.grid.seatAt(tile);
    if (seat) {
      if (this.seatTaken(tile)) return t('tip.taken');
      if (this.player && sameTile(this.player.tile, tile) && this.player.isSeated) return null;
      return t(seat.kind === 'chair' ? 'tip.seat' : 'tip.sofa');
    }
    return null;
  }

  private hoverKind(tile: Point): HoverKind | null {
    if (this.cursorKind(tile) && this.cursorKind(tile) !== 'closed') return 'special';
    return this.grid.isWalkable(tile) ? 'floor' : null;
  }

  /** The notice board opens when the player stops next to it and closes when they walk on. */
  private updateBoard(player: Avatar): void {
    const near = !player.isMoving && this.boards.some((b) => reach(b, player.tile) <= 1);
    if (near === this.nearBoard) return;
    this.nearBoard = near;
    useGameStore.getState().setBoardOpen(near);
  }

  /**
   * Runs `go` now, or first asks when it would leave the table with a timer running:
   * a short break keeps the timer, finishing ends it, and staying does nothing.
   */
  private leaveSeat(player: Avatar, go: () => void): void {
    const store = useGameStore.getState();
    if (!player.isSeated || !this.timerRunning()) return go();
    this.heldKeys.clear();
    store.ask({
      kind: 'stand',
      answer: (choice) => this.answer(choice, go),
    });
  }

  private answer(choice: ConfirmChoice, go: () => void, stay?: () => void): void {
    const store = useGameStore.getState();
    store.ask(null);
    if (choice === 'stay') return stay?.();
    if (choice === 'end') store.stopTimer();
    go();
  }

  private timerRunning(): boolean {
    const timer = useGameStore.getState().timer;
    return timer !== null && timer.endsAt > Date.now();
  }

  /** The tapped tile, or the door or elevator drawn there when the tap misses the floor. */
  private pickTile(clientX: number, clientY: number): Point | null {
    const floor = this.view.pickTile(clientX, clientY);
    if (!floor || this.grid.isWalkable(floor)) return floor;
    for (const height of DOOR_PICK_HEIGHTS) {
      const tile = this.view.pickTileAt(clientX, clientY, height);
      if (tile && (this.grid.doorTarget(tile) || this.grid.blockReason(tile) === 'elevator')) {
        return tile;
      }
    }
    return floor;
  }

  /**
   * Keys steer the body freely in the direction they point on screen; letting
   * go brakes onto the nearest tile. Taps walk a route instead.
   */
  private handleKeyboard(player: Avatar): void {
    let right = 0;
    let down = 0;
    const { typing, stick } = useGameStore.getState();
    if (!typing) {
      for (const code of this.heldKeys) {
        const [r, d] = KEY_DIRECTIONS[code] ?? [0, 0];
        right += r;
        down += d;
      }
    }
    // Keys point in eight ways; the on-screen joystick in any.
    const direction =
      right || down
        ? screenToFloor(Math.sign(right), Math.sign(down))
        : stick
          ? screenToFloor(stick.x, stick.y)
          : null;
    if (!direction) {
      if (!this.steerDirection) return;
      this.steerDirection = null;
      this.steerSent = null;
      const rest = player.steer(null);
      if (rest) this.connection?.move(rest);
      return;
    }
    const ahead = {
      x: Math.floor(player.floorPosition.x + direction.x * 0.75),
      y: Math.floor(player.floorPosition.y + direction.y * 0.75),
    };
    const reason = this.grid.blockReason(ahead);
    if (reason) this.explainBlock(reason);
    this.pending = null;
    if (this.steerDirection) {
      this.steerDirection = direction;
      player.steer(direction);
      return;
    }
    this.leaveSeat(player, () => {
      this.steerDirection = direction;
      player.steer(direction);
    });
  }

  /**
   * While steering, tells the server the tile just ahead rather than the one
   * underfoot, so everyone else sees a steady walk instead of a stop at every tile.
   */
  private sendSteering(player: Avatar, direction: FloorPoint): void {
    const { x, y } = player.floorPosition;
    const ahead = { x: Math.floor(x + direction.x * 0.9), y: Math.floor(y + direction.y * 0.9) };
    const target = this.grid.isWalkable(ahead) ? ahead : player.tile;
    if (this.steerSent && sameTile(this.steerSent, target)) return;
    this.steerSent = target;
    this.connection?.move(target);
  }

  /** A straight-lined route from where an avatar is to a tile, or null when it cannot get there. */
  private routeFor(avatar: Avatar, goal: Point): FloorPoint[] | null {
    const path = findPath(this.grid, avatar.tile, goal);
    if (!path) return null;
    // Already on the tile: just finish onto its middle.
    if (path.length === 0) return [{ x: goal.x + 0.5, y: goal.y + 0.5 }];
    return smoothPath(this.grid, avatar.floorPosition, path);
  }

  private walkTo(tile: Point): void {
    const player = this.player;
    if (!player || this.leaving) return;
    const reason = this.grid.blockReason(tile);
    if (reason && BLOCK_MESSAGES[reason]) {
      this.explainBlock(reason);
      return;
    }
    this.pending = null;
    const goal = resolveWalkTarget(this.grid, player.tile, tile);
    if (goal && this.seatTaken(goal)) {
      useGameStore.getState().setNotice('seat_taken');
      return;
    }
    const route = goal && this.routeFor(player, goal);
    if (!goal || !route || (sameTile(goal, player.tile) && !player.isMoving)) return;
    this.leaveSeat(player, () => {
      this.steerDirection = null;
      this.steerSent = null;
      player.follow(route);
      this.connection?.move(goal);
    });
  }

  private explainBlock(reason: BlockReason): void {
    const key = BLOCK_MESSAGES[reason];
    const now = performance.now();
    if (!key || now - this.lastBlockMessageAt < BLOCK_MESSAGE_COOLDOWN_MS) return;
    this.lastBlockMessageAt = now;
    this.player?.say(t(key));
  }

  /**
   * Crowds: people off the screen are not drawn, and people far from the
   * player lose their shadow and name tag (friends keep the tag). Hovered,
   * selected or merged people are handled by their own tags as before.
   */
  private updateDetail(player: Avatar): void {
    const crowd = this.others.size >= DETAIL_CROWD;
    for (const other of this.others.values()) {
      if (!crowd) {
        other.setDetail('full');
        continue;
      }
      const { x, z } = other.position;
      const p = this.projected.set(x, 1, z).project(this.view.camera);
      const off = Math.abs(p.x) > OFF_SCREEN || Math.abs(p.y) > OFF_SCREEN;
      const far =
        Math.hypot(x - player.position.x, z - player.position.z) > FAR_TILES && !other.isFriend;
      other.setDetail(off ? 'off' : far ? 'far' : 'full');
    }
  }

  /**
   * A soft ring on the floor under the person meant: the one pointed at in a
   * crowd's chooser, or whose ring of actions is open.
   */
  private updateRing(delta: number): void {
    const { ringFor, radial } = useGameStore.getState();
    const id =
      radial?.mode === 'pick' ? ringFor : radial?.mode === 'person' ? (radial.id ?? null) : null;
    const someone = id ? this.others.get(id) : undefined;
    this.ring.visible = !!someone && this.others.size > 1;
    if (!someone || !this.ring.visible) return;
    this.ringClock += delta;
    this.ring.position.set(someone.position.x, someone.root.position.y + 0.04, someone.position.z);
    (this.ring.material as MeshBasicMaterial).opacity = 0.65 + Math.sin(this.ringClock * 5) * 0.25;
  }

  /** Whoever stands at the conference hall's microphone shows a 🎤 by their name. */
  private updateMicrophone(player: Avatar): void {
    const mic = this.built?.stage?.microphone;
    if (!mic) return;
    for (const body of [player, ...this.others.values()]) {
      const { x, y } = body.tile;
      const near = Math.max(Math.abs(x - mic.x), Math.abs(y - mic.y)) <= 1;
      body.setSpeaking(near && !body.isMoving && this.grid.isStage(body.tile));
    }
  }

  /**
   * Whether the player may go into the conference hall now: around an event
   * held there, or always for admins and on a local server. The server checks again.
   */
  private conferenceOpen(): boolean {
    const store = useGameStore.getState();
    const open = import.meta.env.DEV || store.role === 'admin';
    return conferenceRole(store.session?.id ?? '', store.proposed, Date.now(), { open }) !== null;
  }

  private checkDoor(tile: Point): void {
    const to = this.grid.doorTarget(tile);
    if (!to) return;
    if (to === 'conference' && !this.conferenceOpen()) {
      this.player?.halt();
      useGameStore.getState().setNotice('conference_closed');
      this.stepBackFrom(tile);
      return;
    }
    // A study timer belongs to the library, so leaving it asks first.
    if (this.areaId === 'library' && this.timerRunning()) {
      this.heldKeys.clear();
      this.steerDirection = null;
      this.steerSent = null;
      this.player?.halt();
      useGameStore.getState().ask({
        kind: 'leave',
        answer: (choice) =>
          this.answer(
            choice,
            () => this.goThrough(to),
            () => this.stepBackFrom(tile),
          ),
      });
      return;
    }
    this.goThrough(to);
  }

  private stepBackFrom(door: Point): void {
    const back = this.grid.neighbors(door).find((n) => !this.grid.doorTarget(n));
    if (!back || !this.player) return;
    this.player.follow([{ x: back.x + 0.5, y: back.y + 0.5 }]);
    this.connection?.move(back);
  }

  private goThrough(to: AreaId, from: AreaId = this.areaId): void {
    this.leaving = true;
    useGameStore.getState().setLoading(true);
    this.fader.classList.add('world-fader--dark');
    window.setTimeout(() => this.enter(to, from), FADE_MS);
  }

  /**
   * Goes to another public room straight from the phone, as if walking there:
   * between the library and the smoking room that is through the hall, so the
   * player comes in at the door from the hall.
   */
  /** Off to the reception desk to open a room (from anywhere: through the hall). */
  private walkToDesk(): void {
    if (this.areaId !== 'hall') {
      useGameStore.getState().setTravel('hall');
      return;
    }
    let desk: Point | null = null;
    this.grid.area.layout.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (!desk && c === TILE.receptionDesk) desk = { x, y };
      }),
    );
    if (desk) this.goTo(desk, { kind: 'desk', tile: desk });
  }

  /**
   * Up to a private room. In the hall, with the key from the reception, the
   * player first walks over to the elevator; from anywhere else (an invite,
   * a link) the elevator is not in sight, so up they go at once.
   */
  private rideUp(to: AreaId): void {
    const player = this.player;
    const front = this.areaId === 'hall' ? this.grid.arrivalPoint('room3') : null;
    if (!player || !front || sameTile(player.tile, front)) {
      this.goThrough(to);
      return;
    }
    this.leaveSeat(player, () => this.goTo(front, { kind: 'ride', to }));
  }

  private travel(to: AreaId): void {
    const store = useGameStore.getState();
    store.setTravel(null);
    const player = this.player;
    if (!player || this.leaving || to === this.areaId || isRoomArea(to)) return;
    if (to === 'conference' && !this.conferenceOpen()) {
      store.setNotice('conference_closed');
      return;
    }
    const from = this.areaId === 'hall' || to === 'hall' ? this.areaId : 'hall';
    this.leaveSeat(player, () => this.goThrough(to, from));
  }
}

/** The ring under a person picked out of a crowd. */
function createPersonRing(): Mesh {
  const ring = new Mesh(
    new RingGeometry(0.3, 0.4, 40),
    new MeshBasicMaterial({ color: 0xffd36b, transparent: true, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 3;
  ring.visible = false;
  return ring;
}
