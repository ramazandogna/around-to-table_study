import type {
  AreaId,
  Appearance,
  ClientMessage,
  Point,
  Emote,
  ServerMessage,
  StatusLines,
  StudyStatus,
  TableAction,
  TableKind,
} from '@att/shared';
import ReconnectingWebSocket from 'partysocket/ws';
import { isPong, keepAlive } from './heartbeat';

type Options = {
  area: AreaId;
  from: AreaId | undefined;
  token: string;
  /** A private room's code and the pass to it. */
  room?: { code: string; pass: string } | undefined;
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
  private readonly stopBeating: () => void;

  constructor(private readonly options: Options) {
    const { area, token, room } = options;
    const url = () => {
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
      const into = room
        ? `&room=${encodeURIComponent(room.code)}&pass=${encodeURIComponent(room.pass)}`
        : '';
      return `${scheme}://${location.host}/api/areas/${area}/ws?token=${encodeURIComponent(token)}${into}`;
    };
    this.socket = new ReconnectingWebSocket(url, [], { maxRetries: Infinity });
    this.stopBeating = keepAlive(this.socket);
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
      if (typeof event.data !== 'string' || isPong(event.data)) return;
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

  dance(on: boolean): void {
    this.send({ t: 'dance', on });
  }

  /** The study timer ran out; the server checks it really did. */
  smoke(on: boolean): void {
    this.send({ t: 'smoke', on });
  }

  /** Pets someone's pet; `owner` is whose it is. */
  pat(owner: string): void {
    this.send({ t: 'pat', owner });
  }

  table(kind: TableKind, action: TableAction): void {
    this.send({ t: 'table', kind, action });
  }

  queueTune(link: string): void {
    this.send({ t: 'tune', link });
  }

  skipTune(id: string): void {
    this.send({ t: 'skip', id });
  }

  tuneLength(id: string, seconds: number): void {
    this.send({ t: 'tuneLength', id, seconds });
  }

  finished(): void {
    this.send({ t: 'finished' });
  }

  /** Asks someone here to come to the player's private room. */
  invite(to: string, code: string, name: string): void {
    this.send({ t: 'invite', to, code, name });
  }

  poke(to: string): void {
    this.send({ t: 'poke', to });
  }

  whisper(to: string, text: string): void {
    this.send({ t: 'whisper', to, text });
  }

  close(): void {
    this.stopBeating();
    this.socket.close();
  }

  private send(message: ClientMessage): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }
}
