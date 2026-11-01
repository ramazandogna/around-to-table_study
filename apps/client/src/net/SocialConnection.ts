import type {
  Appearance,
  AreaId,
  SocialClientMessage,
  SocialServerMessage,
  StatusLines,
} from '@att/shared';
import ReconnectingWebSocket from 'partysocket/ws';
import { isPong, keepAlive } from './heartbeat';

/** What friends (and the building's counts) know about the player. */
export type Presence = {
  area: AreaId;
  /** Whether the player sits at a table, for the building's "studying" count. */
  studying: boolean;
  /** The player's look, for the pet waiting at the library door. */
  look: Appearance | null;
  /** The private room's code, when in one. */
  room: string | null;
  /** The status lines, shortened on friends' phones. */
  lines: StatusLines;
};

type Options = {
  token: string;
  /** Read on every (re)connect, so friends always see the current room. */
  presence: () => Presence;
  onMessage: (message: SocialServerMessage) => void;
};

/** The one socket for friends and presence; it stays open while moving between rooms. */
export class SocialConnection {
  private readonly socket: ReconnectingWebSocket;
  private readonly stopBeating: () => void;

  constructor(options: Options) {
    const url = () => {
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
      return `${scheme}://${location.host}/api/social/ws?token=${encodeURIComponent(options.token)}`;
    };
    this.socket = new ReconnectingWebSocket(url, [], { maxRetries: Infinity });
    this.stopBeating = keepAlive(this.socket);
    this.socket.addEventListener('open', () => this.where(options.presence()));
    this.socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string' || isPong(event.data)) return;
      try {
        options.onMessage(JSON.parse(event.data) as SocialServerMessage);
      } catch {
        // Ignore malformed frames; the server only sends JSON.
      }
    });
  }

  where({ area, studying, look, room, lines }: Presence): void {
    const pet = look?.pet;
    this.send({
      t: 'where',
      area,
      studying,
      ...(room ? { room } : {}),
      vibe: lines.vibe,
      mood: lines.mood,
      doing: lines.doing,
      note: lines.announcement,
      pet: pet ?? null,
      ...(pet && look.petColor !== undefined ? { petColor: look.petColor } : {}),
      ...(pet && look.petSex ? { petSex: look.petSex } : {}),
      ...(pet && look.petAccessory ? { petAccessory: look.petAccessory } : {}),
    });
  }

  befriend(to: string): void {
    this.send({ t: 'befriend', to });
  }

  unfriend(id: string): void {
    this.send({ t: 'unfriend', id });
  }

  dm(to: string, text: string): void {
    this.send({ t: 'dm', to, text });
  }

  /** Asks for a conversation's history, which also marks it read. */
  history(other: string): void {
    this.send({ t: 'history', with: other });
  }

  read(other: string): void {
    this.send({ t: 'read', with: other });
  }

  /** Makes a friend's phone buzz: "come say hi". */
  buzz(to: string): void {
    this.send({ t: 'buzz', to });
  }

  close(): void {
    this.stopBeating();
    this.socket.close();
  }

  private send(message: SocialClientMessage): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }
}
