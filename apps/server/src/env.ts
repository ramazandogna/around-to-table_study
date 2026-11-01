import type { AreaRoom } from './area-room';
import type { SocialHub } from './social-hub';

export interface Env {
  AREAS: DurableObjectNamespace<AreaRoom>;
  SOCIAL: DurableObjectNamespace<SocialHub>;
  /** HMAC key for guest tokens. Set with `wrangler secret put SESSION_SECRET`. */
  SESSION_SECRET?: string;
  /**
   * The owner's guest ids, comma separated: always admins, and the ones who
   * can make others admins. Set with `wrangler secret put ADMIN_IDS`.
   */
  ADMIN_IDS?: string;
}
