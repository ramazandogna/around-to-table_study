import type { AreaId, PetKind, SocialClientMessage, SocialServerMessage } from '@att/shared';
import ReconnectingWebSocket from 'partysocket/ws';
import { isPong, keepAlive } from './heartbeat';

type Options = {
  token: string;
  /** Read on every (re)connect, so friends always see the current room. */
  area: () => AreaId;
  /** Whether the player sits at a table, for the building's "studying" count. */
  studying: () => boolean;
  /** The pet walking along, so it can wait at the library door. */
  pet: () => PetKind | null;
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
    this.socket.addEventListener('open', () =>
      this.where(options.area(), options.studying(), options.pet()),
    );
    this.socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string' || isPong(event.data)) return;
      try {
        options.onMessage(JSON.parse(event.data) as SocialServerMessage);
      } catch {
        // Ignore malformed frames; the server only sends JSON.
      }
    });
  }

  where(area: AreaId, studying: boolean, pet: PetKind | null): void {
    this.send({ t: 'where', area, studying, pet });
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

  close(): void {
    this.stopBeating();
    this.socket.close();
  }

  private send(message: SocialClientMessage): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }
}
