import { APP_NAME, PROTOCOL_VERSION } from './constants';

export type HealthResponse = {
  app: string;
  ok: true;
  protocol: number;
};

export function createHealthResponse(): HealthResponse {
  return { app: APP_NAME, ok: true, protocol: PROTOCOL_VERSION };
}
