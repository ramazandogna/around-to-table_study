import { HEARTBEAT, HEARTBEAT_MS } from '@att/shared';
import type ReconnectingWebSocket from 'partysocket/ws';

/**
 * Keeps telling the server this socket is still here, so one left behind by a
 * phone gone to sleep can be told apart and dropped (see isStale on the server).
 * The first beat goes out as soon as the socket opens. Returns a stop function.
 */
export function keepAlive(socket: ReconnectingWebSocket): () => void {
  const beat = () => {
    if (socket.readyState === WebSocket.OPEN) socket.send(HEARTBEAT.ping);
  };
  socket.addEventListener('open', beat);
  const timer = window.setInterval(beat, HEARTBEAT_MS);
  return () => {
    window.clearInterval(timer);
    socket.removeEventListener('open', beat);
  };
}

/** The server's answer to a heartbeat; it is not JSON and carries nothing. */
export const isPong = (data: unknown) => data === HEARTBEAT.pong;
