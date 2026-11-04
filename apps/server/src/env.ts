import type { AreaRoom } from './area-room';
import type { SocialHub } from './social-hub';

export interface Env {
  AREAS: DurableObjectNamespace<AreaRoom>;
  SOCIAL: DurableObjectNamespace<SocialHub>;
  /** HMAC key for guest tokens. Set with `wrangler secret put SESSION_SECRET`. */
  SESSION_SECRET?: string;
  /**
   * The owners' Google emails, comma separated: always admins, and the ones
   * who can make others admins. Set with `wrangler secret put ADMIN_EMAILS`.
   */
  ADMIN_EMAILS?: string;
  /** Google sign-in (OAuth client of type Web). Without them only the local dev sign-in works. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Who may walk into the game: `code` (default), `allowlist` or `open`; see accounts.ts. */
  BETA_MODE?: string;
  /** For `allowlist`: the emails let in, comma separated. */
  ALLOWED_EMAILS?: string;
  /**
   * The early beta's access password, new with every deploy (see
   * scripts/deploy.mjs). Unset (local development) leaves the door open.
   */
  ACCESS_PASSWORD?: string;
}
