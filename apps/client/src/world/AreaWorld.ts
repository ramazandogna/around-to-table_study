import {
  AREA_RULES,
  EVENT_THEMES,
  isRoomArea,
  roomArea,
  TILE,
  eventNow,
  createAreaGrid,
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
import { TOPICS } from '../content/topics';
import { t, type MessageKey } from '../i18n/t';
import { AreaConnection } from '../net/AreaConnection';
import { mayRing } from '../net/social';
import { studyStatus, useGameStore, type ConfirmChoice, type RunningBlock } from '../state/store';
import { Avatar, type AvatarContext, type FloorPoint } from './Avatar';
import { buildArea, CHAIR_INSET, FLOOR_Y, type BuiltArea, type Examinable } from './buildArea';
import type { CharacterKit } from './characters';
import { MACHINES, type ArcadeKit } from './arcade';
import { cursorFor, type CursorKind } from './cursors';
import { buildEventDecor, type EventDecor } from './eventDecor';
import { Librarian } from './Librarian';
import { Pet, type PetContext } from './Pet';
import type { PetDress, PetKit } from './pets';
import type { IsoView } from './IsoView';
import { minimap, type MapPerson } from './minimap';
import type { Furniture } from './models';
import { createTableProps } from './tableProps';
import { createHoverMarker, type HoverKind } from './hoverMarker';
import { createSeatMarkers } from './seatMarkers';

const BLOCK_MESSAGES: Partial<Record<BlockReason, MessageKey>> = {
  renovation: 'blocked.renovation',
  elevator: 'blocked.elevator',
};
const BLOCK_MESSAGE_COOLDOWN_MS = 2500;
const CAMERA_LERP = 0.12;
/** Heights checked when a tap misses the floor, up to the top of the tallest door. */
const DOOR_PICK_HEIGHTS = [0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.1];
const FADE_MS = 220;
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

/** Something to do once the player has walked over to it. */
type Pending =
  | { kind: 'person'; id: string }
  | { kind: 'examine'; examinable: Examinable }
  | { kind: 'desk'; tile: Point }
  /** The elevator up to the private rooms. */
  | { kind: 'elevator' };

/** What the mouse is over: a person, something to look at, or a tile. */
type Target =
  | { kind: 'self' }
  | { kind: 'person'; id: string }
  | { kind: 'examine'; examinable: Examinable }
  | { kind: 'tile'; tile: Point };

/** Runs one area at a time: builds the room, moves avatars and talks to the server. */
export class AreaWorld {
  private areaId: AreaId = 'hall';
  private grid!: AreaGrid;
  private built: BuiltArea | null = null;
  private player: Avatar | null = null;
  private readonly others = new Map<string, Avatar>();
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
  private librarian: Librarian | null = null;
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
        this.goThrough(roomArea(state.room.room.size));
      }
      if (state.friends !== before.friends) this.markFriends();
      if (state.dancing !== before.dancing) this.dance(state.dancing);
      if (state.lines !== before.lines) {
        this.player?.setLines(state.lines);
        this.connection?.setLines(state.lines);
      }
      if (
        state.activity === before.activity &&
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
    view.canvas.addEventListener('pointermove', this.onPointerMove);
    view.canvas.addEventListener('pointerleave', this.onPointerLeave);
    view.add(this.hover.mesh);
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
    if (pet && AREA_RULES[area].pets) {
      const own = this.walkPet('self', this.player, look);
      const door = from === 'library' ? this.doorSpots()[0] : undefined;
      if (own && door) own.wait(door.spot, door.facing);
      own?.follow();
    } else if (pet) {
      useGameStore.getState().setNotice('pet_waits');
      play('mew');
    }
    this.librarian = Librarian.create(this.assets.characters, this.grid, this.context);
    if (this.librarian) this.view.add(this.librarian.avatar.root);
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
    this.view.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.view.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.view.remove(this.hover.mesh);
    this.hover.dispose();
    this.tip.remove();
    this.view.canvas.style.cursor = '';
    this.view.setLoop(null);
  }

  /** Builds (or rebuilds, when the room grows) the room around the people in it. */
  private buildRoom(opened: number): void {
    this.removeRoom();
    this.grid = createAreaGrid(this.areaId, opened);
    this.built = buildArea(this.grid, this.assets.furniture, this.assets.arcade);
    this.view.add(this.built.root);
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
    for (const pet of [...this.pets.values(), ...this.waiting.values()]) pet.dispose();
    this.pets.clear();
    this.waiting.clear();
    this.librarian?.dispose();
    this.librarian = null;
    this.decor?.dispose();
    this.decor = null;
    this.eventId = null;
    this.eventTimer = 0;
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
    if (store.radial && player.isMoving) store.setRadial(null);
    // Walking off puts the book back.
    if (store.discovery && player.isMoving) store.setDiscovery(null);
    // A board opened at the librarian's desk closes again once the player walks on.
    if (store.boardOpen && player.isMoving && !this.nearBoard) store.setBoardOpen(false);
    if (this.pending && !player.isMoving) this.arrive(player, this.pending);
    this.updateBoard(player);
    this.updateHover();
    for (const other of this.others.values()) other.update(delta);
    this.librarian?.update(delta);
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
        for (const id of this.others.keys()) this.walkPet(id, null, null);
        for (const other of this.others.values()) other.dispose();
        this.others.clear();
        this.regrow(message.opened, false);
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
        this.addOther(message.player);
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
        // Standing up clears the table, as on the server.
        other.clearActivity();
        break;
      }
      case 'grew':
        this.regrow(message.opened, true);
        break;
      case 'danced':
        if (message.id !== selfId) this.others.get(message.id)?.setDancing(message.on);
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
        // "Do not disturb" hides everyone else's chatter, in the room and in the chat panel.
        if (!mine && store.dnd) break;
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
        if (store.dnd) break;
        store.setInvite({ from: nameOf(message.from), code: message.code, name: message.name });
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
        if (message.to === selfId) {
          store.setNotice('poked', nameOf(message.from));
          if (mayRing()) play('poke');
        }
        break;
      }
      case 'error':
        // A known wait shows on the send button; anything else gets a short notice.
        if (message.code === 'rate_limited' && message.retryInMs) {
          store.setCooldown(this.areaId, Date.now() + message.retryInMs);
        } else if (message.code === 'seat_taken') {
          this.stepOffSeat();
          store.setNotice('seat_taken');
        } else if (message.code !== 'bad_message' && message.code !== 'blocked') {
          store.setNotice(message.code);
        }
        break;
    }
    useGameStore.getState().setPlayersHere(this.others.size + 1);
  }

  private addOther(player: PlayerSnapshot): void {
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
    avatar.setDancing(player.dancing);
    avatar.onTap = () => this.approach(player.id);
    this.others.set(player.id, avatar);
    this.view.add(avatar.root);
    this.walkPet(player.id, avatar, player.look);
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
    const live = eventNow(this.areaId, Date.now());
    const id = live?.event.id ?? null;
    if (id !== this.eventId) {
      this.eventId = id;
      this.decor?.dispose();
      this.decor = null;
      if (live) {
        const title = t(`event.${live.event.id}.title` as MessageKey);
        this.decor = buildEventDecor(this.grid, EVENT_THEMES[live.event.theme], title);
        this.view.add(this.decor.root);
      }
    }
    if (live && useGameStore.getState().musicOn) playMusic(EVENT_THEMES[live.event.theme].music);
    else stopMusic();
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
    if (!owner || !kind || !AREA_RULES[this.areaId].pets) return null;
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
    const { typing, wardrobeOpen, statusOpen, confirm } = useGameStore.getState();
    if (typing || wardrobeOpen || statusOpen || confirm || !(event.code in KEY_DIRECTIONS)) return;
    event.preventDefault();
    this.heldKeys.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.heldKeys.delete(event.code);
  };

  private readonly onBlur = () => this.heldKeys.clear();

  private readonly onPointerDown = (event: PointerEvent) => {
    unlockAudio();
    const store = useGameStore.getState();
    if (this.view.isPinching || store.confirm) return;
    if (store.radial) store.setRadial(null);
    const target = this.targetAt(event.clientX, event.clientY);
    if (!target) return;
    switch (target.kind) {
      case 'self': {
        // Tapping yourself opens the ring of things you can do.
        const at = this.selfScreenPoint();
        if (at) store.setRadial(at);
        return;
      }
      case 'person':
        // Tapping someone walks over to them and opens what you can do together.
        this.ripple(event, 'talk');
        this.approach(target.id);
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

  /** Walks over next to someone, then opens what you can do with them. */
  private approach(id: string): void {
    const other = this.others.get(id);
    const player = this.player;
    if (!other || !player) return;
    if (reach(player.tile, other.tile) <= 1 && !player.isMoving) {
      this.arrive(player, { kind: 'person', id });
      return;
    }
    const spots = [-1, 0, 1]
      .flatMap((dx) => [-1, 0, 1].map((dy) => ({ x: other.tile.x + dx, y: other.tile.y + dy })))
      .filter(
        (p) =>
          !sameTile(p, other.tile) &&
          this.grid.isWalkable(p) &&
          !this.grid.isSeat(p) &&
          !this.personAt(p),
      )
      .sort((a, b) => reach(a, player.tile) - reach(b, player.tile));
    const spot = spots[0];
    if (!spot) {
      this.select(id);
      return;
    }
    this.goTo(spot, { kind: 'person', id });
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
        if (this.areaId === 'hall') store.openRooms();
        else store.setBoardOpen(true);
        return;
      case 'elevator':
        store.openRooms();
        return;
    }
  }

  /** Starts or stops dancing, where the room allows it. */
  private dance(on: boolean): void {
    const player = this.player;
    if (!player || player.isDancing === on) return;
    if (on && (!AREA_RULES[this.areaId].dance || player.isSeated)) {
      const store = useGameStore.getState();
      store.setDancing(false);
      store.setNotice('no_dance');
      return;
    }
    player.setDancing(on);
    this.connection?.dance(on);
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
      case 'examine': {
        const { examinable } = target;
        if (examinable.kind === 'shelf') {
          return t('tip.shelf', { topic: SHELF_TOPICS[examinable.index]?.name ?? '' });
        }
        if (examinable.kind === 'flaw') return t('tip.flaw');
        if (examinable.kind === 'topic') return t('tip.topic');
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
    if (!useGameStore.getState().typing) {
      for (const code of this.heldKeys) {
        const [r, d] = KEY_DIRECTIONS[code] ?? [0, 0];
        right += r;
        down += d;
      }
    }
    const direction = screenToFloor(Math.sign(right), Math.sign(down));
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

  private checkDoor(tile: Point): void {
    const to = this.grid.doorTarget(tile);
    if (!to) return;
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

  private goThrough(to: AreaId): void {
    this.leaving = true;
    this.fader.classList.add('world-fader--dark');
    const from = this.areaId;
    window.setTimeout(() => this.enter(to, from), FADE_MS);
  }
}
