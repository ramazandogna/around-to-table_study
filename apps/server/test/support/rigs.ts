import { AREA_HEADERS, AreaRoom } from '../../src/area-room';
import type { Env } from '../../src/env';
import { SocialHub, SOCIAL_HEADERS } from '../../src/social-hub';
import { FakeState, installWorkersGlobals, type FakeSocket } from './fakes';

installWorkersGlobals();

export const LOOK = { character: 0 };

/** The hub the area rooms talk to, as far as a test needs it. */
export type HubStub = {
  recordBlock: (id: string, minutes: number) => Promise<void>;
  isBlocked: (a: string, b: string) => Promise<boolean>;
  blockedWith: (id: string) => Promise<string[]>;
  [key: string]: unknown;
};

export function fakeHub(overrides: Partial<HubStub> = {}): HubStub & { recorded: number[] } {
  const recorded: number[] = [];
  return {
    recorded,
    recordBlock: async (_id: string, minutes: number) => {
      recorded.push(minutes);
    },
    isBlocked: async () => false,
    blockedWith: async () => [],
    ...overrides,
  };
}

export type Client = { id: string; ws: FakeSocket };

/** An area room on fake storage, and a way to put people in it. */
export function areaRig(area: string, hub: HubStub = fakeHub()) {
  const state = new FakeState();
  const env = { SOCIAL: { getByName: () => hub } } as unknown as Env;
  const room = new AreaRoom(state as unknown as DurableObjectState, env);

  async function join(id: string, hello: Record<string, unknown> = {}): Promise<Client> {
    const request = new Request('https://x/ws', {
      headers: {
        Upgrade: 'websocket',
        [AREA_HEADERS.id]: id,
        [AREA_HEADERS.name]: id,
        [AREA_HEADERS.area]: area,
      },
    });
    await room.fetch(request);
    const ws = state.sockets[state.sockets.length - 1] as FakeSocket;
    const client = { id, ws };
    await send(client, { t: 'hello', look: LOOK, ...hello });
    return client;
  }

  async function send(client: Client, message: Record<string, unknown>): Promise<void> {
    await room.webSocketMessage(client.ws as unknown as WebSocket, JSON.stringify(message));
  }

  return { room, state, hub, join, send };
}

export type HubRig = ReturnType<typeof hubRig>;

/** The social hub on in-memory SQLite. */
export function hubRig(env: Partial<Env> = {}) {
  const state = new FakeState();
  const areas = new Map<string, Record<string, unknown>>();
  const fullEnv = {
    AREAS: {
      getByName: (name: string) => {
        let stub = areas.get(name);
        if (!stub) {
          stub = { sendOff: async () => {}, kick: async () => {}, setRules: async () => {} };
          areas.set(name, stub);
        }
        return stub;
      },
    },
    ...env,
  } as unknown as Env;
  const hub = new SocialHub(state as unknown as DurableObjectState, fullEnv);

  async function connect(id: string, name = id): Promise<Client> {
    await hub.fetch(
      new Request('https://x/ws', {
        headers: {
          Upgrade: 'websocket',
          [SOCIAL_HEADERS.id]: id,
          [SOCIAL_HEADERS.name]: encodeURIComponent(name),
        },
      }),
    );
    return { id, ws: state.sockets[state.sockets.length - 1] as FakeSocket };
  }

  async function send(client: Client, message: Record<string, unknown>): Promise<void> {
    await hub.webSocketMessage(client.ws as unknown as WebSocket, JSON.stringify(message));
  }

  return { hub, state, sql: state.storage.sql, areas, connect, send };
}
