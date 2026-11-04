import {
  AREA_RULES,
  type Appearance,
  isValidAppearance,
  conferenceEnd,
  conferenceRole,
  type ConferenceRole,
  THEME_IDS,
  type ThemeId,
  blockKind,
  DATA_EPOCH,
  PASSWORD_TRIES,
  FIND_LIMIT,
  FRIEND_REQUESTS,
  type FoundPerson,
  checkProposal,
  cleanDm,
  cleanOffset,
  cleanRoomRules,
  DEFAULT_ROOM_RULES,
  EVENT_LIMITS,
  longestStreak,
  periodStarts,
  SHOUT_HISTORY,
  SHOUT_MAX_CHARS,
  BLOCK_KINDS,
  type BlockKind,
  type Profile,
  type ProposedEvent,
  type Role,
  type RoomRules,
  type Shout,
  DM_HISTORY,
  friendPair,
  HEARTBEAT,
  isStale,
  MAX_FRIENDS,
  MAX_WAITING_PETS,
  makeRoomCode,
  ROOM_IDLE_MS,
  roomArea,
  type RoomInfo,
  type RoomSize,
  parseSocialMessage,
  type AreaId,
  type DirectMessage,
  type Friend,
  type PetKind,
  type SocialClientMessage,
  type SocialServerMessage,
  type WaitingPet,
} from '@att/shared';
import { DurableObject } from 'cloudflare:workers';
import { doorTag, emailListed } from './accounts';
import type { Env } from './env';
import { takeToken, type RateWindow } from './rate-limit';

/** Per-socket state, kept in the attachment so it survives hibernation. */
type Member = {
  id: string;
  name: string;
  area: AreaId | null;
  /** Sitting at a table, as told by the player. */
  studying?: boolean;
  /** The pet walking along; it waits at the library door while its person studies. */
  pet?: PetKind | null;
  /** How the pet looks, for drawing it at the door. */
  petLook?: Pick<WaitingPet, 'petColor' | 'petSex' | 'petAccessory'>;
  /** Their character's look, for a face in name searches. */
  look?: Appearance;
  /** When the socket connected, for telling vanished ones apart (see `alarm`). */
  since?: number;
  /** The access code's tag when it connected: a deploy changes the code and sends it out. */
  door?: string;
  /** The private room they are in, if any. */
  room?: string | undefined;
  /** Their status lines in short, for friends' phones. */
  lines?: Pick<Friend, 'vibe' | 'mood' | 'doing' | 'note'>;
  /** Minutes their clock is ahead of UTC. */
  tz?: number;
  changes: RateWindow;
  messages: RateWindow;
};

type FriendRow = {
  other: string;
  name: string;
  accepted: number;
  requested_by: string;
  seen_at: number;
};

type MessageRow = { id: number; sender: string; text: string; at: number };

/** Friend requests and removals per person per minute. */
const CHANGES_PER_MINUTE = 10;
/** Phone messages per person per 10 seconds: quick replies, but no flooding. */
const MESSAGES_PER_WINDOW = 8;
const MESSAGE_WINDOW_MS = 10_000;
/** Building-wide counts go out at most this often, however busy it gets. */
const WORLD_EVERY_MS = 1_500;
/** How often sockets that went quiet are looked for while anyone is connected. */
const SWEEP_MS = 30_000;
/** Rooms one person may open per hour, so nobody fills the reception. */
const ROOMS_PER_HOUR = 5;

type RoomRow = {
  code: string;
  name: string;
  size: number;
  password: string | null;
  owner: string;
  used_at: number;
  rules: string | null;
};

const ROOM_COLUMNS = 'code, name, size, password, owner, used_at, rules';

type EventRow = {
  id: string;
  title: string;
  description: string;
  area: string;
  start: number;
  minutes: number;
  by: string;
  by_name: string;
  status: ProposedEvent['status'];
  theme: string | null;
};

/** Approved events stay listed this long after they ended. */
const EVENT_KEEP_MS = 24 * 60 * 60 * 1000;
/** How many focus blocks are read for someone's best streak. */
const STREAK_ROWS = 3000;
/** Characters per account. */
const MAX_CHARACTERS = 2;
/** The most a character's saved progress may weigh, as JSON. */
const SAVE_MAX = 32_000;

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** Passwords are kept only as a salted hash. */
async function hashPassword(code: string, password: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${code}:${password}`),
  );
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const SOCIAL_HEADERS = { id: 'x-user-id', name: 'x-user-name' } as const;

/**
 * One Durable Object for everyone's friends. Its SQLite storage keeps the
 * friendships, and every player keeps one socket open to it, so friends see
 * each other come online and change rooms anywhere in the building.
 */
export class SocialHub extends DurableObject<Env> {
  private readonly sql: SqlStorage;
  /** A socket being closed may still be listed for a moment; it no longer counts as online. */
  private closing: WebSocket | null = null;
  private worldTimer: ReturnType<typeof setTimeout> | null = null;
  /** Access password tries per address (kept while the hub is awake). */
  private readonly passwordTries = new Map<string, RateWindow>();
  /** Friend requests per person (kept while the hub is awake). */
  private readonly requestTries = new Map<string, RateWindow>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.startOverIfNeeded();
    // Heartbeats are answered without waking the hub; their time tells live sockets from gone ones.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(HEARTBEAT.ping, HEARTBEAT.pong));
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        seen_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS friends (
        a TEXT NOT NULL,
        b TEXT NOT NULL,
        accepted INTEGER NOT NULL DEFAULT 0,
        requested_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (a, b)
      );
      CREATE INDEX IF NOT EXISTS friends_by_b ON friends (b);
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        a TEXT NOT NULL,
        b TEXT NOT NULL,
        sender TEXT NOT NULL,
        text TEXT NOT NULL,
        at INTEGER NOT NULL,
        read INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS messages_by_pair ON messages (a, b, id);
      CREATE TABLE IF NOT EXISTS rooms (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        size INTEGER NOT NULL,
        password TEXT,
        owner TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        used_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS admins (id TEXT PRIMARY KEY, granted_by TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS blocks (
        blocker TEXT NOT NULL,
        blocked TEXT NOT NULL,
        at INTEGER NOT NULL,
        PRIMARY KEY (blocker, blocked)
      );
      CREATE INDEX IF NOT EXISTS blocks_by_blocked ON blocks (blocked);
      CREATE TABLE IF NOT EXISTS focus_blocks (
        user TEXT NOT NULL,
        minutes INTEGER NOT NULL,
        at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS focus_by_user ON focus_blocks (user, at);
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        area TEXT NOT NULL,
        start INTEGER NOT NULL,
        minutes INTEGER NOT NULL,
        by TEXT NOT NULL,
        by_name TEXT NOT NULL,
        status TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS shouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender TEXT NOT NULL,
        name TEXT NOT NULL,
        text TEXT NOT NULL,
        at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS room_bans (
        code TEXT NOT NULL,
        user TEXT NOT NULL,
        PRIMARY KEY (code, user)
      );
    `);
    // Accounts outlive data epochs: they are who people are, not what the building holds.
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        google_sub TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_login_at INTEGER NOT NULL,
        disabled INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        user_agent TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS characters (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        name TEXT NOT NULL,
        name_key TEXT NOT NULL UNIQUE,
        look TEXT NOT NULL,
        save TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS presence (
        account_id TEXT PRIMARY KEY,
        nonce TEXT NOT NULL,
        character_id TEXT NOT NULL,
        at INTEGER NOT NULL
      );
    `);
    // Columns added after the first tables were made; adding one twice fails, which is fine.
    for (const column of [
      'ALTER TABLE users ADD COLUMN created_at INTEGER',
      'ALTER TABLE users ADD COLUMN time_ms INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE users ADD COLUMN messages_sent INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE users ADD COLUMN tz INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE rooms ADD COLUMN rules TEXT',
      'ALTER TABLE events ADD COLUMN theme TEXT',
    ]) {
      try {
        this.sql.exec(column);
      } catch {
        // Already there.
      }
    }
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const id = request.headers.get(SOCIAL_HEADERS.id);
    const name = request.headers.get(SOCIAL_HEADERS.name);
    if (!id || !name) return new Response('missing session', { status: 400 });

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [id]);
    const member: Member = {
      id,
      name: decodeURIComponent(name),
      area: null,
      since: Date.now(),
      door: await this.doorTag(),
      changes: { start: 0, count: 0 },
      messages: { start: 0, count: 0 },
    };
    server.serializeAttachment(member);
    this.sql.exec(
      `INSERT INTO users (id, name, seen_at, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET name = excluded.name, seen_at = excluded.seen_at,
         created_at = COALESCE(users.created_at, excluded.created_at)`,
      id,
      member.name,
      Date.now(),
      Date.now(),
    );
    await this.armSweep();
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const message = typeof raw === 'string' ? parseSocialMessage(raw) : null;
    const stored = ws.deserializeAttachment() as Member | null;
    if (!message || !stored) return send(ws, { t: 'error', code: 'bad_message' });
    // A deploy changed the access code: whoever came in with the old one goes out.
    if (stored.door !== (await this.doorTag())) return this.leave(ws);
    // Sockets from before the phone have no message window yet.
    const me: Member = { ...stored, messages: stored.messages ?? { start: 0, count: 0 } };
    this.handle(ws, me, message);
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    this.leave(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.leave(ws);
  }

  /**
   * Drops sockets that went quiet: a phone put to sleep or a tab that vanished
   * without closing. They would otherwise count as "in the building" forever.
   */
  override async alarm(): Promise<void> {
    const now = Date.now();
    const door = await this.doorTag();
    for (const ws of this.ctx.getWebSockets()) {
      const me = ws.deserializeAttachment() as Member | null;
      const ping = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? null;
      if (!me || me.door !== door || isStale(now, me.since ?? 0, ping)) this.leave(ws);
    }
    if (this.ctx.getWebSockets().length > 0) await this.armSweep();
  }

  /**
   * A new data epoch starts the building over: every table is dropped once
   * and made again below, empty.
   */
  private startOverIfNeeded(): void {
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    const row = this.sql
      .exec<{ value: string }>("SELECT value FROM meta WHERE key = 'epoch'")
      .toArray()[0];
    if (Number(row?.value ?? 1) >= DATA_EPOCH) return;
    for (const table of [
      'users',
      'friends',
      'messages',
      'rooms',
      'admins',
      'blocks',
      'focus_blocks',
      'events',
      'shouts',
      'room_bans',
    ]) {
      this.sql.exec(`DROP TABLE IF EXISTS ${table}`);
    }
    this.sql.exec(
      "INSERT INTO meta (key, value) VALUES ('epoch', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      String(DATA_EPOCH),
    );
  }

  /** One more try at the access password from an address; false once it tried too often. */
  private doorTagValue: string | null = null;

  /** The current access code's tag (see `doorTag` in accounts.ts). */
  private async doorTag(): Promise<string> {
    this.doorTagValue ??= await doorTag(this.env.ACCESS_PASSWORD);
    return this.doorTagValue;
  }

  /* ---------- Accounts, sessions and characters ---------- */

  /** Finds the account for a Google user, or makes one; its id. */
  async signIn(user: { sub: string; email: string; name: string }): Promise<string | null> {
    const now = Date.now();
    const found = this.sql
      .exec<{ id: string; disabled: number }>(
        'SELECT id, disabled FROM accounts WHERE google_sub = ?',
        user.sub,
      )
      .toArray()[0];
    if (found) {
      if (found.disabled) return null;
      this.sql.exec(
        'UPDATE accounts SET email = ?, name = ?, last_login_at = ? WHERE id = ?',
        user.email,
        user.name.slice(0, 60),
        now,
        found.id,
      );
      return found.id;
    }
    const id = crypto.randomUUID();
    this.sql.exec(
      'INSERT INTO accounts (id, google_sub, email, name, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      user.sub,
      user.email,
      user.name.slice(0, 60),
      now,
      now,
    );
    return id;
  }

  async createSession(
    accountId: string,
    sessionId: string,
    userAgent: string,
    ms: number,
  ): Promise<void> {
    const now = Date.now();
    this.sql.exec(
      'INSERT INTO sessions (id, account_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)',
      sessionId,
      accountId,
      now,
      now + ms,
      userAgent.slice(0, 200),
    );
  }

  /** The account behind a session, sliding its end along; null when gone or expired. */
  async sessionAccount(
    sessionId: string,
    ms: number,
  ): Promise<{ id: string; email: string; name: string } | null> {
    const now = Date.now();
    const row = this.sql
      .exec<{ id: string; email: string; name: string; expires_at: number; disabled: number }>(
        `SELECT a.id, a.email, a.name, s.expires_at, a.disabled
         FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.id = ?`,
        sessionId,
      )
      .toArray()[0];
    if (!row || row.disabled || row.expires_at < now) {
      if (row) this.sql.exec('DELETE FROM sessions WHERE id = ?', sessionId);
      return null;
    }
    // Slide once an hour at most, not on every request.
    if (row.expires_at - now < ms - 60 * 60_000) {
      this.sql.exec('UPDATE sessions SET expires_at = ? WHERE id = ?', now + ms, sessionId);
    }
    return { id: row.id, email: row.email, name: row.name };
  }

  async endSession(sessionId: string): Promise<void> {
    this.sql.exec('DELETE FROM sessions WHERE id = ?', sessionId);
  }

  /** An account's characters, with what the character select shows of each. */
  async charactersOf(
    accountId: string,
  ): Promise<
    { id: string; name: string; look: unknown; save: unknown; profile: Profile | null }[]
  > {
    return this.sql
      .exec<{ id: string; name: string; look: string; save: string }>(
        'SELECT id, name, look, save FROM characters WHERE account_id = ? ORDER BY created_at',
        accountId,
      )
      .toArray()
      .map((row) => ({
        id: row.id,
        name: row.name,
        look: parseJson(row.look),
        save: parseJson(row.save),
        profile: this.profile(row.id),
      }));
  }

  /** A new character for an account: at most two, and a name nobody else has. */
  async createCharacter(
    accountId: string,
    name: string,
    look: unknown,
  ): Promise<{ id: string } | { error: 'too_many' | 'name_taken' | 'invalid' }> {
    if (!isValidAppearance(look)) return { error: 'invalid' };
    const count = this.sql
      .exec<{ n: number }>('SELECT COUNT(*) AS n FROM characters WHERE account_id = ?', accountId)
      .toArray()[0]?.n;
    if ((count ?? 0) >= MAX_CHARACTERS) return { error: 'too_many' };
    const key = name.toLocaleLowerCase('tr');
    if (this.sql.exec('SELECT 1 FROM characters WHERE name_key = ?', key).toArray().length > 0) {
      return { error: 'name_taken' };
    }
    const id = crypto.randomUUID();
    this.sql.exec(
      'INSERT INTO characters (id, account_id, name, name_key, look, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      accountId,
      name,
      key,
      JSON.stringify(look),
      Date.now(),
    );
    return { id };
  }

  async deleteCharacter(accountId: string, id: string): Promise<boolean> {
    const done = this.sql.exec(
      'DELETE FROM characters WHERE id = ? AND account_id = ?',
      id,
      accountId,
    ).rowsWritten;
    if (done > 0) this.sql.exec('DELETE FROM presence WHERE character_id = ?', id);
    return done > 0;
  }

  /** A character of this account, or null. */
  async characterOf(accountId: string, id: string): Promise<{ id: string; name: string } | null> {
    return (
      this.sql
        .exec<{ id: string; name: string }>(
          'SELECT id, name FROM characters WHERE id = ? AND account_id = ?',
          id,
          accountId,
        )
        .toArray()[0] ?? null
    );
  }

  async setCharacterLook(accountId: string, id: string, look: unknown): Promise<boolean> {
    if (!isValidAppearance(look)) return false;
    return (
      this.sql.exec(
        'UPDATE characters SET look = ? WHERE id = ? AND account_id = ?',
        JSON.stringify(look),
        id,
        accountId,
      ).rowsWritten > 0
    );
  }

  /** What the character keeps between visits (focus totals, goals, tasks…), as the client sends it. */
  async saveCharacter(accountId: string, id: string, save: string): Promise<boolean> {
    if (save.length > SAVE_MAX) return false;
    return (
      this.sql.exec(
        'UPDATE characters SET save = ? WHERE id = ? AND account_id = ?',
        save,
        id,
        accountId,
      ).rowsWritten > 0
    );
  }

  /**
   * The account plays here now: a new presence replaces the one before it.
   * Returns the new presence's nonce and the characters to send out of the
   * building (all of the account's, if it was somewhere already).
   */
  async takePresence(
    accountId: string,
    characterId: string,
  ): Promise<{ nonce: string; previous: string[] }> {
    const before = this.sql
      .exec<{ character_id: string }>(
        'SELECT character_id FROM presence WHERE account_id = ?',
        accountId,
      )
      .toArray()[0];
    const nonce = crypto.randomUUID();
    this.sql.exec(
      `INSERT INTO presence (account_id, nonce, character_id, at) VALUES (?, ?, ?, ?)
       ON CONFLICT (account_id) DO UPDATE SET nonce = excluded.nonce, character_id = excluded.character_id, at = excluded.at`,
      accountId,
      nonce,
      characterId,
      Date.now(),
    );
    const previous = before
      ? this.sql
          .exec<{ id: string }>('SELECT id FROM characters WHERE account_id = ?', accountId)
          .toArray()
          .map((r) => r.id)
      : [];
    return { nonce, previous };
  }

  /** Whether a presence is still the account's current one. */
  async presenceIs(accountId: string, nonce: string): Promise<boolean> {
    return (
      this.sql
        .exec('SELECT 1 FROM presence WHERE account_id = ? AND nonce = ?', accountId, nonce)
        .toArray().length > 0
    );
  }

  async passwordTry(address: string): Promise<boolean> {
    const window = takeToken(
      this.passwordTries.get(address) ?? { start: 0, count: 0 },
      Date.now(),
      PASSWORD_TRIES,
      10 * 60_000,
    );
    if (!window) return false;
    this.passwordTries.set(address, window);
    return true;
  }

  /**
   * Someone started over: everyone they were before goes offline at once.
   * Returns the private rooms they were in, so those can let them go too.
   */
  async kick(ids: readonly string[]): Promise<string[]> {
    const rooms = new Set<string>();
    for (const id of ids) {
      for (const ws of this.ctx.getWebSockets(id)) {
        const room = (ws.deserializeAttachment() as Member | null)?.room;
        if (room) rooms.add(room);
        this.leave(ws);
      }
    }
    return [...rooms];
  }

  /** Opens a private room; null when this person opened too many lately. */
  async createRoom(
    owner: string,
    name: string,
    size: RoomSize,
    password: string | null,
    rules: RoomRules = DEFAULT_ROOM_RULES,
  ): Promise<RoomInfo | null> {
    const now = Date.now();
    const recent = this.sql
      .exec<{ n: number }>(
        'SELECT COUNT(*) AS n FROM rooms WHERE owner = ? AND created_at > ?',
        owner,
        now - 60 * 60_000,
      )
      .one().n;
    if (recent >= ROOMS_PER_HOUR) return null;
    this.sql.exec('DELETE FROM rooms WHERE used_at < ?', now - ROOM_IDLE_MS);
    let code = makeRoomCode();
    while (this.sql.exec('SELECT 1 FROM rooms WHERE code = ?', code).toArray().length) {
      code = makeRoomCode();
    }
    const hash = password ? await hashPassword(code, password) : null;
    this.sql.exec(
      'INSERT INTO rooms (code, name, size, password, owner, created_at, used_at, rules) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      code,
      name,
      size,
      hash,
      owner,
      now,
      now,
      JSON.stringify(rules),
    );
    return { code, name, size, locked: hash !== null, people: 0, owner, rules };
  }

  /** A room by its code, with how many people are inside; null when there is none. */
  async roomInfo(code: string): Promise<RoomInfo | null> {
    const row = this.roomRow(code);
    return row ? this.info(row) : null;
  }

  /**
   * Whether someone may come into a room: 'ok', 'unknown' (no such room or
   * forgotten) or 'password' (missing or wrong). Coming in keeps it alive.
   */
  async checkRoom(
    code: string,
    password: string | null,
    user: string,
  ): Promise<'ok' | 'unknown' | 'password' | 'banned'> {
    const row = this.roomRow(code);
    if (!row) return 'unknown';
    if (this.isBanned(code, user)) return 'banned';
    if (row.password && (!password || (await hashPassword(code, password)) !== row.password)) {
      return 'password';
    }
    this.sql.exec('UPDATE rooms SET used_at = ? WHERE code = ?', Date.now(), code);
    return 'ok';
  }

  /** Rooms without a password, for the reception: the liveliest first. */
  async openRooms(): Promise<RoomInfo[]> {
    const rows = this.sql
      .exec<RoomRow>(
        `SELECT ${ROOM_COLUMNS} FROM rooms WHERE password IS NULL AND used_at > ? ORDER BY used_at DESC LIMIT 40`,
        Date.now() - ROOM_IDLE_MS,
      )
      .toArray();
    return rows.map((row) => this.info(row)).sort((a, b) => b.people - a.people);
  }

  private roomRow(code: string): RoomRow | null {
    return (
      this.sql
        .exec<RoomRow>(
          `SELECT ${ROOM_COLUMNS} FROM rooms WHERE code = ? AND used_at > ?`,
          code,
          Date.now() - ROOM_IDLE_MS,
        )
        .toArray()[0] ?? null
    );
  }

  private info(row: RoomRow): RoomInfo {
    const people = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      const member = ws.deserializeAttachment() as Member | null;
      if (member?.room === row.code && member.area === roomArea(row.size as RoomSize)) {
        people.add(member.id);
      }
    }
    return {
      code: row.code,
      name: row.name,
      size: row.size as RoomSize,
      locked: row.password !== null,
      people: people.size,
      owner: row.owner,
      rules: cleanRoomRules(row.rules ? JSON.parse(row.rules) : null),
    };
  }

  private async armSweep(): Promise<void> {
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + SWEEP_MS);
    }
  }

  private handle(ws: WebSocket, me: Member, message: SocialClientMessage): void {
    if (message.t === 'where') {
      const lines = {
        vibe: message.vibe ?? null,
        mood: message.mood ?? null,
        doing: message.doing ?? null,
        note: message.note?.slice(0, 80) ?? '',
      };
      const next: Member = {
        ...me,
        area: message.area,
        studying: message.studying ?? false,
        pet: message.pet ?? null,
        ...(message.room ? { room: message.room } : { room: undefined }),
        petLook: {
          petColor: message.petColor,
          petSex: message.petSex,
          petAccessory: message.petAccessory,
        },
        ...(message.look && isValidAppearance(message.look) ? { look: message.look } : {}),
        lines,
        tz: cleanOffset(message.tz),
      };
      ws.serializeAttachment(next);
      if (message.tz !== undefined) {
        this.sql.exec('UPDATE users SET tz = ? WHERE id = ?', next.tz ?? 0, me.id);
      }
      // The first "where" of a socket: who the player is, the building's chat and the calendar.
      if (!me.area) {
        this.sendMe(me.id);
        send(ws, { t: 'shouts', lines: this.recentShouts(me.id) });
        send(ws, { t: 'events', events: this.eventsFor(me.id) });
      }
      this.tellWorld();
      const moved = me.area !== message.area;
      // Friends' phones show where they are, whether they study and how they are.
      const visible = (m: Member) =>
        JSON.stringify([m.area, m.studying ?? false, m.room ?? null, m.lines ?? null]);
      if (moved || !me.area) this.sendList(me.id);
      if (moved || !me.area || visible(me) !== visible(next)) this.tellFriends(me.id);
      return;
    }
    if (message.t === 'find') return this.find(ws, me, message.q);
    if (message.t === 'dm') return this.dm(ws, me, message.to, message.text);
    if (message.t === 'history') return this.history(ws, me.id, message.with);
    if (message.t === 'read') {
      this.markRead(me.id, message.with);
      return this.sendList(me.id);
    }
    if (message.t === 'buzz') return this.buzz(ws, me, message.to);
    if (message.t === 'shout') return this.shout(ws, me, message.text);
    if (message.t === 'profile') {
      const profile = this.profile(message.id);
      return profile
        ? send(ws, { t: 'profile', profile })
        : send(ws, { t: 'error', code: 'unknown_user' });
    }
    if (message.t === 'propose') return this.propose(ws, me, message);
    if (message.t === 'review') return this.review(ws, me, message.id, message.verdict);
    if (message.t === 'role') return this.setRole(ws, me, message.id, message.admin);
    if (message.t === 'admins') {
      if (!this.isAdmin(me.id)) return send(ws, { t: 'error', code: 'forbidden' });
      return send(ws, { t: 'admins', admins: this.adminList() });
    }
    if (message.t === 'roomRules')
      return void this.setRoomRules(ws, me, message.code, message.rules);
    if (message.t === 'roomOut')
      return void this.sendOut(ws, me, message.code, message.id, message.ban);
    if (message.t === 'roomUnban') {
      if (!this.ownsRoom(me.id, message.code)) return send(ws, { t: 'error', code: 'forbidden' });
      this.sql.exec('DELETE FROM room_bans WHERE code = ? AND user = ?', message.code, message.id);
      return send(ws, { t: 'roomBans', code: message.code, banned: this.bannedFrom(message.code) });
    }
    if (message.t === 'roomBans') {
      if (!this.ownsRoom(me.id, message.code)) return send(ws, { t: 'error', code: 'forbidden' });
      return send(ws, { t: 'roomBans', code: message.code, banned: this.bannedFrom(message.code) });
    }
    if (message.t === 'roomClose') return void this.closeRoom(ws, me, message.code);
    const changes = takeToken(me.changes, Date.now(), CHANGES_PER_MINUTE, 60_000);
    if (!changes) return send(ws, { t: 'error', code: 'rate_limited' });
    ws.serializeAttachment({ ...me, changes });
    if (message.t === 'befriend') this.befriend(ws, me, message.to);
    else if (message.t === 'unfriend') this.unfriend(me.id, message.id);
    else if (message.t === 'block') this.block(me, message.to);
    else if (message.t === 'unblock') {
      this.sql.exec('DELETE FROM blocks WHERE blocker = ? AND blocked = ?', me.id, message.id);
      this.sendMe(me.id);
    }
  }

  /**
   * Everyone in the building whose name holds the search (any case, Turkish
   * letters too), so a friend can be found in a crowd by name. People who
   * blocked each other never show.
   */
  private find(ws: WebSocket, me: Member, q: string): void {
    const want = q.trim().toLocaleLowerCase('tr');
    if (!want) return;
    const people = new Map<string, FoundPerson>();
    const friends = new Set(
      this.list(me.id)
        .filter((f) => f.state === 'friend')
        .map((f) => f.id),
    );
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === this.closing) continue;
      const member = socket.deserializeAttachment() as Member | null;
      if (!member?.area || member.id === me.id || people.has(member.id)) continue;
      if (!member.name.toLocaleLowerCase('tr').includes(want)) continue;
      if (this.blockedBetween(me.id, member.id)) continue;
      people.set(member.id, {
        id: member.id,
        name: member.name,
        area: member.area,
        friend: friends.has(member.id),
        ...(member.look ? { look: member.look } : {}),
      });
      if (people.size >= FIND_LIMIT) break;
    }
    send(ws, { t: 'found', q, people: [...people.values()] });
  }

  private befriend(ws: WebSocket, me: Member, to: string): void {
    if (to === me.id) return;
    // Friend requests are rate-limited, so a name search cannot be used to spam.
    const window = takeToken(
      this.requestTries.get(me.id) ?? { start: 0, count: 0 },
      Date.now(),
      FRIEND_REQUESTS.count,
      FRIEND_REQUESTS.windowMs,
    );
    if (!window) return send(ws, { t: 'error', code: 'rate_limited' });
    this.requestTries.set(me.id, window);
    if (this.blockedBetween(me.id, to)) return send(ws, { t: 'error', code: 'blocked' });
    const them = this.sql
      .exec<{ name: string }>('SELECT name FROM users WHERE id = ?', to)
      .toArray()[0];
    if (!them) return send(ws, { t: 'error', code: 'unknown_user' });
    const [a, b] = friendPair(me.id, to);
    const row = this.sql
      .exec<{ accepted: number; requested_by: string }>(
        'SELECT accepted, requested_by FROM friends WHERE a = ? AND b = ?',
        a,
        b,
      )
      .toArray()[0];

    if (row?.accepted || row?.requested_by === me.id) return this.sendList(me.id);
    if (row) {
      // They asked first, so asking back accepts.
      this.sql.exec('UPDATE friends SET accepted = 1 WHERE a = ? AND b = ?', a, b);
      this.sendTo(to, { t: 'friendEvent', kind: 'accepted', id: me.id, name: me.name });
    } else {
      if (this.countFor(me.id) >= MAX_FRIENDS || this.countFor(to) >= MAX_FRIENDS) {
        return send(ws, { t: 'error', code: 'too_many' });
      }
      this.sql.exec(
        'INSERT INTO friends (a, b, accepted, requested_by, created_at) VALUES (?, ?, 0, ?, ?)',
        a,
        b,
        me.id,
        Date.now(),
      );
      this.sendTo(to, { t: 'friendEvent', kind: 'request', id: me.id, name: me.name });
    }
    this.sendList(me.id);
    this.sendList(to);
  }

  private dm(ws: WebSocket, me: Member, to: string, raw: string): void {
    if (me.area && !AREA_RULES[me.area].phone) {
      return send(ws, { t: 'error', code: 'phone_silent' });
    }
    if (this.blockedBetween(me.id, to)) return send(ws, { t: 'error', code: 'blocked' });
    if (!this.areFriends(me.id, to)) return send(ws, { t: 'error', code: 'not_friends' });
    const messages = takeToken(me.messages, Date.now(), MESSAGES_PER_WINDOW, MESSAGE_WINDOW_MS);
    if (!messages) return send(ws, { t: 'error', code: 'rate_limited' });
    ws.serializeAttachment({ ...me, messages });
    const clean = cleanDm(raw);
    if (!clean.ok) {
      if (clean.reason === 'link') send(ws, { t: 'error', code: 'link_blocked' });
      return;
    }

    const [a, b] = friendPair(me.id, to);
    const at = Date.now();
    const row = this.sql
      .exec<{ id: number }>(
        'INSERT INTO messages (a, b, sender, text, at) VALUES (?, ?, ?, ?, ?) RETURNING id',
        a,
        b,
        me.id,
        clean.text,
        at,
      )
      .one();
    // Keep only the newest messages of each conversation.
    this.sql.exec(
      `DELETE FROM messages WHERE a = ? AND b = ? AND id <= (
         SELECT id FROM messages WHERE a = ? AND b = ? ORDER BY id DESC LIMIT 1 OFFSET ?
       )`,
      a,
      b,
      a,
      b,
      DM_HISTORY,
    );
    this.sql.exec('UPDATE users SET messages_sent = messages_sent + 1 WHERE id = ?', me.id);
    const message: DirectMessage = { id: row.id, from: me.id, to, text: clean.text, at };
    this.sendTo(me.id, { t: 'dm', message });
    this.sendTo(to, { t: 'dm', message });
    this.sendList(to);
  }

  private history(ws: WebSocket, me: string, other: string): void {
    if (!this.areFriends(me, other)) return send(ws, { t: 'error', code: 'not_friends' });
    const [a, b] = friendPair(me, other);
    const messages = this.sql
      .exec<MessageRow>(
        `SELECT id, sender, text, at FROM (
           SELECT id, sender, text, at FROM messages WHERE a = ? AND b = ? ORDER BY id DESC LIMIT ?
         ) ORDER BY id`,
        a,
        b,
        DM_HISTORY,
      )
      .toArray()
      .map((row) => ({
        id: row.id,
        from: row.sender,
        to: row.sender === me ? other : me,
        text: row.text,
        at: row.at,
      }));
    const seenUpTo =
      this.sql
        .exec<{ id: number | null }>(
          'SELECT MAX(id) AS id FROM messages WHERE a = ? AND b = ? AND sender = ? AND read = 1',
          a,
          b,
          me,
        )
        .toArray()[0]?.id ?? 0;
    send(ws, { t: 'history', with: other, messages, seenUpTo });
    this.markRead(me, other);
    this.sendList(me);
  }

  /** Marks what the other sent as read, and tells them how far it was read. */
  private markRead(me: string, other: string): void {
    const [a, b] = friendPair(me, other);
    const newest = this.sql
      .exec<{ id: number | null }>(
        'SELECT MAX(id) AS id FROM messages WHERE a = ? AND b = ? AND sender = ? AND read = 0',
        a,
        b,
        other,
      )
      .toArray()[0]?.id;
    if (!newest) return;
    this.sql.exec(
      'UPDATE messages SET read = 1 WHERE a = ? AND b = ? AND sender = ? AND read = 0',
      a,
      b,
      other,
    );
    this.sendTo(other, { t: 'seen', by: me, upTo: newest });
  }

  /** A buzz on a friend's phone: "come say hi". It shares the messages' budget. */
  private buzz(ws: WebSocket, me: Member, to: string): void {
    if (!this.areFriends(me.id, to)) return send(ws, { t: 'error', code: 'not_friends' });
    const messages = takeToken(me.messages, Date.now(), MESSAGES_PER_WINDOW, MESSAGE_WINDOW_MS);
    if (!messages) return send(ws, { t: 'error', code: 'rate_limited' });
    ws.serializeAttachment({ ...me, messages });
    this.sendTo(to, { t: 'buzzed', from: me.id, name: me.name });
  }

  private areFriends(me: string, other: string): boolean {
    const [a, b] = friendPair(me, other);
    return (
      this.sql
        .exec<{ accepted: number }>('SELECT accepted FROM friends WHERE a = ? AND b = ?', a, b)
        .toArray()[0]?.accepted === 1
    );
  }

  /** Unread phone messages per sender. */
  private unreadFor(id: string): Map<string, number> {
    const rows = this.sql
      .exec<{ sender: string; n: number }>(
        `SELECT sender, COUNT(*) AS n FROM messages
         WHERE (a = ? OR b = ?) AND sender != ? AND read = 0
         GROUP BY sender`,
        id,
        id,
        id,
      )
      .toArray();
    return new Map(rows.map((row) => [row.sender, row.n]));
  }

  private unfriend(me: string, other: string): void {
    const [a, b] = friendPair(me, other);
    this.sql.exec('DELETE FROM friends WHERE a = ? AND b = ?', a, b);
    // A conversation belongs to the friendship and goes with it.
    this.sql.exec('DELETE FROM messages WHERE a = ? AND b = ?', a, b);
    this.sendList(me);
    this.sendList(other);
  }

  private leave(ws: WebSocket): void {
    const me = ws.deserializeAttachment() as Member | null;
    try {
      ws.close();
    } catch {
      // Already closed.
    }
    if (!me) return;
    const now = Date.now();
    // Time in the building counts from when this socket came in.
    const stayed = me.since ? Math.min(now - me.since, 24 * 60 * 60 * 1000) : 0;
    this.sql.exec(
      'UPDATE users SET seen_at = ?, time_ms = time_ms + ? WHERE id = ?',
      now,
      Math.max(0, stayed),
      me.id,
    );
    this.closing = ws;
    this.tellFriends(me.id);
    this.closing = null;
    this.tellWorld();
  }

  /**
   * Soon tells everyone how many people are in the building and how many of
   * them study, batching changes that come close together.
   */
  private tellWorld(): void {
    this.worldTimer ??= setTimeout(() => {
      this.worldTimer = null;
      const online = new Set<string>();
      const studying = new Set<string>();
      const waiting = new Map<string, WaitingPet>();
      const sockets = this.ctx.getWebSockets();
      for (const ws of sockets) {
        const member = ws.deserializeAttachment() as Member | null;
        if (!member?.area || ws.readyState !== WebSocket.OPEN) continue;
        online.add(member.id);
        if (member.studying) studying.add(member.id);
        if (member.area === 'library' && member.pet && waiting.size < MAX_WAITING_PETS) {
          waiting.set(member.id, {
            id: member.id,
            name: member.name,
            pet: member.pet,
            ...member.petLook,
          });
        }
      }
      const data = JSON.stringify({
        t: 'world',
        online: online.size,
        studying: studying.size,
        waiting: [...waiting.values()],
      } satisfies SocialServerMessage);
      for (const ws of sockets) {
        try {
          ws.send(data);
        } catch {
          // Closing.
        }
      }
    }, WORLD_EVERY_MS);
  }

  private countFor(id: string): number {
    const row = this.sql
      .exec<{ n: number }>('SELECT COUNT(*) AS n FROM friends WHERE a = ? OR b = ?', id, id)
      .toArray()[0];
    return row?.n ?? 0;
  }

  /** Everyone this person is friends with, or has a request with. */
  private rows(id: string): FriendRow[] {
    return this.sql
      .exec<FriendRow>(
        `SELECT u.id AS other, u.name AS name, f.accepted AS accepted,
                f.requested_by AS requested_by, u.seen_at AS seen_at
         FROM friends f JOIN users u ON u.id = CASE WHEN f.a = ? THEN f.b ELSE f.a END
         WHERE f.a = ? OR f.b = ?
         ORDER BY u.name`,
        id,
        id,
        id,
      )
      .toArray();
  }

  private list(id: string): Friend[] {
    const unread = this.unreadFor(id);
    return this.rows(id).map((row): Friend => {
      const state = row.accepted ? 'friend' : row.requested_by === id ? 'outgoing' : 'incoming';
      const base = { id: row.other, name: row.name, state, area: null, unread: 0 } as const;
      if (!row.accepted) return base;
      const member = this.presenceOf(row.other);
      if (!member?.area)
        return { ...base, unread: unread.get(row.other) ?? 0, seenAt: row.seen_at };
      return {
        ...base,
        area: member.area,
        unread: unread.get(row.other) ?? 0,
        studying: member.studying ?? false,
        room: member.room ?? null,
        ...member.lines,
      };
    });
  }

  /** Someone as they are right now, from any of their open sockets. */
  private presenceOf(id: string): Member | null {
    for (const ws of this.ctx.getWebSockets(id)) {
      if (ws === this.closing) continue;
      const member = ws.deserializeAttachment() as Member | null;
      if (member?.area) return member;
    }
    return null;
  }

  private sendList(id: string): void {
    if (this.ctx.getWebSockets(id).length === 0) return;
    this.sendTo(id, { t: 'friends', friends: this.list(id) });
  }

  /** Online friends get a fresh list when someone comes, goes or changes rooms. */
  private tellFriends(id: string): void {
    for (const row of this.rows(id)) if (row.accepted) this.sendList(row.other);
  }

  /* ---------- Roles ---------- */

  /** The owners' characters: every character of an account whose email is in ADMIN_EMAILS. */
  private ownerIds(): string[] {
    return this.sql
      .exec<{ id: string; email: string }>(
        'SELECT c.id, a.email FROM characters c JOIN accounts a ON a.id = c.account_id',
      )
      .toArray()
      .filter((row) => emailListed(this.env.ADMIN_EMAILS, row.email))
      .map((row) => row.id);
  }

  /**
   * Whether `id` presents in the conference hall now (see `conferenceRole`),
   * and when what goes on the screen comes down by itself. The hall asks each
   * time someone changes the screen. `open` is a local server with no password.
   */
  async conferenceRole(
    id: string,
    open: boolean,
  ): Promise<{ role: ConferenceRole; until: number | null }> {
    const events = this.eventsFor(id);
    const now = Date.now();
    return {
      role: conferenceRole(id, events, now, { open: open || this.isAdmin(id) }),
      until: conferenceEnd(events, now),
    };
  }

  private isAdmin(id: string): boolean {
    return (
      this.ownerIds().includes(id) ||
      this.sql.exec('SELECT 1 FROM admins WHERE id = ?', id).toArray().length > 0
    );
  }

  private roleOf(id: string): Role {
    return this.isAdmin(id) ? 'admin' : 'user';
  }

  private adminList(): { id: string; name: string }[] {
    const ids = [
      ...new Set([
        ...this.ownerIds(),
        ...this.sql
          .exec<{ id: string }>('SELECT id FROM admins')
          .toArray()
          .map((r) => r.id),
      ]),
    ];
    return ids.map((id) => ({ id, name: this.nameOf(id) ?? id.slice(0, 8) }));
  }

  /** Admins make others admins; the owners set in ADMIN_IDS cannot be taken off. */
  private setRole(ws: WebSocket, me: Member, id: string, admin: boolean): void {
    if (!this.isAdmin(me.id)) return send(ws, { t: 'error', code: 'forbidden' });
    if (!this.nameOf(id)) return send(ws, { t: 'error', code: 'unknown_user' });
    if (admin) {
      this.sql.exec(
        'INSERT OR IGNORE INTO admins (id, granted_by, at) VALUES (?, ?, ?)',
        id,
        me.id,
        Date.now(),
      );
    } else {
      if (this.ownerIds().includes(id)) return send(ws, { t: 'error', code: 'forbidden' });
      this.sql.exec('DELETE FROM admins WHERE id = ?', id);
    }
    this.sendMe(id);
    this.sendTo(id, { t: 'events', events: this.eventsFor(id) });
    send(ws, { t: 'admins', admins: this.adminList() });
  }

  private sendMe(id: string): void {
    const blocked = this.sql
      .exec<{ id: string; name: string }>(
        `SELECT b.blocked AS id, COALESCE(u.name, '?') AS name
         FROM blocks b LEFT JOIN users u ON u.id = b.blocked WHERE b.blocker = ?`,
        id,
      )
      .toArray();
    this.sendTo(id, { t: 'me', role: this.roleOf(id), blocked });
  }

  private nameOf(id: string): string | null {
    return (
      this.sql.exec<{ name: string }>('SELECT name FROM users WHERE id = ?', id).toArray()[0]
        ?.name ?? null
    );
  }

  /* ---------- Blocking ---------- */

  /** Whether either of the two blocked the other. Also asked by the rooms, for pokes and invites. */
  async isBlocked(a: string, b: string): Promise<boolean> {
    return this.blockedBetween(a, b);
  }

  private blockedBetween(a: string, b: string): boolean {
    return (
      this.sql
        .exec(
          'SELECT 1 FROM blocks WHERE (blocker = ? AND blocked = ?) OR (blocker = ? AND blocked = ?)',
          a,
          b,
          b,
          a,
        )
        .toArray().length > 0
    );
  }

  /** Everyone a person blocked or was blocked by. */
  private blockSet(id: string): Set<string> {
    const rows = this.sql
      .exec<{ blocker: string; blocked: string }>(
        'SELECT blocker, blocked FROM blocks WHERE blocker = ? OR blocked = ?',
        id,
        id,
      )
      .toArray();
    return new Set(rows.map((r) => (r.blocker === id ? r.blocked : r.blocker)));
  }

  /** Blocking ends a friendship (and its conversation) and tells the other person. */
  private block(me: Member, to: string): void {
    if (to === me.id || !this.nameOf(to)) return;
    this.sql.exec(
      'INSERT OR IGNORE INTO blocks (blocker, blocked, at) VALUES (?, ?, ?)',
      me.id,
      to,
      Date.now(),
    );
    this.unfriend(me.id, to);
    this.sendMe(me.id);
    this.sendTo(to, { t: 'blockedBy', name: me.name });
  }

  /* ---------- Building-wide chat ---------- */

  private recentShouts(id: string): Shout[] {
    const hidden = this.blockSet(id);
    return this.sql
      .exec<{ id: number; sender: string; name: string; text: string; at: number }>(
        'SELECT id, sender, name, text, at FROM (SELECT * FROM shouts ORDER BY id DESC LIMIT ?) ORDER BY id',
        SHOUT_HISTORY,
      )
      .toArray()
      .filter((row) => !hidden.has(row.sender))
      .map((row) => ({ id: row.id, from: row.sender, name: row.name, text: row.text, at: row.at }));
  }

  /** A line for the whole building; the library listens but does not talk. */
  private shout(ws: WebSocket, me: Member, raw: string): void {
    if (me.area === 'library') return send(ws, { t: 'error', code: 'phone_silent' });
    const messages = takeToken(me.messages, Date.now(), MESSAGES_PER_WINDOW, MESSAGE_WINDOW_MS);
    if (!messages) return send(ws, { t: 'error', code: 'rate_limited' });
    ws.serializeAttachment({ ...me, messages });
    const clean = cleanDm(raw.slice(0, SHOUT_MAX_CHARS * 2));
    if (!clean.ok) {
      if (clean.reason === 'link') send(ws, { t: 'error', code: 'link_blocked' });
      return;
    }
    const text = clean.text.slice(0, SHOUT_MAX_CHARS);
    const at = Date.now();
    const row = this.sql
      .exec<{ id: number }>(
        'INSERT INTO shouts (sender, name, text, at) VALUES (?, ?, ?, ?) RETURNING id',
        me.id,
        me.name,
        text,
        at,
      )
      .one();
    this.sql.exec(
      'DELETE FROM shouts WHERE id <= (SELECT id FROM shouts ORDER BY id DESC LIMIT 1 OFFSET ?)',
      SHOUT_HISTORY,
    );
    this.sql.exec('UPDATE users SET messages_sent = messages_sent + 1 WHERE id = ?', me.id);
    const hidden = this.blockSet(me.id);
    const line: Shout = { id: row.id, from: me.id, name: me.name, text, at };
    const data = JSON.stringify({ t: 'shouted', line } satisfies SocialServerMessage);
    for (const socket of this.ctx.getWebSockets()) {
      const member = socket.deserializeAttachment() as Member | null;
      if (!member?.area || hidden.has(member.id)) continue;
      try {
        socket.send(data);
      } catch {
        // Closing.
      }
    }
  }

  /* ---------- Focus blocks and profiles ---------- */

  /** A focus block that really ran out (the room checked its timer). */
  async recordBlock(id: string, minutes: number): Promise<void> {
    const clean = Math.round(minutes);
    if (!Number.isFinite(clean) || clean < 1 || clean > 240) return;
    this.sql.exec(
      'INSERT INTO focus_blocks (user, minutes, at) VALUES (?, ?, ?)',
      id,
      clean,
      Date.now(),
    );
  }

  /** A person's own profile, for the character select screen (asked with their token). */
  async profileOf(id: string): Promise<Profile | null> {
    return this.profile(id);
  }

  private profile(id: string): Profile | null {
    const user = this.sql
      .exec<{
        name: string;
        created_at: number | null;
        seen_at: number;
        time_ms: number;
        messages_sent: number;
        tz: number;
      }>('SELECT name, created_at, seen_at, time_ms, messages_sent, tz FROM users WHERE id = ?', id)
      .toArray()[0];
    if (!user) return null;
    const now = Date.now();
    const starts = periodStarts(now, user.tz);
    const count = (since: number) =>
      this.sql
        .exec<{ n: number }>(
          'SELECT COUNT(*) AS n FROM focus_blocks WHERE user = ? AND at >= ?',
          id,
          since,
        )
        .one().n;
    const kinds = Object.fromEntries(BLOCK_KINDS.map((k) => [k, 0])) as Record<BlockKind, number>;
    let focusMs = 0;
    let total = 0;
    for (const row of this.sql
      .exec<{ minutes: number; n: number }>(
        'SELECT minutes, COUNT(*) AS n FROM focus_blocks WHERE user = ? GROUP BY minutes',
        id,
      )
      .toArray()) {
      kinds[blockKind(row.minutes)] += row.n;
      focusMs += row.minutes * row.n * 60_000;
      total += row.n;
    }
    const times = this.sql
      .exec<{ at: number }>(
        'SELECT at FROM focus_blocks WHERE user = ? ORDER BY at DESC LIMIT ?',
        id,
        STREAK_ROWS,
      )
      .toArray()
      .map((r) => r.at);
    // Time in the building so far, with the visit going on now.
    let current = 0;
    for (const ws of this.ctx.getWebSockets(id)) {
      const member = ws.deserializeAttachment() as Member | null;
      if (member?.since) current = Math.max(current, now - member.since);
    }
    return {
      id,
      name: user.name,
      role: this.roleOf(id),
      joinedAt: user.created_at ?? user.seen_at,
      online: this.presenceOf(id) !== null,
      blocks: {
        today: count(starts.today),
        week: count(starts.week),
        month: count(starts.month),
        year: count(starts.year),
        total,
      },
      kinds,
      focusMs,
      timeMs: user.time_ms + current,
      friends: this.rows(id).filter((r) => r.accepted).length,
      messages: user.messages_sent,
      bestStreak: longestStreak(times, user.tz),
    };
  }

  /* ---------- Proposed events ---------- */

  private eventRows(): EventRow[] {
    return this.sql
      .exec<EventRow>(
        'SELECT id, title, description, area, start, minutes, by, by_name, status, theme FROM events WHERE start + minutes * 60000 > ? ORDER BY start',
        Date.now() - EVENT_KEEP_MS,
      )
      .toArray();
  }

  /** Approved events for everyone; waiting ones for admins, and each proposer's own. */
  private eventsFor(id: string): ProposedEvent[] {
    const admin = this.isAdmin(id);
    return this.eventRows()
      .filter(
        (row) => row.status === 'approved' || admin || (row.by === id && row.status === 'pending'),
      )
      .map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        area: row.area as ProposedEvent['area'],
        start: row.start,
        minutes: row.minutes,
        by: row.by,
        byName: row.by_name,
        status: row.status,
        ...(row.theme && THEME_IDS.includes(row.theme as ThemeId)
          ? { theme: row.theme as ThemeId }
          : {}),
      }));
  }

  /** Everyone online gets the calendar again, as they may see it. */
  private tellEvents(): void {
    const told = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      const member = ws.deserializeAttachment() as Member | null;
      if (!member || told.has(member.id)) continue;
      told.add(member.id);
      this.sendTo(member.id, { t: 'events', events: this.eventsFor(member.id) });
    }
  }

  private propose(
    ws: WebSocket,
    me: Member,
    proposal: {
      title: string;
      description: string;
      area: ProposedEvent['area'];
      start: number;
      minutes: number;
      theme?: ThemeId | undefined;
    },
  ): void {
    const changes = takeToken(me.changes, Date.now(), CHANGES_PER_MINUTE, 60_000);
    if (!changes) return send(ws, { t: 'error', code: 'rate_limited' });
    ws.serializeAttachment({ ...me, changes });
    const title = proposal.title.trim().replace(/\s+/g, ' ');
    const description = proposal.description.trim().slice(0, EVENT_LIMITS.description);
    const clean = { ...proposal, title, description };
    if (
      checkProposal(clean, Date.now()) ||
      [title, description].some((text) => !cleanDm(text || 'x').ok)
    ) {
      return send(ws, { t: 'error', code: 'bad_event' });
    }
    const waiting = this.sql
      .exec<{ n: number }>(
        "SELECT COUNT(*) AS n FROM events WHERE by = ? AND status = 'pending'",
        me.id,
      )
      .one().n;
    if (waiting >= EVENT_LIMITS.pendingPerPerson)
      return send(ws, { t: 'error', code: 'too_many_events' });
    this.sql.exec(
      "INSERT INTO events (id, title, description, area, start, minutes, by, by_name, status, theme) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
      crypto.randomUUID(),
      title,
      description,
      clean.area,
      clean.start,
      clean.minutes,
      me.id,
      me.name,
      clean.theme ?? null,
    );
    this.tellEvents();
  }

  private review(
    ws: WebSocket,
    me: Member,
    id: string,
    verdict: 'approved' | 'rejected' | 'removed',
  ): void {
    if (!this.isAdmin(me.id)) return send(ws, { t: 'error', code: 'forbidden' });
    const row = this.sql.exec<EventRow>('SELECT * FROM events WHERE id = ?', id).toArray()[0];
    if (!row) return;
    if (verdict === 'removed') this.sql.exec('DELETE FROM events WHERE id = ?', id);
    else this.sql.exec('UPDATE events SET status = ? WHERE id = ?', verdict, id);
    if (verdict !== 'removed' && row.status === 'pending') {
      this.sendTo(row.by, { t: 'reviewed', title: row.title, verdict });
    }
    this.tellEvents();
  }

  /* ---------- Private rooms: the owner's controls ---------- */

  private ownsRoom(id: string, code: string): boolean {
    return this.roomRow(code)?.owner === id;
  }

  private isBanned(code: string, user: string): boolean {
    return (
      this.sql.exec('SELECT 1 FROM room_bans WHERE code = ? AND user = ?', code, user).toArray()
        .length > 0
    );
  }

  private bannedFrom(code: string): { id: string; name: string }[] {
    return this.sql
      .exec<{ id: string; name: string }>(
        `SELECT b.user AS id, COALESCE(u.name, '?') AS name FROM room_bans b
         LEFT JOIN users u ON u.id = b.user WHERE b.code = ?`,
        code,
      )
      .toArray();
  }

  private async setRoomRules(
    ws: WebSocket,
    me: Member,
    code: string,
    rules: RoomRules,
  ): Promise<void> {
    if (!this.ownsRoom(me.id, code)) return send(ws, { t: 'error', code: 'forbidden' });
    const clean = cleanRoomRules(rules);
    this.sql.exec('UPDATE rooms SET rules = ? WHERE code = ?', JSON.stringify(clean), code);
    await this.env.AREAS.getByName(`room:${code}`).setRules(clean);
  }

  private async sendOut(
    ws: WebSocket,
    me: Member,
    code: string,
    id: string,
    ban: boolean,
  ): Promise<void> {
    if (!this.ownsRoom(me.id, code) || id === me.id)
      return send(ws, { t: 'error', code: 'forbidden' });
    if (ban) this.sql.exec('INSERT OR IGNORE INTO room_bans (code, user) VALUES (?, ?)', code, id);
    await this.env.AREAS.getByName(`room:${code}`).sendOff([id], ban ? 'banned' : 'kicked');
    send(ws, { t: 'roomBans', code, banned: this.bannedFrom(code) });
  }

  private async closeRoom(ws: WebSocket, me: Member, code: string): Promise<void> {
    if (!this.ownsRoom(me.id, code)) return send(ws, { t: 'error', code: 'forbidden' });
    this.sql.exec('DELETE FROM rooms WHERE code = ?', code);
    this.sql.exec('DELETE FROM room_bans WHERE code = ?', code);
    await this.env.AREAS.getByName(`room:${code}`).sendOff(null, 'room_closed');
  }

  private sendTo(id: string, message: SocialServerMessage): void {
    for (const ws of this.ctx.getWebSockets(id)) send(ws, message);
  }
}

function send(ws: WebSocket, message: SocialServerMessage): void {
  try {
    ws.send(JSON.stringify(message));
  } catch {
    // The socket is closing; its close handler cleans up.
  }
}
