import {
  createAreaGrid,
  findPath,
  resolveWalkTarget,
  type AreaGrid,
  type AreaId,
  type BlockReason,
  type PlayerSnapshot,
  type Point,
  type ServerMessage,
} from '@att/shared';
import { t, type MessageKey } from '../i18n/t';
import { AreaConnection } from '../net/AreaConnection';
import { loadLook } from '../net/session';
import { studyStatus, useGameStore } from '../state/store';
import { Avatar, type AvatarContext } from './Avatar';
import { buildArea, type BuiltArea } from './buildArea';
import type { CharacterKit } from './characters';
import type { IsoView } from './IsoView';
import type { Furniture } from './models';
import { createTableProps } from './tableProps';

const BLOCK_MESSAGES: Partial<Record<BlockReason, MessageKey>> = {
  renovation: 'blocked.renovation',
  elevator: 'blocked.elevator',
};
const BLOCK_MESSAGE_COOLDOWN_MS = 2500;
const CAMERA_LERP = 0.12;
const FADE_MS = 220;

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

const sameTile = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

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
  private leaving = false;
  private lastBlockMessageAt = -Infinity;
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
    };
    // The player's own status lives in the store; the world shows it and the server shares it.
    this.unsubscribe = useGameStore.subscribe((state, before) => {
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

    const look = loadLook();
    const start = from ? this.grid.arrivalPoint(from) : this.grid.area.spawn;
    this.player = new Avatar(this.assets.characters, look, start, session.name, true, this.context);
    this.player.setStatus(studyStatus());
    this.view.add(this.player.root);
    this.view.follow(start.x + 0.5, start.y + 0.5, 1);

    const store = useGameStore.getState();
    store.setArea(area);
    store.setPlayersHere(1);
    this.connection = new AreaConnection({
      area,
      from,
      token: session.token,
      look,
      status: () => studyStatus(),
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
    useGameStore.getState().setSeated(false);
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

    const arrived = player.update(delta);
    if (arrived) this.checkDoor(arrived);
    if (player.isSeated !== useGameStore.getState().seated) {
      useGameStore.getState().setSeated(player.isSeated);
    }
    for (const other of this.others.values()) other.update(delta);
    const people = [player.position, ...[...this.others.values()].map((o) => o.position)];
    this.built?.update(delta, people);

    const { x, z } = player.position;
    this.view.follow(x, z, CAMERA_LERP);
  }

  private onServerMessage(message: ServerMessage): void {
    const selfId = useGameStore.getState().session?.id;
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
        if (message.player.id !== selfId) this.addOther(message.player);
        break;
      case 'left':
        this.others.get(message.id)?.dispose();
        this.others.delete(message.id);
        break;
      case 'moved': {
        const other = this.others.get(message.id);
        if (!other) break;
        const path = findPath(this.grid, other.tile, message.to);
        if (path) other.walk(path);
        else other.teleport(message.to);
        // Standing up clears the table, as on the server.
        other.clearActivity();
        break;
      }
      case 'status':
        if (message.id !== selfId) this.others.get(message.id)?.setStatus(message.status);
        break;
      case 'placed':
        if (message.id === selfId && this.player && !sameTile(this.player.tile, message.tile)) {
          this.player.teleport(message.tile);
        }
        break;
      case 'said':
        if (message.id === selfId) this.player?.say(message.text);
        // "Do not disturb" hides everyone else's chatter.
        else if (!useGameStore.getState().dnd) this.others.get(message.id)?.say(message.text);
        break;
      case 'error':
        if (message.code === 'rate_limited' || message.code === 'replaced') {
          useGameStore.getState().setNotice(message.code);
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
    this.others.set(player.id, avatar);
    this.view.add(avatar.root);
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (useGameStore.getState().typing || !(event.code in KEY_DIRECTIONS)) return;
    event.preventDefault();
    this.heldKeys.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.heldKeys.delete(event.code);
  };

  private readonly onBlur = () => this.heldKeys.clear();

  private readonly onPointerDown = (event: PointerEvent) => {
    if (this.view.isPinching) return;
    const tile = this.view.pickTile(event.clientX, event.clientY);
    if (!tile) return;
    // Tapping someone shows what they are up to instead of walking onto them.
    const someone = [...this.others.values()].find((o) => sameTile(o.tile, tile));
    if (someone) someone.toggleDetails();
    else this.walkTo(tile);
  };

  /** Keys move one tile at a time. The camera looks from the south-east, so screen-up is north-west. */
  private handleKeyboard(player: Avatar): void {
    if (player.isMoving || useGameStore.getState().typing) return;
    const last = [...this.heldKeys].pop();
    const direction = last ? KEY_DIRECTIONS[last] : undefined;
    if (!direction) return;

    const [dx, dy] = direction;
    const next = { x: player.tile.x + dx, y: player.tile.y + dy };
    const reason = this.grid.blockReason(next);
    if (reason) {
      player.face(dx, dy);
      this.explainBlock(reason);
      return;
    }
    player.walk([next]);
    this.connection?.move(next);
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
    const path = goal && findPath(this.grid, player.tile, goal);
    if (!goal || !path) return;
    player.walk(path);
    this.connection?.move(goal);
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
    this.leaving = true;
    this.fader.classList.add('world-fader--dark');
    const from = this.areaId;
    window.setTimeout(() => this.enter(to, from), FADE_MS);
  }
}
