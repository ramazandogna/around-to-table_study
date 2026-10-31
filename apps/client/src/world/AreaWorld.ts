import {
  AREA_RULES,
  TILE,
  createAreaGrid,
  findPath,
  resolveWalkTarget,
  smoothPath,
  type AreaGrid,
  type AreaId,
  type BlockReason,
  type PlayerSnapshot,
  type Point,
  type ServerMessage,
} from '@att/shared';
import { t, type MessageKey } from '../i18n/t';
import { AreaConnection } from '../net/AreaConnection';
import { studyStatus, useGameStore, type ConfirmChoice } from '../state/store';
import { Avatar, type AvatarContext, type FloorPoint } from './Avatar';
import { buildArea, FLOOR_Y, type BuiltArea } from './buildArea';
import type { CharacterKit } from './characters';
import type { IsoView } from './IsoView';
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
/** Tiles apart, counting diagonal steps as one. */
const reach = (a: Point, b: Point) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

type Assets = { furniture: Furniture; characters: CharacterKit };

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
  private readonly context: AvatarContext;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly view: IsoView,
    private readonly assets: Assets,
    private readonly fader: HTMLElement,
  ) {
    this.context = {
      seats: (tile) => this.grid.seatFacing(tile),
      props: createTableProps(assets.furniture),
      walkable: (tile) => this.grid.isWalkable(tile),
    };
    // The player's own look and status live in the store; the world shows them and the server shares them.
    this.unsubscribe = useGameStore.subscribe((state, before) => {
      if (state.look && state.look !== before.look) {
        this.player?.setLook(state.look);
        this.connection?.changeLook(state.look);
      }
      if (state.friends !== before.friends) this.markFriends();
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

    this.areaId = area;
    this.grid = createAreaGrid(area);
    this.built = buildArea(this.grid, this.assets.furniture);
    this.view.add(this.built.root);
    this.view.setBounds(this.grid.width, this.grid.height);
    this.boards = [];
    this.grid.area.layout.forEach((row, y) =>
      [...row].forEach((c, x) => c === TILE.noticeBoard && this.boards.push({ x, y })),
    );
    this.nearBoard = false;
    const seats: Point[] = [];
    this.grid.area.layout.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c === TILE.seat && this.grid.isWalkable({ x, y })) seats.push({ x, y });
      }),
    );
    this.seatMarkers = createSeatMarkers(seats, FLOOR_Y);
    this.view.add(this.seatMarkers.root);

    const look = useGameStore.getState().look;
    if (!look) throw new Error('AreaWorld needs a character look');
    const start = from ? this.grid.arrivalPoint(from) : this.grid.area.spawn;
    this.player = new Avatar(this.assets.characters, look, start, session.name, true, this.context);
    this.player.setStatus(studyStatus());
    this.player.setLines(useGameStore.getState().lines);
    this.player.onTap = () => this.player?.toggleDetails();
    this.view.add(this.player.root);
    this.view.follow(start.x + 0.5, start.y + 0.5, 1);

    const store = useGameStore.getState();
    store.setArea(area);
    store.setPlayersHere(1);
    this.connection = new AreaConnection({
      area,
      from,
      token: session.token,
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

  private teardown(): void {
    this.connection?.close();
    this.connection = null;
    useGameStore.getState().setConnection(null);
    for (const other of this.others.values()) other.dispose();
    this.others.clear();
    this.player?.dispose();
    this.player = null;
    const store = useGameStore.getState();
    store.setSeated(false);
    store.ask(null);
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

  private update(delta: number): void {
    const player = this.player;
    if (!player || this.leaving) return;
    this.handleKeyboard(player);

    const entered = player.update(delta);
    if (this.steerDirection) this.sendSteering(player, this.steerDirection);
    if (entered) this.checkDoor(entered);
    if (player.isSeated !== useGameStore.getState().seated) {
      useGameStore.getState().setSeated(player.isSeated);
    }
    this.updateBoard(player);
    this.updateHover();
    for (const other of this.others.values()) other.update(delta);
    this.arrangeCrowd(delta);
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
        for (const other of this.others.values()) other.dispose();
        this.others.clear();
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
      case 'status':
        if (message.id !== selfId) this.others.get(message.id)?.setStatus(message.status);
        break;
      case 'lined':
        if (message.id !== selfId) this.others.get(message.id)?.setLines(message.lines);
        break;
      case 'emoted':
        (message.id === selfId ? this.player : this.others.get(message.id))?.emote(
          message.emote,
          !AREA_RULES[this.areaId].effectsVisible,
        );
        break;
      case 'looked':
        this.others.get(message.id)?.setLook(message.look);
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
        });
        if (message.from !== selfId) store.setChatOpen(true);
        break;
      case 'poked':
        // Only the poked person sees the nudge, over whoever sent it.
        this.others.get(message.from)?.say('👉');
        store.setNotice('poked', nameOf(message.from));
        break;
      case 'error':
        // A known wait shows on the send button; anything else gets a short notice.
        if (message.code === 'rate_limited' && message.retryInMs) {
          store.setCooldown(this.areaId, Date.now() + message.retryInMs);
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
    avatar.onTap = () => this.select(player.id);
    this.others.set(player.id, avatar);
    this.view.add(avatar.root);
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
    if (this.view.isPinching || useGameStore.getState().confirm) return;
    const tile = this.pickTile(event.clientX, event.clientY);
    if (!tile) return;
    // Tapping someone opens their card instead of walking onto them.
    const someone = this.personAt(tile);
    if (someone) this.select(someone);
    else this.walkTo(tile);
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    this.pointer = event.pointerType === 'mouse' ? { x: event.clientX, y: event.clientY } : null;
  };

  private readonly onPointerLeave = () => {
    this.pointer = null;
  };

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
    const seated = [this.player, ...this.others.values()].filter((a) => a.isSeated).length;
    useGameStore.getState().setStudying(seated);
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

  /** Lights up the tile under the mouse when tapping it would do something. */
  private updateHover(): void {
    const at = this.pointer;
    const tile = at && !useGameStore.getState().confirm ? this.pickTile(at.x, at.y) : null;
    const kind = tile ? this.hoverKind(tile) : null;
    this.hover.show(tile && kind ? { x: tile.x + 0.5, y: FLOOR_Y, z: tile.y + 0.5 } : null, kind);
    this.view.canvas.style.cursor = kind ? 'pointer' : '';
    const label = tile && at ? this.hoverLabel(tile) : null;
    this.tip.hidden = !label;
    if (label && at) {
      if (this.tip.textContent !== label) this.tip.textContent = label;
      this.tip.style.translate = `${at.x + 16}px ${at.y + 18}px`;
    }
  }

  /** What tapping this tile does, in a few words; nothing for plain floor. */
  private hoverLabel(tile: Point): string | null {
    const person = this.personAt(tile);
    if (person) return t('tip.person', { name: this.others.get(person)?.name ?? '' });
    const to = this.grid.doorTarget(tile);
    if (to) return t('tip.door', { area: t(`area.${to}`) });
    const block = this.grid.blockReason(tile);
    if (block === 'renovation') return t('tip.renovation');
    if (block === 'elevator') return t('tip.elevator');
    if (this.grid.tileAt(tile) === TILE.noticeBoard) return t('tip.board');
    if (this.grid.seatFacing(tile)) {
      return this.player && sameTile(this.player.tile, tile) && this.player.isSeated
        ? null
        : t('tip.seat');
    }
    return null;
  }

  private hoverKind(tile: Point): HoverKind | null {
    if (
      this.personAt(tile) ||
      this.grid.doorTarget(tile) ||
      (this.grid.seatFacing(tile) && this.grid.isWalkable(tile)) ||
      this.grid.tileAt(tile) === TILE.noticeBoard
    )
      return 'special';
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
    const goal = resolveWalkTarget(this.grid, player.tile, tile);
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
