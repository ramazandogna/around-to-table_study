import {
  AREA_RULES,
  applyAreaRules,
  cleanRoomRules,
  DATA_EPOCH,
  EMPTY_JUKEBOX,
  isRoomArea,
  type RoomRules,
  JUKEBOX,
  parseYouTubeId,
  skipsNeeded,
  songOver,
  TABLE_GAMES,
  tableAction,
  type JukeboxState,
  type TableKind,
  type TableRecord,
  cleanRoomName,
  cleanStatusLines,
  EMPTY_LINES,
  FINISH_GRACE_MS,
  HEARTBEAT,
  createAreaGrid,
  isStale,
  findPath,
  isValidAppearance,
  stripsNeeded,
  parseClientMessage,
  type Appearance,
  type AreaGrid,
  type AreaId,
  type ClientMessage,
  type PlayerSnapshot,
  type Point,
  type ServerMessage,
  type StatusLines,
  type StudyStatus,
} from '@att/shared';
import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import { takeToken, type RateWindow } from './rate-limit';

/** Per-connection state. Kept in the WebSocket attachment so it survives hibernation. */
type Connection = {
  id: string;
  name: string;
  area: AreaId;
  joined: boolean;
  look?: Appearance;
  tile?: Point;
  moves: RateWindow;
  lastSayAt: number;
  study: StoredStudy;
  statuses: RateWindow;
  lastPokeAt: number;
  lines: StatusLines;
  lastEmoteAt: number;
  dancing: boolean;
  smoking: boolean;
  /** When the socket connected, for telling vanished ones apart (see `sweep`). */
  since: number;
};

/** Timers are kept as an end time on the server's clock and sent out as time left. */
type StoredStudy = Omit<StudyStatus, 'timer'> & {
  timer: { endsAt: number; totalMs: number } | null;
};

const NO_STUDY: StoredStudy = { activity: null, timer: null, dnd: false };
const MOVES_PER_SECOND = 10;
const STATUSES_PER_SECOND = 4;
const CLOSE_REPLACED = 4000;
/** One nudge per person every few seconds is plenty. */
const POKE_COOLDOWN_MS = 10_000;
const EMOTE_COOLDOWN_MS = 1_500;
const OPENED_KEY = 'opened';
const EPOCH_KEY = 'epoch';
const JUKEBOX_KEY = 'jukebox';
const tableKey = (kind: TableKind) => `table:${kind}`;
/** Songs queued per person per minute, on top of the queue's own limits. */
const TUNES_PER_MINUTE = 4;
/** How often sockets that went quiet are looked for while anyone is connected. */
const SWEEP_MS = 30_000;

export const AREA_HEADERS = {
  id: 'x-user-id',
  name: 'x-user-name',
  area: 'x-area',
  /** A private room's rules as JSON, set by the owner. */
  rules: 'x-room-rules',
} as const;
const RULES_KEY = 'rules';
/** Games a private room's table offers (darts needs the smoking room's cabinet). */
const ROOM_TABLE_GAMES: readonly TableKind[] = ['pig', 'guess'];

/**
 * One Durable Object per area (hall, library, smoking room). It owns who is
 * there and where they stand, and relays movement and chat to everyone else.
 */
export class AreaRoom extends DurableObject<Env> {
  private grids = new Map<AreaId, AreaGrid>();
  /** Renovation strips opened so far; loaded from storage on the first message. */
  private opened: number | null = null;
  /** The game tables, loaded from storage on the first message (they outlive hibernation). */
  private tables: Map<TableKind, TableRecord> | null = null;
  private jukebox: JukeboxState | null = null;
  /** A private room's rules; null in public rooms or until known. */
  private rules: RoomRules | null = null;
  /** When each person last queued songs, for `TUNES_PER_MINUTE`. */
  private readonly tuneWindows = new Map<string, RateWindow>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Heartbeats are answered without waking the object; their time tells live sockets from gone ones.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(HEARTBEAT.ping, HEARTBEAT.pong));
    // A new data epoch starts the room over: grown desks, tables, the jukebox, chat cooldowns.
    void ctx.blockConcurrencyWhile(async () => {
      if ((await ctx.storage.get<number>(EPOCH_KEY)) === DATA_EPOCH) return;
      await ctx.storage.deleteAll();
      await ctx.storage.put(EPOCH_KEY, DATA_EPOCH);
    });
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const id = request.headers.get(AREA_HEADERS.id);
    const name = request.headers.get(AREA_HEADERS.name);
    const area = request.headers.get(AREA_HEADERS.area) as AreaId | null;
    if (!id || !name || !area) return new Response('missing session', { status: 400 });

    const rules = request.headers.get(AREA_HEADERS.rules);
    if (rules && isRoomArea(area)) {
      this.rules = cleanRoomRules(JSON.parse(rules));
      await this.ctx.storage.put(RULES_KEY, this.rules);
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [id]);
    this.save(server, {
      id,
      name: decodeURIComponent(name),
      area,
      joined: false,
      moves: { start: 0, count: 0 },
      lastSayAt: 0,
      study: NO_STUDY,
      statuses: { start: 0, count: 0 },
      lastPokeAt: 0,
      lines: EMPTY_LINES,
      lastEmoteAt: 0,
      dancing: false,
      smoking: false,
      since: Date.now(),
    });
    await this.armSweep();
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const message = typeof raw === 'string' ? parseClientMessage(raw) : null;
    const me = this.load(ws);
    if (!message || !me) return this.send(ws, { t: 'error', code: 'bad_message' });
    // Nothing personal passes between two people when one blocked the other.
    if (
      (message.t === 'poke' || message.t === 'whisper' || message.t === 'invite') &&
      (await this.env.SOCIAL.getByName('hub').isBlocked(me.id, message.to))
    ) {
      return this.send(ws, { t: 'error', code: 'blocked' });
    }
    this.opened ??= (await this.ctx.storage.get<number>(OPENED_KEY)) ?? 0;
    await this.loadPlay();
    // The chat cooldown outlives the socket, so leaving and coming back does not reset it.
    const said = message.t === 'hello' ? await this.ctx.storage.get<number>(saidKey(me.id)) : 0;
    this.handle(ws, { ...me, lastSayAt: Math.max(me.lastSayAt, said ?? 0) }, message, Date.now());
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    this.leave(ws);
  }

  /**
   * Drops sockets that went quiet: a phone put to sleep or a tab that vanished
   * without closing. Otherwise they would stand in the room, and count, forever.
   */
  override async alarm(): Promise<void> {
    const now = Date.now();
    for (const ws of this.ctx.getWebSockets()) {
      const me = this.load(ws);
      const ping = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? null;
      if (!me || isStale(now, me.since ?? 0, ping)) this.leave(ws);
    }
    await this.loadPlay();
    this.advanceIfOver(now);
    if (this.ctx.getWebSockets().length > 0) await this.armSweep();
  }

  /** Loads the tables and the jukebox once per wake-up. */
  private async loadPlay(): Promise<void> {
    if (!this.tables) {
      const stored = await this.ctx.storage.get<TableRecord>(TABLE_GAMES.map(tableKey));
      this.tables = new Map();
      for (const kind of TABLE_GAMES) {
        const record = stored.get(tableKey(kind));
        if (record) this.tables.set(kind, record);
      }
    }
    this.jukebox ??= (await this.ctx.storage.get<JukeboxState>(JUKEBOX_KEY)) ?? EMPTY_JUKEBOX;
    this.rules ??= (await this.ctx.storage.get<RoomRules>(RULES_KEY)) ?? null;
  }

  /** The owner changed the room's rules: everyone inside is told. */
  async setRules(rules: RoomRules): Promise<void> {
    this.rules = cleanRoomRules(rules);
    await this.ctx.storage.put(RULES_KEY, this.rules);
    this.broadcast({ t: 'roomRules', rules: this.rules });
    if (!this.rules.games) {
      for (const kind of ROOM_TABLE_GAMES) {
        this.tables?.delete(kind);
        await this.ctx.storage.delete(tableKey(kind));
        this.broadcast({ t: 'table', kind, table: null });
      }
    }
  }

  /**
   * The owner sends people out (or everyone, when closing the room): they are
   * told why, then their sockets close.
   */
  async sendOff(
    ids: readonly string[] | null,
    why: 'kicked' | 'banned' | 'room_closed',
  ): Promise<void> {
    const sockets = ids
      ? ids.flatMap((id) => this.ctx.getWebSockets(id))
      : this.ctx.getWebSockets();
    for (const ws of sockets) {
      this.send(ws, { t: 'error', code: why });
      this.leave(ws);
    }
  }

  /** Whether table games are played here: the smoking room, and private rooms that allow them. */
  private gamesHere(area: AreaId, kind: TableKind): boolean {
    if (area === 'smoking') return true;
    return isRoomArea(area) && (this.rules?.games ?? true) && ROOM_TABLE_GAMES.includes(kind);
  }

  /** Someone started over: everyone they were before leaves the room at once. */
  async kick(ids: readonly string[]): Promise<void> {
    for (const id of ids) for (const ws of this.ctx.getWebSockets(id)) this.leave(ws);
  }

  /** Wakes up to sweep quiet sockets, or sooner when the jukebox's song ends. */
  private async armSweep(): Promise<void> {
    const playing = this.jukebox?.now;
    const songEnd =
      playing?.seconds != null ? playing.startedAt + (playing.seconds + 4) * 1000 : Infinity;
    const wanted = Math.min(Date.now() + SWEEP_MS, songEnd);
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > wanted) await this.ctx.storage.setAlarm(wanted);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.leave(ws);
  }

  private handle(ws: WebSocket, me: Connection, message: ClientMessage, now: number): void {
    switch (message.t) {
      case 'hello': {
        if (!isValidAppearance(message.look))
          return this.send(ws, { t: 'error', code: 'bad_message' });
        this.replaceOlderConnections(ws, me.id);
        const grid = this.grid(me.area);
        const tile = message.from ? grid.arrivalPoint(message.from) : { ...grid.area.spawn };
        const study = message.status ? this.storeStudy(grid, tile, message.status, now) : NO_STUDY;
        // Lines with a link are dropped rather than refusing the whole hello.
        const lines = (message.lines && cleanStatusLines(message.lines)) ?? EMPTY_LINES;
        const joined: Connection = {
          ...me,
          joined: true,
          look: message.look,
          tile,
          study,
          lines,
          dancing: false,
        };
        this.save(ws, joined);
        this.send(ws, {
          t: 'welcome',
          self: me.id,
          tile,
          area: me.area,
          players: this.players(now).filter((p) => p.id !== me.id),
          opened: this.opened ?? 0,
        });
        this.broadcast({ t: 'joined', player: snapshot(joined, now) }, ws);
        this.grow(me.area);
        if (isRoomArea(me.area) && this.rules) {
          this.send(ws, { t: 'roomRules', rules: this.rules });
        }
        if (me.area === 'smoking' || isRoomArea(me.area)) {
          for (const [kind, record] of this.tables ?? []) {
            this.send(ws, { t: 'table', kind, table: record.table });
          }
        }
        if (me.area === 'smoking') {
          this.advanceIfOver(now);
          this.send(ws, { t: 'jukebox', state: this.jukebox ?? EMPTY_JUKEBOX });
        }
        return;
      }
      case 'move': {
        if (!me.joined || !me.tile) return;
        const moves = takeToken(me.moves, now, MOVES_PER_SECOND, 1000);
        if (!moves) return this.send(ws, { t: 'error', code: 'rate_limited' });
        const grid = this.grid(me.area);
        if (grid.isSeat(message.to) && this.seatedBy(message.to, me.id)) {
          this.save(ws, { ...me, moves });
          return this.send(ws, { t: 'error', code: 'seat_taken' });
        }
        const path = findPath(grid, me.tile, message.to);
        if (!path) {
          this.save(ws, { ...me, moves });
          return this.send(ws, { t: 'placed', id: me.id, tile: me.tile });
        }
        // Standing up clears what was on the table and walking stops a dance;
        // everyone else does the same on "moved".
        const study = { ...me.study, activity: null };
        this.save(ws, { ...me, moves, tile: message.to, study, dancing: false, smoking: false });
        this.broadcast({ t: 'moved', id: me.id, to: message.to }, ws);
        return;
      }
      case 'look': {
        if (!me.joined) return;
        // Looks and statuses share one small budget; both change rarely.
        const statuses = takeToken(me.statuses, now, STATUSES_PER_SECOND, 1000);
        if (!statuses) return this.send(ws, { t: 'error', code: 'rate_limited' });
        this.save(ws, { ...me, statuses, look: message.look });
        this.broadcast({ t: 'looked', id: me.id, look: message.look }, ws);
        return;
      }
      case 'status': {
        if (!me.joined || !me.tile) return;
        const statuses = takeToken(me.statuses, now, STATUSES_PER_SECOND, 1000);
        if (!statuses) return this.send(ws, { t: 'error', code: 'rate_limited' });
        const study = this.storeStudy(this.grid(me.area), me.tile, message.status, now);
        this.save(ws, { ...me, statuses, study });
        this.broadcast({ t: 'status', id: me.id, status: publicStudy(study, now) });
        return;
      }
      case 'say': {
        if (!me.joined) return;
        const rules = AREA_RULES[me.area];
        const wait = me.lastSayAt + rules.cooldownMs - now;
        if (wait > 0) return this.send(ws, { t: 'error', code: 'rate_limited', retryInMs: wait });
        const result = applyAreaRules(message.text, rules);
        if (!result.ok) {
          if (result.reason === 'link') this.send(ws, { t: 'error', code: 'link_blocked' });
          return;
        }
        this.save(ws, { ...me, lastSayAt: now });
        void this.ctx.storage.put(saidKey(me.id), now);
        this.broadcast({ t: 'said', id: me.id, text: result.text, at: now });
        return;
      }
      case 'lines': {
        if (!me.joined) return;
        const statuses = takeToken(me.statuses, now, STATUSES_PER_SECOND, 1000);
        if (!statuses) return this.send(ws, { t: 'error', code: 'rate_limited' });
        const lines = cleanStatusLines(message.lines);
        if (!lines) return this.send(ws, { t: 'error', code: 'link_blocked' });
        this.save(ws, { ...me, statuses, lines });
        this.broadcast({ t: 'lined', id: me.id, lines });
        return;
      }
      case 'emote': {
        if (!me.joined || now - me.lastEmoteAt < EMOTE_COOLDOWN_MS) return;
        this.save(ws, { ...me, lastEmoteAt: now });
        this.broadcast({ t: 'emoted', id: me.id, emote: message.emote });
        return;
      }
      case 'dance': {
        if (!me.joined || me.dancing === message.on) return;
        if (message.on && !AREA_RULES[me.area].dance) {
          return this.send(ws, { t: 'error', code: 'not_allowed' });
        }
        // One thing at a time: dancing puts the cigarette out.
        this.save(ws, { ...me, dancing: message.on, smoking: false });
        if (me.smoking) this.broadcast({ t: 'smoked', id: me.id, on: false });
        this.broadcast({ t: 'danced', id: me.id, on: message.on });
        return;
      }
      case 'chair': {
        if (!me.joined) return;
        const statuses = takeToken(me.statuses, now, STATUSES_PER_SECOND, 1000);
        if (!statuses || !this.grid(me.area).seatFacing(message.tile)) return;
        this.save(ws, { ...me, statuses });
        this.broadcast({ t: 'chaired', tile: message.tile, pulled: message.pulled }, ws);
        return;
      }
      case 'smoke': {
        if (!me.joined || me.smoking === message.on) return;
        if (message.on && !AREA_RULES[me.area].smoke) {
          return this.send(ws, { t: 'error', code: 'not_allowed' });
        }
        this.save(ws, { ...me, smoking: message.on, dancing: false });
        if (me.dancing) this.broadcast({ t: 'danced', id: me.id, on: false });
        this.broadcast({ t: 'smoked', id: me.id, on: message.on });
        return;
      }
      case 'pat': {
        // Shares the emote's budget: a stroke every second or so.
        if (!me.joined || now - me.lastEmoteAt < EMOTE_COOLDOWN_MS) return;
        this.save(ws, { ...me, lastEmoteAt: now });
        this.broadcast({ t: 'patted', id: me.id, owner: message.owner });
        return;
      }
      case 'table': {
        if (!me.joined || !this.tables || !this.gamesHere(me.area, message.kind)) return;
        this.playTable(ws, me, message.kind, message.action, now);
        return;
      }
      case 'tune': {
        if (!me.joined || me.area !== 'smoking') return;
        void this.addTune(ws, me, message.link);
        return;
      }
      case 'skip': {
        if (!me.joined || me.area !== 'smoking') return;
        this.skipTune(me, message.id, now);
        return;
      }
      case 'tuneLength': {
        const jukebox = this.jukebox;
        const playing = jukebox?.now;
        if (!me.joined || !jukebox || !playing) return;
        if (playing.id !== message.id || playing.seconds !== null) return;
        if (message.seconds > JUKEBOX.maxSeconds) {
          this.nextTune(now);
          this.send(ws, { t: 'error', code: 'tune_long' });
          return;
        }
        this.setJukebox({ ...jukebox, now: { ...playing, seconds: message.seconds } });
        void this.armSweep();
        return;
      }
      case 'finished': {
        // Only a timer that really ran out may be celebrated, and only once.
        const timer = me.study.timer;
        if (!me.joined || !timer || timer.endsAt - now > FINISH_GRACE_MS) return;
        const study = { ...me.study, timer: null };
        this.save(ws, { ...me, study });
        this.broadcast({ t: 'finished', id: me.id });
        // It counts on the person's profile: the room saw the timer run out.
        void this.env.SOCIAL.getByName('hub').recordBlock(me.id, timer.totalMs / 60_000);
        this.broadcast({ t: 'status', id: me.id, status: publicStudy(study, now) });
        return;
      }
      case 'invite': {
        if (!me.joined) return;
        // Invites share the poke's budget: one every few seconds is plenty.
        if (now - me.lastPokeAt < POKE_COOLDOWN_MS)
          return this.send(ws, { t: 'error', code: 'rate_limited' });
        const name = cleanRoomName(message.name);
        const target = name && this.reach(ws, me, message.to);
        if (!name || !target) return;
        this.save(ws, { ...me, lastPokeAt: now });
        this.send(target, { t: 'invited', from: me.id, code: message.code, name });
        return;
      }
      case 'poke': {
        if (!me.joined) return;
        // No retry time: that one belongs to the chat cooldown on the client.
        if (now - me.lastPokeAt < POKE_COOLDOWN_MS)
          return this.send(ws, { t: 'error', code: 'rate_limited' });
        const target = this.reach(ws, me, message.to);
        if (!target) return;
        this.save(ws, { ...me, lastPokeAt: now });
        const poke: ServerMessage = { t: 'poked', from: me.id, to: message.to };
        this.send(target, poke);
        this.send(ws, poke);
        return;
      }
      case 'whisper': {
        if (!me.joined) return;
        const rules = AREA_RULES[me.area];
        if (!rules.dmAllowed) return this.send(ws, { t: 'error', code: 'not_allowed' });
        // Whispers share the area's chat cooldown, so they are no way around it.
        const wait = me.lastSayAt + rules.cooldownMs - now;
        if (wait > 0) return this.send(ws, { t: 'error', code: 'rate_limited', retryInMs: wait });
        const result = applyAreaRules(message.text, rules);
        if (!result.ok) {
          if (result.reason === 'link') this.send(ws, { t: 'error', code: 'link_blocked' });
          return;
        }
        const target = this.reach(ws, me, message.to);
        if (!target) return;
        this.save(ws, { ...me, lastSayAt: now });
        const whisper: ServerMessage = {
          t: 'whispered',
          from: me.id,
          to: message.to,
          text: result.text,
          at: now,
        };
        this.send(target, whisper);
        this.send(ws, whisper);
        return;
      }
    }
  }

  private playTable(
    ws: WebSocket,
    me: Connection,
    kind: TableKind,
    action: Parameters<typeof tableAction>[2],
    now: number,
  ): void {
    const tables = this.tables;
    if (!tables) return;
    const before = tables.get(kind) ?? null;
    const { record, error } = tableAction(kind, before, action, {
      id: me.id,
      name: me.name,
      now,
      random: Math.random,
    });
    if (error) return this.send(ws, { t: 'tableError', kind, code: error });
    if (record === before) return;
    if (record) {
      tables.set(kind, record);
      void this.ctx.storage.put(tableKey(kind), record);
    } else {
      tables.delete(kind);
      void this.ctx.storage.delete(tableKey(kind));
    }
    this.broadcast({ t: 'table', kind, table: record?.table ?? null });
  }

  /** Queues a song after asking YouTube whether the video exists and may be embedded. */
  private async addTune(ws: WebSocket, me: Connection, link: string): Promise<void> {
    const video = parseYouTubeId(link);
    if (!video) return this.send(ws, { t: 'error', code: 'tune_bad' });
    const now = Date.now();
    const window = takeToken(
      this.tuneWindows.get(me.id) ?? { start: 0, count: 0 },
      now,
      TUNES_PER_MINUTE,
      60_000,
    );
    if (!window) return this.send(ws, { t: 'error', code: 'rate_limited' });
    this.tuneWindows.set(me.id, window);
    const state = this.jukebox ?? EMPTY_JUKEBOX;
    const mine = state.queue.filter((tune) => tune.by === me.id).length;
    if (state.queue.length >= JUKEBOX.queue || mine >= JUKEBOX.perPerson) {
      return this.send(ws, { t: 'error', code: 'tune_full' });
    }
    const title = await videoTitle(video);
    if (title === null) return this.send(ws, { t: 'error', code: 'tune_bad' });
    const tune = { id: crypto.randomUUID().slice(0, 8), video, title, by: me.id, byName: me.name };
    // The queue may have moved on while YouTube answered.
    const latest = this.jukebox ?? EMPTY_JUKEBOX;
    if (latest.now) this.setJukebox({ ...latest, queue: [...latest.queue, tune] });
    else
      this.setJukebox({
        now: { ...tune, startedAt: Date.now(), seconds: null, skips: [] },
        queue: [],
      });
  }

  /**
   * The person who queued a song may skip it or take it back; anyone else asks,
   * and half the room asking skips it.
   */
  private skipTune(me: Connection, id: string, now: number): void {
    const state = this.jukebox ?? EMPTY_JUKEBOX;
    const queued = state.queue.find((tune) => tune.id === id);
    if (queued) {
      if (queued.by !== me.id) return;
      this.setJukebox({ ...state, queue: state.queue.filter((tune) => tune.id !== id) });
      return;
    }
    const playing = state.now;
    if (!playing || playing.id !== id) return;
    if (playing.by === me.id) return this.nextTune(now);
    const skips = playing.skips.includes(me.id) ? playing.skips : [...playing.skips, me.id];
    if (skips.length >= skipsNeeded(this.players(now).length)) return this.nextTune(now);
    this.setJukebox({ ...state, now: { ...playing, skips } });
  }

  private advanceIfOver(now: number): void {
    const playing = this.jukebox?.now;
    if (playing && songOver(playing, now)) this.nextTune(now);
  }

  /** Starts the next song in the queue, or stops when there is none. */
  private nextTune(now: number): void {
    const [next, ...rest] = (this.jukebox ?? EMPTY_JUKEBOX).queue;
    this.setJukebox({
      now: next ? { ...next, startedAt: now, seconds: null, skips: [] } : null,
      queue: rest,
    });
  }

  private setJukebox(state: JukeboxState): void {
    this.jukebox = state;
    void this.ctx.storage.put(JUKEBOX_KEY, state);
    this.broadcast({ t: 'jukebox', state });
  }

  /** The socket of someone else in this area who may be disturbed, or null after telling the sender why not. */
  private reach(ws: WebSocket, me: Connection, id: string): WebSocket | null {
    const target =
      id === me.id ? undefined : this.ctx.getWebSockets(id).find((s) => this.load(s)?.joined);
    const them = target && this.load(target);
    if (!target || !them) {
      this.send(ws, { t: 'error', code: 'unavailable' });
      return null;
    }
    if (them.study.dnd) {
      this.send(ws, { t: 'error', code: 'dnd' });
      return null;
    }
    return target;
  }

  /** Whether someone other than `self` sits on (stands at) this seat. */
  private seatedBy(seat: Point, self: string): boolean {
    return this.ctx.getWebSockets().some((ws) => {
      const c = this.load(ws);
      return !!c?.joined && c.id !== self && c.tile?.x === seat.x && c.tile.y === seat.y;
    });
  }

  /**
   * Opens the next desk when more people are in the room than there are
   * chairs. It stays open, as a library that grew would.
   */
  private grow(area: AreaId): void {
    const people = this.players(Date.now()).length;
    const opened = stripsNeeded(area, people, this.opened ?? 0);
    if (opened === this.opened) return;
    this.opened = opened;
    this.grids.delete(area);
    void this.ctx.storage.put(OPENED_KEY, opened);
    this.broadcast({ t: 'grew', opened });
  }

  /** A second tab or a reconnect takes over; the old socket is told why and closed. */
  private replaceOlderConnections(current: WebSocket, id: string): void {
    for (const other of this.ctx.getWebSockets(id)) {
      if (other === current) continue;
      this.save(other, { ...(this.load(other) as Connection), joined: false });
      this.send(other, { t: 'error', code: 'replaced' });
      other.close(CLOSE_REPLACED, 'replaced');
    }
  }

  private leave(ws: WebSocket): void {
    const me = this.load(ws);
    if (me?.joined) {
      this.save(ws, { ...me, joined: false });
      this.broadcast({ t: 'left', id: me.id }, ws);
      // Whoever leaves the room gets up from its tables too.
      for (const [kind, record] of this.tables ?? []) {
        if (record.table.players.some((p) => p.id === me.id)) {
          this.playTable(ws, me, kind, { a: 'leave' }, Date.now());
        }
      }
    }
    try {
      ws.close();
    } catch {
      // Already closed.
    }
  }

  /** An activity only counts while sitting at a table. */
  private storeStudy(grid: AreaGrid, tile: Point, status: StudyStatus, now: number): StoredStudy {
    return {
      activity: grid.seatFacing(tile) ? status.activity : null,
      // Which block of a session it is travels too, for "2 of 4" by the name.
      round: status.timer ? (status.round ?? null) : null,
      timer: status.timer
        ? { endsAt: now + status.timer.remainingMs, totalMs: status.timer.totalMs }
        : null,
      dnd: status.dnd,
    };
  }

  private players(now: number): PlayerSnapshot[] {
    return this.ctx
      .getWebSockets()
      .map((ws) => this.load(ws))
      .filter((c): c is Connection => !!c?.joined)
      .map((c) => snapshot(c, now));
  }

  private broadcast(message: ServerMessage, except?: WebSocket): void {
    const data = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== except && this.load(ws)?.joined) this.trySend(ws, data);
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    this.trySend(ws, JSON.stringify(message));
  }

  private trySend(ws: WebSocket, data: string): void {
    try {
      ws.send(data);
    } catch {
      // The socket is closing; its close handler cleans up.
    }
  }

  private grid(area: AreaId): AreaGrid {
    let grid = this.grids.get(area);
    if (!grid) {
      grid = createAreaGrid(area, this.opened ?? 0);
      this.grids.set(area, grid);
    }
    return grid;
  }

  private load(ws: WebSocket): Connection | null {
    // Sockets saved by an older deploy lack the newer fields.
    const stored = ws.deserializeAttachment() as Partial<Connection> | null;
    return stored
      ? ({
          study: NO_STUDY,
          statuses: { start: 0, count: 0 },
          lastPokeAt: 0,
          lines: EMPTY_LINES,
          lastEmoteAt: 0,
          dancing: false,
          smoking: false,
          ...stored,
        } as Connection)
      : null;
  }

  private save(ws: WebSocket, connection: Connection): void {
    ws.serializeAttachment(connection);
  }
}

const saidKey = (id: string) => `said:${id}`;

function snapshot(c: Connection, now: number): PlayerSnapshot {
  return {
    id: c.id,
    name: c.name,
    look: c.look as Appearance,
    tile: c.tile ?? { x: 0, y: 0 },
    status: publicStudy(c.study, now),
    lines: c.lines,
    dancing: c.dancing,
    smoking: c.smoking,
  };
}

function publicStudy(study: StoredStudy, now: number): StudyStatus {
  const { timer } = study;
  return {
    ...study,
    timer: timer ? { remainingMs: Math.max(0, timer.endsAt - now), totalMs: timer.totalMs } : null,
  };
}

/**
 * A video's title from YouTube's oEmbed, which also tells videos that may not
 * be embedded (null). When YouTube cannot be reached the song is still taken.
 */
async function videoTitle(video: string): Promise<string | null> {
  const page = `https://www.youtube.com/watch?v=${video}`;
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(page)}`,
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { title?: unknown };
    return typeof body.title === 'string' ? body.title.slice(0, 120) : 'YouTube';
  } catch {
    return 'YouTube';
  }
}
