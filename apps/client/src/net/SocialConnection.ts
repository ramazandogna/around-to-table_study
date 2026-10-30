import type { AreaId, SocialClientMessage, SocialServerMessage } from '@att/shared';
import ReconnectingWebSocket from 'partysocket/ws';

type Options = {
  token: string;
  /** Read on every (re)connect, so friends always see the current room. */
  area: () => AreaId;
  onMessage: (message: SocialServerMessage) => void;
};

/** The one socket for friends and presence; it stays open while moving between rooms. */
export class SocialConnection {
  private readonly socket: ReconnectingWebSocket;

  constructor(options: Options) {
    const url = () => {
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
      return `${scheme}://${location.host}/api/social/ws?token=${encodeURIComponent(options.token)}`;
    };
    this.socket = new ReconnectingWebSocket(url, [], { maxRetries: Infinity });
    this.socket.addEventListener('open', () => this.where(options.area()));
    this.socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return;
      try {
        options.onMessage(JSON.parse(event.data) as SocialServerMessage);
      } catch {
        // Ignore malformed frames; the server only sends JSON.
      }
    });
  }

  where(area: AreaId): void {
    this.send({ t: 'where', area });
  }

  befriend(to: string): void {
    this.send({ t: 'befriend', to });
  }

  unfriend(id: string): void {
    this.send({ t: 'unfriend', id });
  }

  close(): void {
    this.socket.close();
  }

  private send(message: SocialClientMessage): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }
}
