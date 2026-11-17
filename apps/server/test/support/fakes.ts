import { DatabaseSync } from 'node:sqlite';

/** SQLite storage with the Workers `sql.exec` shape, on Node's built-in SQLite. */
export class FakeSql {
  readonly db = new DatabaseSync(':memory:');

  exec<T = Record<string, unknown>>(query: string, ...bindings: unknown[]) {
    const reads = /^\s*(select|with)\b/i.test(query) || /\breturning\b/i.test(query);
    let rows: T[] = [];
    let rowsWritten = 0;
    if (reads) {
      rows = this.db.prepare(query).all(...(bindings as never[])) as T[];
    } else if (bindings.length === 0) {
      this.db.exec(query);
    } else {
      rowsWritten = Number(this.db.prepare(query).run(...(bindings as never[])).changes);
    }
    return {
      rowsWritten,
      toArray: () => rows,
      one: () => {
        if (rows.length !== 1) throw new Error(`expected one row, got ${rows.length}`);
        return rows[0] as T;
      },
    };
  }

  /** Every row of a table, for asserting what is (not) left behind. */
  all(table: string): Record<string, unknown>[] {
    return this.db.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
  }
}

export class FakeSocket {
  attachment: unknown = null;
  readonly sent: string[] = [];
  closed = false;
  tags: string[] = [];

  serializeAttachment(value: unknown): void {
    this.attachment = value === null ? null : structuredClone(value);
  }
  deserializeAttachment(): unknown {
    return this.attachment === null ? null : structuredClone(this.attachment);
  }
  send(data: string): void {
    if (this.closed) throw new Error('closed');
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }
  /** The messages sent to this socket, parsed. */
  messages(): Record<string, unknown>[] {
    return this.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
  }
  /** The messages of one type. */
  of(type: string): Record<string, unknown>[] {
    return this.messages().filter((m) => m['t'] === type);
  }
}

export class FakeStorage {
  readonly sql = new FakeSql();
  private readonly map = new Map<string, unknown>();
  private alarm: number | null = null;
  async get(key: string | string[]): Promise<unknown> {
    if (Array.isArray(key)) {
      return new Map(key.filter((k) => this.map.has(k)).map((k) => [k, this.map.get(k)]));
    }
    return this.map.get(key);
  }
  async put(key: string, value: unknown): Promise<void> {
    this.map.set(key, value);
  }
  async delete(key: string): Promise<boolean> {
    return this.map.delete(key);
  }
  async deleteAll(): Promise<void> {
    this.map.clear();
  }
  async getAlarm(): Promise<number | null> {
    return this.alarm;
  }
  async setAlarm(at: number): Promise<void> {
    this.alarm = at;
  }
}

export class FakeState {
  readonly storage = new FakeStorage();
  readonly sockets: FakeSocket[] = [];
  acceptWebSocket(ws: FakeSocket, tags: string[] = []): void {
    ws.tags = tags;
    this.sockets.push(ws);
  }
  getWebSockets(tag?: string): FakeSocket[] {
    return this.sockets.filter((s) => !s.closed && (tag === undefined || s.tags.includes(tag)));
  }
  setWebSocketAutoResponse(): void {}
  getWebSocketAutoResponseTimestamp(): Date | null {
    return null;
  }
  async blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

/** Defines the Workers globals the objects use, once. */
export function installWorkersGlobals(): void {
  const g = globalThis as Record<string, unknown>;
  if (g['__workersFakes']) return;
  g['__workersFakes'] = true;
  g['WebSocketRequestResponsePair'] = function WebSocketRequestResponsePair() {};
  g['WebSocketPair'] = class {
    0 = new FakeSocket();
    1 = new FakeSocket();
  };
  // A 101 response carries the client socket; Node's Response refuses that status.
  const Native = Response;
  g['Response'] = class extends Native {
    constructor(body?: BodyInit | null, init?: ResponseInit & { webSocket?: unknown }) {
      if (init?.status === 101) {
        super(null, { status: 200 });
        Object.defineProperty(this, 'status', { value: 101 });
        (this as { webSocket?: unknown }).webSocket = init.webSocket;
      } else super(body, init);
    }
  };
}
