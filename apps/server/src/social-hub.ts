import {
  friendPair,
  MAX_FRIENDS,
  parseSocialMessage,
  type AreaId,
  type Friend,
  type SocialClientMessage,
  type SocialServerMessage,
} from '@att/shared';
import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import { takeToken, type RateWindow } from './rate-limit';

/** Per-socket state, kept in the attachment so it survives hibernation. */
type Member = { id: string; name: string; area: AreaId | null; changes: RateWindow };

type FriendRow = { other: string; name: string; accepted: number; requested_by: string };

/** Friend requests and removals per person per minute. */
const CHANGES_PER_MINUTE = 10;

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

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
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
      changes: { start: 0, count: 0 },
    };
    server.serializeAttachment(member);
    this.sql.exec(
      `INSERT INTO users (id, name, seen_at) VALUES (?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET name = excluded.name, seen_at = excluded.seen_at`,
      id,
      member.name,
      Date.now(),
    );
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const message = typeof raw === 'string' ? parseSocialMessage(raw) : null;
    const me = ws.deserializeAttachment() as Member | null;
    if (!message || !me) return send(ws, { t: 'error', code: 'bad_message' });
    this.handle(ws, me, message);
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    this.leave(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.leave(ws);
  }

  private handle(ws: WebSocket, me: Member, message: SocialClientMessage): void {
    if (message.t === 'where') {
      ws.serializeAttachment({ ...me, area: message.area });
      this.sendList(me.id);
      this.tellFriends(me.id);
      return;
    }
    const changes = takeToken(me.changes, Date.now(), CHANGES_PER_MINUTE, 60_000);
    if (!changes) return send(ws, { t: 'error', code: 'rate_limited' });
    ws.serializeAttachment({ ...me, changes });
    if (message.t === 'befriend') this.befriend(ws, me, message.to);
    else this.unfriend(me.id, message.id);
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

  private unfriend(me: string, other: string): void {
    const [a, b] = friendPair(me, other);
    this.sql.exec('DELETE FROM friends WHERE a = ? AND b = ?', a, b);
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
    this.closing = ws;
    this.tellFriends(me.id);
    this.closing = null;
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
        `SELECT u.id AS other, u.name AS name, f.accepted AS accepted, f.requested_by AS requested_by
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
    return this.rows(id).map((row) => ({
      id: row.other,
      name: row.name,
      state: row.accepted ? 'friend' : row.requested_by === id ? 'outgoing' : 'incoming',
      area: row.accepted ? this.areaOf(row.other) : null,
    }));
  }

  /** Where someone is right now, from any of their open sockets. */
  private areaOf(id: string): AreaId | null {
    for (const ws of this.ctx.getWebSockets(id)) {
      if (ws === this.closing) continue;
      const member = ws.deserializeAttachment() as Member | null;
      if (member?.area) return member.area;
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
