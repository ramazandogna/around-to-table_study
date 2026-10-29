import {
  createAreaGrid,
  findPath,
  isValidAppearance,
  normalizeChat,
  parseClientMessage,
  type Appearance,
  type AreaGrid,
  type AreaId,
  type ClientMessage,
  type PlayerSnapshot,
  type Point,
  type ServerMessage,
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
};

const MOVES_PER_SECOND = 10;
const SAY_COOLDOWN_MS = 1000;
/** Area rules (limits per area) arrive in Phase 3; until then every area uses this. */
const CHAT_MAX_LENGTH = 200;
const CLOSE_REPLACED = 4000;

export const AREA_HEADERS = { id: 'x-user-id', name: 'x-user-name', area: 'x-area' } as const;

/**
 * One Durable Object per area (hall, library, smoking room). It owns who is
 * there and where they stand, and relays movement and chat to everyone else.
 */
export class AreaRoom extends DurableObject<Env> {
  private grids = new Map<AreaId, AreaGrid>();

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const id = request.headers.get(AREA_HEADERS.id);
    const name = request.headers.get(AREA_HEADERS.name);
    const area = request.headers.get(AREA_HEADERS.area) as AreaId | null;
    if (!id || !name || !area) return new Response('missing session', { status: 400 });

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [id]);
    this.save(server, {
      id,
      name: decodeURIComponent(name),
      area,
      joined: false,
      moves: { start: 0, count: 0 },
      lastSayAt: 0,
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const message = typeof raw === 'string' ? parseClientMessage(raw) : null;
    const me = this.load(ws);
    if (!message || !me) return this.send(ws, { t: 'error', code: 'bad_message' });
    this.handle(ws, me, message, Date.now());
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    this.leave(ws);
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
        const joined: Connection = { ...me, joined: true, look: message.look, tile };
        this.save(ws, joined);
        this.send(ws, {
          t: 'welcome',
          self: me.id,
          tile,
          area: me.area,
          players: this.players().filter((p) => p.id !== me.id),
        });
        this.broadcast({ t: 'joined', player: snapshot(joined) }, ws);
        return;
      }
      case 'move': {
        if (!me.joined || !me.tile) return;
        const moves = takeToken(me.moves, now, MOVES_PER_SECOND, 1000);
        if (!moves) return this.send(ws, { t: 'error', code: 'rate_limited' });
        const path = findPath(this.grid(me.area), me.tile, message.to);
        if (!path) {
          this.save(ws, { ...me, moves });
          return this.send(ws, { t: 'placed', id: me.id, tile: me.tile });
        }
        this.save(ws, { ...me, moves, tile: message.to });
        this.broadcast({ t: 'moved', id: me.id, to: message.to }, ws);
        return;
      }
      case 'say': {
        if (!me.joined) return;
        const wait = me.lastSayAt + SAY_COOLDOWN_MS - now;
        if (wait > 0) return this.send(ws, { t: 'error', code: 'rate_limited', retryInMs: wait });
        const text = normalizeChat(message.text, CHAT_MAX_LENGTH);
        if (!text) return;
        this.save(ws, { ...me, lastSayAt: now });
        this.broadcast({ t: 'said', id: me.id, text });
        return;
      }
    }
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
    }
    try {
      ws.close();
    } catch {
      // Already closed.
    }
  }

  private players(): PlayerSnapshot[] {
    return this.ctx
      .getWebSockets()
      .map((ws) => this.load(ws))
      .filter((c): c is Connection => !!c?.joined)
      .map(snapshot);
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
      grid = createAreaGrid(area);
      this.grids.set(area, grid);
    }
    return grid;
  }

  private load(ws: WebSocket): Connection | null {
    return (ws.deserializeAttachment() as Connection | null) ?? null;
  }

  private save(ws: WebSocket, connection: Connection): void {
    ws.serializeAttachment(connection);
  }
}

function snapshot(c: Connection): PlayerSnapshot {
  return {
    id: c.id,
    name: c.name,
    look: c.look as Appearance,
    tile: c.tile ?? { x: 0, y: 0 },
  };
}
