import type { AreaRoom } from './area-room';

export interface Env {
  AREAS: DurableObjectNamespace<AreaRoom>;
  /** HMAC key for guest tokens. Set with `wrangler secret put SESSION_SECRET`. */
  SESSION_SECRET?: string;
}
