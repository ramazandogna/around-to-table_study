import { withAllowedLook } from './looks';
import {
  AREA_RULES,
  SWEARS,
  applyAreaRules,
  cleanRoomRules,
  DATA_EPOCH,
  EMPTY_JUKEBOX,
  isRoomArea,
  ROOM_SIZES,
  roomArea,
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
  blockStart,
  countsForFocus,
  focusMinutes,
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
import { cleanStage, controlStage, STAGE_LIMITS, type StageState } from '@att/shared';
import {
  blockCredit,
  candleCount,
  candles,
  mayLeaveBook,
  pruneBooks,
  pruneLog,
  tableHourNow,
  tableOfSeat,
  viewBook,
  type Book,
  type BookView,
  type FocusSpan,
  type Reward,
} from '@att/shared';
import { DurableObject } from 'cloudflare:workers';
import { doorTag } from './accounts';
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
  danceMove: number;
  afk: boolean;
  /** Messages with a swear in them lately (see `SWEARS`). */
  swears?: RateWindow;
  smoking: boolean;
  /** In the conference hall: may put things on the big screen (from the stage). */
  presenter?: boolean;
  /** When what this presenter shows comes down by itself (the end of their event). */
  stageUntil?: number | null;
  /** Table moves lately (see `TABLE_MOVES_PER_MINUTE`). */
  tableMoves?: RateWindow;
  /** Stage changes lately (see `STAGE_LIMITS.perMinute`). */
  stageChanges?: RateWindow;
  /** The access code's tag when it connected: a deploy changes the code and sends it out. */
  door?: string;
  /** When the socket connected, for telling vanished ones apart (see `sweep`). */
  since: number;
  /** The account behind the character (see `AREA_HEADERS.account`). */
  acct?: string;
  /** Friends and blocked people, asked of the hub on arrival: who may see whose name on a book. */
  friends?: string[];
  blocked?: string[];
};

/** Timers are kept as an end time on the server's clock and sent out as time left. */
type StoredStudy = Omit<StudyStatus, 'timer'> & {
  timer: { endsAt: number; totalMs: number; startedAt?: number } | null;
};

const NO_STUDY: StoredStudy = { activity: null, timer: null, dnd: false };
/** Lines of chat remembered for reports, and how many of one person's are given. */
const SAID_KEPT = 80;
const REPORT_LINES_KEPT = 5;
const MOVES_PER_SECOND = 10;
const STATUSES_PER_SECOND = 4;
const CLOSE_REPLACED = 4000;
/** One nudge per person every few seconds is plenty. */
const POKE_COOLDOWN_MS = 10_000;
const EMOTE_COOLDOWN_MS = 1_500;
const OPENED_KEY = 'opened';
const LAMPS_KEY = 'lamps';
const EPOCH_KEY = 'epoch';
const JUKEBOX_KEY = 'jukebox';
const STAGE_KEY = 'stage';
/** Who focused at which chair lately, and the books left on the tables (see together.ts). */
const FOCUS_KEY = 'focus';
const BOOKS_KEY = 'books';
const rewardKey = (id: string) => `reward:${id}`;
/** A reward card not seen within this long (a long time away) is let go. */
const REWARD_KEEP_MS = 30 * 60_000;
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
  /** In the conference hall: 'presenter' or 'audience'. */
  role: 'x-conference-role',
  /** The account the character belongs to. */
  account: 'x-account-id',
} as const;
const RULES_KEY = 'rules';
/** Games a private room's table offers (darts needs the smoking room's cabinet). */
const ROOM_TABLE_GAMES: readonly TableKind[] = TABLE_GAMES.filter((kind) => kind !== 'darts');
/** Table moves per person per minute: plenty for a quick math race, not a flood. */
const TABLE_MOVES_PER_MINUTE = 90;

/**
 * One Durable Object per area (hall, library, smoking room). It owns who is
 * there and where they stand, and relays movement and chat to everyone else.
 */
export class AreaRoom extends DurableObject<Env> {
  private grids = new Map<AreaId, AreaGrid>();
  /** Renovation strips opened so far; loaded from storage on the first message. */
  private opened: number | null = null;
  /** Library lamps switched against the house rule; the librarian puts them back. Loaded with `opened`. */
  private flippedLamps: Set<number> | null = null;
  /** The game tables, loaded from storage on the first message (they outlive hibernation). */
  private tables: Map<TableKind, TableRecord> | null = null;
  private jukebox: JukeboxState | null = null;
  /** The conference hall's big screen; undefined until loaded, null when blank. */
  private stage: StageState | null | undefined = undefined;
  /** A private room's rules; null in public rooms or until known. */
  private rules: RoomRules | null = null;
  /** When each person last queued songs, for `TUNES_PER_MINUTE`. */
  private readonly tuneWindows = new Map<string, RateWindow>();
  /** Who focused where lately; loaded from storage on the first message. */
  private focusLog: FocusSpan[] | null = null;
  /** Books left on the tables; loaded with the log. */
  private books: Book[] | null = null;

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

    // A private room holds as many people as it was opened for, however many passes went out.
    const size = ROOM_SIZES.find((s) => roomArea(s) === area);
    if (size !== undefined) {
      const here = new Set(this.occupantIds());
      if (!here.has(id) && here.size >= size)
        return Response.json({ error: 'full' }, { status: 409 });
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
      danceMove: 0,
      afk: false,
      smoking: false,
      presenter: request.headers.get(AREA_HEADERS.role) === 'presenter',
      acct: request.headers.get(AREA_HEADERS.account) ?? id,
      door: await this.doorTag(),
      since: Date.now(),
    });
    await this.armSweep();
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const message = typeof raw === 'string' ? parseClientMessage(raw) : null;
    const me = this.load(ws);
    if (!message || !me) return this.send(ws, { t: 'error', code: 'bad_message' });
    // A deploy changed the access code: everyone who came in with the old one goes out.
    if (me.door !== (await this.doorTag())) {
      await this.loadPlay();
      return this.leave(ws);
    }
    // Nothing personal passes between two people when one blocked the other.
    if (
      (message.t === 'poke' || message.t === 'whisper' || message.t === 'invite') &&
      (await this.env.SOCIAL.getByName('hub').isBlocked(me.id, message.to))
    ) {
      return this.send(ws, { t: 'error', code: 'blocked' });
    }
    this.opened ??= (await this.ctx.storage.get<number>(OPENED_KEY)) ?? 0;
    this.flippedLamps ??= new Set((await this.ctx.storage.get<number[]>(LAMPS_KEY)) ?? []);
    await this.loadPlay();
    await this.loadTogether();
    // Friends see each other's names on the books; asked once on arrival, where there are tables.
    if (message.t === 'hello' && countsForFocus(me.area)) {
      const circle = await this.env.SOCIAL.getByName('hub').circleOf(me.id);
      this.save(ws, { ...(this.load(ws) ?? me), friends: circle.friends, blocked: circle.blocked });
    }
    // Who presents changes as events start and end, so it is asked again at each change of the screen.
    const toStage =
      message.t === 'move' && me.area === 'conference' && this.grid(me.area).isStage(message.to);
    if (me.area === 'conference' && (message.t.startsWith('stage') || toStage)) {
      const { role, until } = await this.env.SOCIAL.getByName('hub').conferenceRole(
        me.id,
        !this.env.ACCESS_PASSWORD,
      );
      const presenter = role === 'presenter';
      if (presenter !== !!me.presenter) {
        this.send(ws, { t: 'staged', stage: this.stage ?? null, now: Date.now(), presenter });
      }
      me.presenter = presenter;
      me.stageUntil = until;
      this.save(ws, me);
    }
    // Earned things to wear are shown only if the hub agrees they were earned.
    const checked = await withAllowedLook(message, (look) =>
      this.env.SOCIAL.getByName('hub').allowedLook(me.id, look),
    );
    // The chat cooldown outlives the socket, so leaving and coming back does not reset it.
    const said = message.t === 'hello' ? await this.ctx.storage.get<number>(saidKey(me.id)) : 0;
    // What a person says, emotes and dances is not shown to anyone they blocked or who blocked them.
    if (
      (message.t === 'say' || message.t === 'emote' || message.t === 'dance') &&
      this.ctx.getWebSockets().length > 1
    ) {
      this.hiddenFrom = new Set(await this.env.SOCIAL.getByName('hub').blockedWith(me.id));
    }
    // Other messages of this socket ran while those awaits waited: act on its state as it is now.
    const current = this.load(ws) ?? me;
    try {
      this.handle(
        ws,
        { ...current, lastSayAt: Math.max(current.lastSayAt, said ?? 0) },
        checked,
        Date.now(),
      );
    } finally {
      this.hiddenFrom = null;
    }
    if (message.t === 'hello') await this.welcomeTogether(ws, me.id);
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    // After hibernation the tables are not in memory yet; without them the
    // leaver would stay seated at a game forever.
    await this.loadPlay();
    await this.loadTogether();
    this.leave(ws);
  }

  /**
   * Drops sockets that went quiet: a phone put to sleep or a tab that vanished
   * without closing. Otherwise they would stand in the room, and count, forever.
   */
  override async alarm(): Promise<void> {
    const now = Date.now();
    await this.loadPlay();
    await this.loadTogether();
    const door = await this.doorTag();
    for (const ws of this.ctx.getWebSockets()) {
      const me = this.load(ws);
      const ping = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? null;
      if (!me || me.door !== door || isStale(now, me.since ?? 0, ping)) this.leave(ws);
    }
    this.advanceIfOver(now);
    this.dropAbsentPlayers(now);
    this.closeAbsentFocus(now);
    if (this.ctx.getWebSockets().length > 0) await this.armSweep();
  }

  /**
   * Gets anyone no longer in the room up from the tables (a socket that
   * closed while the room slept), so no game waits forever for a ghost.
   */
  private dropAbsentPlayers(now: number): void {
    if (!this.tables) return;
    const here = new Set(
      this.ctx
        .getWebSockets()
        .map((ws) => this.load(ws))
        .filter((c): c is Connection => !!c?.joined)
        .map((c) => c.id),
    );
    for (const [kind, record] of [...this.tables]) {
      for (const player of record.table.players) {
        if (here.has(player.id)) continue;
        const result = tableAction(
          kind,
          this.tables.get(kind) ?? null,
          { a: 'leave' },
          {
            id: player.id,
            name: player.name,
            now,
            random: Math.random,
          },
        );
        this.storeTable(kind, result.record);
      }
    }
  }

  /** Keeps a table (or its end) in memory and storage, and tells the room. */
  private storeTable(kind: TableKind, record: TableRecord | null): void {
    if (record) {
      this.tables?.set(kind, record);
      void this.ctx.storage.put(tableKey(kind), record);
    } else {
      this.tables?.delete(kind);
      void this.ctx.storage.delete(tableKey(kind));
    }
    this.broadcast({ t: 'table', kind, table: record?.table ?? null });
  }

  /** The last lines said in the room (memory only; a report asks soon after). */
  private readonly said: { id: string; text: string; at: number }[] = [];

  /**
   * While one message is handled: the people it must not reach (those the
   * sender blocked or who blocked them). Handling is synchronous, so it is
   * set and cleared around the one call.
   */
  private hiddenFrom: Set<string> | null = null;

  private doorTagValue: string | null = null;

  /** The current access code's tag (see `doorTag` in accounts.ts). */
  private async doorTag(): Promise<string> {
    this.doorTagValue ??= await doorTag(this.env.ACCESS_PASSWORD);
    return this.doorTagValue;
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
    if (this.stage === undefined) {
      this.stage = (await this.ctx.storage.get<StageState>(STAGE_KEY)) ?? null;
    }
    // An event's screen comes down when the event ends.
    const now = Date.now();
    if (this.stage?.until != null && now >= this.stage.until) this.setStage(null, now);
  }

  /** A new picture, video or sound on the big screen (or none): kept, and everyone told. */
  private setStage(stage: StageState | null, now: number): void {
    this.stage = stage;
    void (stage ? this.ctx.storage.put(STAGE_KEY, stage) : this.ctx.storage.delete(STAGE_KEY));
    this.broadcast({ t: 'staged', stage, now });
  }

  /**
   * Whether this person may change the screen now: a presenter standing on the
   * stage, within the rate limit. Says why not when they may not.
   */
  private mayPresent(ws: WebSocket, me: Connection, now: number): boolean {
    if (me.area !== 'conference' || !me.joined || !me.tile) return false;
    if (!me.presenter || !this.grid(me.area).isStage(me.tile)) {
      this.send(ws, { t: 'error', code: 'not_presenter' });
      return false;
    }
    const stageChanges = takeToken(
      me.stageChanges ?? { start: 0, count: 0 },
      now,
      STAGE_LIMITS.perMinute,
      60_000,
    );
    if (!stageChanges) {
      this.send(ws, { t: 'error', code: 'rate_limited' });
      return false;
    }
    this.save(ws, { ...me, stageChanges });
    return true;
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
    await this.loadTogether();
    const sockets = ids
      ? ids.flatMap((id) => this.ctx.getWebSockets(id))
      : this.ctx.getWebSockets();
    for (const ws of sockets) {
      this.send(ws, { t: 'error', code: why });
      this.leave(ws);
    }
  }

  /** What a person said here lately, newest last: evidence for a report. */
  async recentLines(id: string): Promise<{ text: string; at: number }[]> {
    return this.said
      .filter((line) => line.id === id)
      .slice(-REPORT_LINES_KEPT)
      .map(({ text, at }) => ({ text, at }));
  }

  /** Who has a socket in the room (joined or about to), once each: how a private room counts its people. */
  async occupants(): Promise<string[]> {
    return this.occupantIds();
  }

  private occupantIds(): string[] {
    return [
      ...new Set(
        this.ctx
          .getWebSockets()
          .map((ws) => this.load(ws)?.id)
          .filter((id): id is string => !!id),
      ),
    ];
  }

  /** Whether table games are played here: the smoking room, and private rooms that allow them. */
  private gamesHere(area: AreaId, kind: TableKind): boolean {
    if (area === 'smoking') return true;
    return isRoomArea(area) && (this.rules?.games ?? true) && ROOM_TABLE_GAMES.includes(kind);
  }

  /** Someone started over: everyone they were before leaves the room at once. */
  async kick(ids: readonly string[]): Promise<void> {
    await this.loadPlay();
    await this.loadTogether();
    for (const id of ids) for (const ws of this.ctx.getWebSockets(id)) this.leave(ws);
  }

  /** Wakes up to sweep quiet sockets, or sooner when the jukebox's song ends. */
  private async armSweep(): Promise<void> {
    const playing = this.jukebox?.now;
    const songEnd =
      playing?.seconds != null ? playing.startedAt + (playing.seconds + 4) * 1000 : Infinity;
    const stageEnd = this.stage?.until ?? Infinity;
    const wanted = Math.min(Date.now() + SWEEP_MS, songEnd, stageEnd);
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > wanted) await this.ctx.storage.setAlarm(wanted);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.loadPlay();
    await this.loadTogether();
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
        const study = message.status
          ? this.storeStudy(grid, tile, message.status, now, null)
          : NO_STUDY;
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
          lamps: [...(this.flippedLamps ?? [])],
          now,
          ...(me.area === 'conference'
            ? { stage: this.stage ?? null, presenter: !!me.presenter }
            : {}),
          ...(countsForFocus(me.area)
            ? { candles: candles(this.focusLog ?? [], now), books: this.booksFor(joined) }
            : {}),
        });
        this.syncFocus(joined, now);
        this.broadcast({ t: 'joined', player: snapshot(joined, now) }, ws);
        // The hub trusts this, not the phone, about where the person is.
        void this.env.SOCIAL.getByName('hub').placed(me.id, me.area);
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
        // The stage is only for the host of the event on now (see `conferenceRole`).
        const grid = this.grid(me.area).withStageClosed(me.area === 'conference' && !me.presenter);
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
        const moved = { ...me, moves, tile: message.to, study, dancing: false, smoking: false };
        this.save(ws, moved);
        this.broadcast({ t: 'moved', id: me.id, to: message.to }, ws);
        this.syncFocus(moved, now);
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
        const study = this.storeStudy(
          this.grid(me.area),
          me.tile,
          message.status,
          now,
          me.study.timer,
        );
        this.save(ws, { ...me, statuses, study });
        this.broadcast({ t: 'status', id: me.id, status: publicStudy(study, now) });
        this.syncFocus({ ...me, study }, now);
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
        // Swearing again and again earns a short quiet: the next message waits a minute.
        let swears = me.swears ?? { start: 0, count: 0 };
        let lastSayAt = now;
        if (result.masked) {
          const left = takeToken(swears, now, SWEARS.count, SWEARS.windowMs);
          if (left) swears = left;
          else {
            lastSayAt = now + SWEARS.quietMs;
            this.send(ws, { t: 'error', code: 'swearing' });
          }
        }
        this.save(ws, { ...me, lastSayAt, swears });
        void this.ctx.storage.put(saidKey(me.id), lastSayAt);
        this.said.push({ id: me.id, text: result.text, at: now });
        if (this.said.length > SAID_KEPT) this.said.shift();
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
        const move = message.move ?? 0;
        if (!me.joined || (me.dancing === message.on && (!message.on || me.danceMove === move))) {
          return;
        }
        if (message.on && !AREA_RULES[me.area].dance) {
          return this.send(ws, { t: 'error', code: 'not_allowed' });
        }
        // One thing at a time: dancing puts the cigarette out.
        this.save(ws, { ...me, dancing: message.on, danceMove: move, smoking: false });
        if (me.smoking) this.broadcast({ t: 'smoked', id: me.id, on: false });
        this.broadcast({ t: 'danced', id: me.id, on: message.on, move });
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
      case 'lamp': {
        if (!me.joined || me.area !== 'library') return;
        const statuses = takeToken(me.statuses, now, STATUSES_PER_SECOND, 1000);
        const lamps = (this.flippedLamps ??= new Set());
        if (!statuses || lamps.has(message.index) === message.flipped) return;
        this.save(ws, { ...me, statuses });
        if (message.flipped) lamps.add(message.index);
        else lamps.delete(message.index);
        void this.ctx.storage.put(LAMPS_KEY, [...lamps]);
        this.broadcast({ t: 'lamped', index: message.index, flipped: message.flipped });
        return;
      }
      case 'afk': {
        if (!me.joined || me.afk === message.on) return;
        this.save(ws, { ...me, afk: message.on });
        this.broadcast({ t: 'afked', id: me.id, on: message.on });
        return;
      }
      case 'smoke': {
        if (!me.joined || me.smoking === message.on) return;
        if (message.on && !AREA_RULES[me.area].smoke) {
          return this.send(ws, { t: 'error', code: 'not_allowed' });
        }
        this.save(ws, { ...me, smoking: message.on, dancing: false });
        if (me.dancing) this.broadcast({ t: 'danced', id: me.id, on: false, move: 0 });
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
        const tableMoves = takeToken(
          me.tableMoves ?? { start: 0, count: 0 },
          now,
          TABLE_MOVES_PER_MINUTE,
          60_000,
        );
        if (!tableMoves) return this.send(ws, { t: 'error', code: 'rate_limited' });
        this.save(ws, { ...me, tableMoves });
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
        // It counts on the person's profile: the time the room saw it run, in places for studying.
        const minutes = countsForFocus(me.area) ? focusMinutes(timer, now) : 0;
        // Weighed over that measured stretch, before the finisher's own span in the log closes.
        const credit = blockCredit(
          this.focusLog ?? [],
          { id: me.id, acct: me.acct ?? me.id },
          minutes * 60_000,
          now,
        );
        this.broadcast({ t: 'status', id: me.id, status: publicStudy(study, now) });
        this.syncFocus({ ...me, study }, now);
        if (minutes > 0) void this.rewardBlock(ws, me, minutes, credit, now);
        return;
      }
      case 'rewardSeen': {
        void this.ctx.storage.delete(rewardKey(me.id));
        return;
      }
      case 'stageShow': {
        if (!this.mayPresent(ws, me, now)) return;
        const clean = cleanStage(message);
        if (!clean.ok) return this.send(ws, { t: 'error', code: clean.error });
        return this.setStage(
          {
            kind: clean.kind,
            src: clean.src,
            caption: clean.caption,
            by: me.id,
            byName: me.name,
            startedAt: now,
            pausedAt: null,
            until: me.stageUntil ?? null,
          },
          now,
        );
      }
      case 'stageControl': {
        if (!this.stage || !this.mayPresent(ws, me, now)) return;
        return this.setStage(controlStage(this.stage, message, now), now);
      }
      case 'stageClear': {
        if (!this.stage || !this.mayPresent(ws, me, now)) return;
        return this.setStage(null, now);
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

  /* ---------- Studying together: the focus log, candles, books, rewards ---------- */

  /** Loads the focus log and the books once per wake-up. */
  private async loadTogether(): Promise<void> {
    if (this.focusLog && this.books) return;
    const stored = await this.ctx.storage.get<FocusSpan[] | Book[]>([FOCUS_KEY, BOOKS_KEY]);
    const now = Date.now();
    this.focusLog ??= pruneLog((stored.get(FOCUS_KEY) as FocusSpan[] | undefined) ?? [], now);
    this.books ??= pruneBooks((stored.get(BOOKS_KEY) as Book[] | undefined) ?? [], now);
  }

  /**
   * Keeps the log in step with one person: a stretch of focus is open while
   * they sit at a table's chair with a timer running, and closes when they
   * stand up, stop, finish or leave. Everyone is told when a table's candle changes.
   */
  private syncFocus(me: Connection, now: number): void {
    const log = this.focusLog;
    if (!log || !countsForFocus(me.area)) return;
    const timer = me.study.timer;
    const seat = me.joined && me.tile && timer && timer.endsAt > now ? me.tile : null;
    const table = seat ? tableOfSeat(me.area, seat) : null;
    const open = log.find((s) => s.id === me.id && s.end === null);
    const sameSeat = open && seat && open.seat.x === seat.x && open.seat.y === seat.y;
    let changed = false;
    if (open && sameSeat && timer) {
      // A new timer at the same chair (the next round, a longer block) carries on.
      if (open.until === timer.endsAt) return;
      open.until = timer.endsAt;
      changed = true;
    } else {
      if (open) {
        open.end = Math.min(now, open.until);
        changed = true;
      }
      if (seat && timer && table !== null) {
        log.push({
          seat: { ...seat },
          table,
          acct: me.acct ?? me.id,
          id: me.id,
          name: me.name,
          top: me.look?.top ?? -1,
          start: now,
          end: null,
          until: timer.endsAt,
        });
        changed = true;
      }
    }
    if (!changed) return;
    this.focusLog = pruneLog(log, now);
    void this.ctx.storage.put(FOCUS_KEY, this.focusLog);
    this.broadcast({ t: 'candles', candles: candles(this.focusLog, now) });
  }

  /** Stretches left open by people no longer in the room (a socket that vanished while it slept). */
  private closeAbsentFocus(now: number): void {
    const log = this.focusLog;
    if (!log) return;
    const here = new Set(
      this.ctx
        .getWebSockets()
        .map((ws) => this.load(ws))
        .filter((c): c is Connection => !!c?.joined)
        .map((c) => c.id),
    );
    const gone = log.filter((s) => s.end === null && !here.has(s.id));
    for (const span of gone) span.end = Math.min(now, span.until);
    const pruned = pruneLog(log, now);
    if (gone.length === 0 && pruned.length === log.length) return;
    this.focusLog = pruned;
    void this.ctx.storage.put(FOCUS_KEY, pruned);
    if (gone.length > 0) this.broadcast({ t: 'candles', candles: candles(pruned, now) });
  }

  /** How many people focus at a table here now; asked by the hall during a table hour. */
  async focusingNow(): Promise<number> {
    await this.loadTogether();
    const now = Date.now();
    return candles(this.focusLog ?? [], now).reduce((sum, c) => sum + candleCount(c, now), 0);
  }

  /** The books on the tables, as one person may see them. */
  private booksFor(viewer: Connection): BookView[] {
    const circle = {
      id: viewer.id,
      friends: new Set(viewer.friends ?? []),
      blocked: new Set(viewer.blocked ?? []),
    };
    return pruneBooks(this.books ?? [], Date.now()).flatMap((book) => {
      const view = viewBook(book, circle);
      return view ? [view] : [];
    });
  }

  /**
   * After the welcome: a reward card not yet seen (the connection dropped as
   * the block ended), and during a table hour how many sit at the library's tables.
   */
  private async welcomeTogether(ws: WebSocket, id: string): Promise<void> {
    const me = this.load(ws);
    if (!me?.joined) return;
    const reward = await this.ctx.storage.get<Reward>(rewardKey(id));
    if (reward && Date.now() - reward.at < REWARD_KEEP_MS) this.send(ws, { t: 'reward', reward });
    else if (reward) void this.ctx.storage.delete(rewardKey(id));
    if ((me.area !== 'hall' && me.area !== 'library') || !tableHourNow(Date.now())) return;
    const focusing =
      me.area === 'library'
        ? await this.focusingNow()
        : await this.env.AREAS.getByName('library').focusingNow();
    this.send(ws, { t: 'focusing', focusing });
  }

  /**
   * A finished block: counted on the profile (shared when a table-mate sat
   * through it), a book left on the table when it was long enough, and the
   * reward card for the finisher. Names on the card are friends' only, and
   * people either blocked never appear.
   */
  private async rewardBlock(
    ws: WebSocket,
    me: Connection,
    minutes: number,
    credit: ReturnType<typeof blockCredit>,
    now: number,
  ): Promise<void> {
    const blocked = new Set(me.blocked ?? []);
    const friends = new Set(me.friends ?? []);
    const spans = this.focusLog ?? [];
    const mateSpan = (id: string) => [...spans].reverse().find((s) => s.id === id);
    const shared = credit.shared.filter((id) => !blocked.has(id));
    const beside = credit.beside.filter((id) => !blocked.has(id));
    const { before, after } = await this.env.SOCIAL.getByName('hub').recordBlock(
      me.id,
      minutes,
      shared.length > 0,
    );
    const seat = credit.seen ? credit.seat : null;
    if (seat && this.books && mayLeaveBook(this.books, seat, minutes, now)) {
      const pair = shared[0] ? (mateSpan(shared[0])?.top ?? null) : null;
      this.leaveBook({
        id: crypto.randomUUID().slice(0, 8),
        seat,
        top: me.look?.top ?? -1,
        pair,
        minutes,
        at: now,
        by: me.id,
        name: me.name,
      });
    }
    const reward: Reward = {
      minutes,
      shared: shared.length > 0,
      mates: beside.map((id) => ({
        id,
        name: friends.has(id) ? (mateSpan(id)?.name ?? null) : null,
      })),
      at: now,
      before,
      after,
    };
    void this.ctx.storage.put(rewardKey(me.id), reward);
    this.send(ws, { t: 'reward', reward });
  }

  /** A book on the table: kept for the day and shown to everyone here, named for friends only. */
  private leaveBook(book: Book): void {
    this.books = [...pruneBooks(this.books ?? [], book.at), book];
    void this.ctx.storage.put(BOOKS_KEY, this.books);
    for (const ws of this.ctx.getWebSockets()) {
      const viewer = this.load(ws);
      if (!viewer?.joined) continue;
      const view = viewBook(book, {
        id: viewer.id,
        friends: new Set(viewer.friends ?? []),
        blocked: new Set(viewer.blocked ?? []),
      });
      if (view) this.send(ws, { t: 'book', book: view });
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
    this.storeTable(kind, record);
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
      void this.env.SOCIAL.getByName('hub').unplaced(me.id, me.area);
      this.syncFocus({ ...me, joined: false }, Date.now());
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
  private storeStudy(
    grid: AreaGrid,
    tile: Point,
    status: StudyStatus,
    now: number,
    kept: StoredStudy['timer'],
  ): StoredStudy {
    const endsAt = status.timer ? now + status.timer.remainingMs : 0;
    return {
      activity: grid.seatFacing(tile) ? status.activity : null,
      // Which block of a session it is travels too, for "2 of 4" by the name.
      round: status.timer ? (status.round ?? null) : null,
      timer: status.timer
        ? {
            endsAt,
            totalMs: status.timer.totalMs,
            // When the server first saw this block: the client's claims never move it.
            startedAt: blockStart(kept, { endsAt, totalMs: status.timer.totalMs }, now),
          }
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
      if (ws === except) continue;
      const them = this.load(ws);
      if (them?.joined && !this.hiddenFrom?.has(them.id)) this.trySend(ws, data);
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
    danceMove: c.danceMove ?? 0,
    afk: c.afk ?? false,
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
