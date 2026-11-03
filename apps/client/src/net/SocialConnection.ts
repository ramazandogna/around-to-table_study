import type {
  Appearance,
  AreaId,
  EventProposal,
  RoomRules,
  SocialClientMessage,
  SocialServerMessage,
  StatusLines,
} from '@att/shared';
import type { EVENT_AREAS } from '@att/shared';
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
      tz: -new Date().getTimezoneOffset(),
      pet: pet ?? null,
      ...(look ? { look } : {}),
      ...(pet && look.petColor !== undefined ? { petColor: look.petColor } : {}),
      ...(pet && look.petSex ? { petSex: look.petSex } : {}),
      ...(pet && look.petAccessory ? { petAccessory: look.petAccessory } : {}),
    });
  }

  find(q: string): void {
    this.send({ t: 'find', q });
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

  /** A line for the whole building. */
  shout(text: string): void {
    this.send({ t: 'shout', text });
  }

  block(to: string): void {
    this.send({ t: 'block', to });
  }

  unblock(id: string): void {
    this.send({ t: 'unblock', id });
  }

  profile(id: string): void {
    this.send({ t: 'profile', id });
  }

  propose(event: EventProposal): void {
    const { theme, ...rest } = event;
    this.send({
      t: 'propose',
      ...rest,
      area: event.area as (typeof EVENT_AREAS)[number],
      ...(theme ? { theme } : {}),
    });
  }

  /** Admins: approve, turn down or take off an event. */
  review(id: string, verdict: 'approved' | 'rejected' | 'removed'): void {
    this.send({ t: 'review', id, verdict });
  }

  /** Admins: make someone an admin, or take it back. */
  role(id: string, admin: boolean): void {
    this.send({ t: 'role', id, admin });
  }

  admins(): void {
    this.send({ t: 'admins' });
  }

  roomRules(code: string, rules: RoomRules): void {
    this.send({ t: 'roomRules', code, rules });
  }

  /** The owner sends someone out of the room; with `ban` for good. */
  roomOut(code: string, id: string, ban: boolean): void {
    this.send({ t: 'roomOut', code, id, ban });
  }

  roomUnban(code: string, id: string): void {
    this.send({ t: 'roomUnban', code, id });
  }

  roomBans(code: string): void {
    this.send({ t: 'roomBans', code });
  }

  roomClose(code: string): void {
    this.send({ t: 'roomClose', code });
  }

  close(): void {
    this.stopBeating();
    this.socket.close();
  }

  private send(message: SocialClientMessage): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }
}
