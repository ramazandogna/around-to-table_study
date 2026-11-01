import {
  AREA_RULES,
  cleanDm,
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
  /** When the socket connected, for telling vanished ones apart (see `alarm`). */
  since?: number;
  /** The private room they are in, if any. */
  room?: string | undefined;
  /** Their status lines in short, for friends' phones. */
  lines?: Pick<Friend, 'vibe' | 'mood' | 'doing' | 'note'>;
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
};

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

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
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
    `);
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
      changes: { start: 0, count: 0 },
      messages: { start: 0, count: 0 },
    };
    server.serializeAttachment(member);
    this.sql.exec(
      `INSERT INTO users (id, name, seen_at) VALUES (?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET name = excluded.name, seen_at = excluded.seen_at`,
      id,
      member.name,
      Date.now(),
    );
    await this.armSweep();
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const message = typeof raw === 'string' ? parseSocialMessage(raw) : null;
    const stored = ws.deserializeAttachment() as Member | null;
    if (!message || !stored) return send(ws, { t: 'error', code: 'bad_message' });
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
    for (const ws of this.ctx.getWebSockets()) {
      const me = ws.deserializeAttachment() as Member | null;
      const ping = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? null;
      if (!me || isStale(now, me.since ?? 0, ping)) this.leave(ws);
    }
    if (this.ctx.getWebSockets().length > 0) await this.armSweep();
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
      'INSERT INTO rooms (code, name, size, password, owner, created_at, used_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      code,
      name,
      size,
      hash,
      owner,
      now,
      now,
    );
    return { code, name, size, locked: hash !== null, people: 0 };
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
  async checkRoom(code: string, password: string | null): Promise<'ok' | 'unknown' | 'password'> {
    const row = this.roomRow(code);
    if (!row) return 'unknown';
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
        'SELECT code, name, size, password, owner, used_at FROM rooms WHERE password IS NULL AND used_at > ? ORDER BY used_at DESC LIMIT 40',
        Date.now() - ROOM_IDLE_MS,
      )
      .toArray();
    return rows.map((row) => this.info(row)).sort((a, b) => b.people - a.people);
  }

  private roomRow(code: string): RoomRow | null {
    return (
      this.sql
        .exec<RoomRow>(
          'SELECT code, name, size, password, owner, used_at FROM rooms WHERE code = ? AND used_at > ?',
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
        lines,
      };
      ws.serializeAttachment(next);
      this.tellWorld();
      const moved = me.area !== message.area;
      // Friends' phones show where they are, whether they study and how they are.
      const visible = (m: Member) =>
        JSON.stringify([m.area, m.studying ?? false, m.room ?? null, m.lines ?? null]);
      if (moved || !me.area) this.sendList(me.id);
      if (moved || !me.area || visible(me) !== visible(next)) this.tellFriends(me.id);
      return;
    }
    if (message.t === 'dm') return this.dm(ws, me, message.to, message.text);
    if (message.t === 'history') return this.history(ws, me.id, message.with);
    if (message.t === 'read') {
      this.markRead(me.id, message.with);
      return this.sendList(me.id);
    }
    if (message.t === 'buzz') return this.buzz(ws, me, message.to);
    const changes = takeToken(me.changes, Date.now(), CHANGES_PER_MINUTE, 60_000);
    if (!changes) return send(ws, { t: 'error', code: 'rate_limited' });
    ws.serializeAttachment({ ...me, changes });
    if (message.t === 'befriend') this.befriend(ws, me, message.to);
    else if (message.t === 'unfriend') this.unfriend(me.id, message.id);
  }

  private befriend(ws: WebSocket, me: Member, to: string): void {
    if (to === me.id) return;
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
    this.sql.exec('UPDATE users SET seen_at = ? WHERE id = ?', Date.now(), me.id);
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
