import type {
  AreaId,
  Appearance,
  ClientMessage,
  Point,
  Emote,
  ServerMessage,
  StatusLines,
  StudyStatus,
} from '@att/shared';
import ReconnectingWebSocket from 'partysocket/ws';

type Options = {
  area: AreaId;
  from: AreaId | undefined;
  token: string;
  /** Read on every (re)connect, like the status. */
  look: () => Appearance;
  /** Read on every (re)connect, so the server always has the current status. */
  status: () => StudyStatus;
  lines: () => StatusLines;
  onMessage: (message: ServerMessage) => void;
  onStatus: (connected: boolean) => void;
};

/** One live connection to an area. Reconnects on its own and says hello again each time. */
export class AreaConnection {
  private readonly socket: ReconnectingWebSocket;

  constructor(private readonly options: Options) {
    const { area, token } = options;
    const url = () => {
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
      return `${scheme}://${location.host}/api/areas/${area}/ws?token=${encodeURIComponent(token)}`;
    };
    this.socket = new ReconnectingWebSocket(url, [], { maxRetries: Infinity });
    this.socket.addEventListener('open', () => {
      options.onStatus(true);
      this.send({
        t: 'hello',
        look: options.look(),
        status: options.status(),
        lines: options.lines(),
        ...(options.from ? { from: options.from } : {}),
      });
    });
    this.socket.addEventListener('close', () => options.onStatus(false));
    this.socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return;
      try {
        options.onMessage(JSON.parse(event.data) as ServerMessage);
      } catch {
        // Ignore malformed frames; the server only sends JSON.
      }
    });
  }

  move(to: Point): void {
    this.send({ t: 'move', to });
  }

  say(text: string): void {
    this.send({ t: 'say', text });
  }

  changeLook(look: Appearance): void {
    this.send({ t: 'look', look });
  }

  status(status: StudyStatus): void {
    this.send({ t: 'status', status });
  }

  setLines(lines: StatusLines): void {
    this.send({ t: 'lines', lines });
  }

  emote(emote: Emote): void {
    this.send({ t: 'emote', emote });
  }

  poke(to: string): void {
    this.send({ t: 'poke', to });
  }

  whisper(to: string, text: string): void {
    this.send({ t: 'whisper', to, text });
  }

  close(): void {
    this.socket.close();
  }

  private send(message: ClientMessage): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }
}
