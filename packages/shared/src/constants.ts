export const APP_NAME = 'Around the Table';

/** Bumped whenever the client/server message protocol changes in a breaking way. */
export const PROTOCOL_VERSION = 1;

/** Size of one map tile in pixels (Tiled maps use the same value). */
export const TILE_SIZE = 16;

/**
 * Sockets send this every HEARTBEAT_MS and the server answers without waking
 * up. A socket silent for longer than STALE_MS belongs to a phone that went to
 * sleep or a tab that vanished: the server drops it, so nobody is counted who
 * is not really there. Long enough for background tabs, whose timers may only
 * fire once a minute.
 */
export const HEARTBEAT = { ping: 'ping', pong: 'pong' } as const;
export const HEARTBEAT_MS = 25_000;
export const STALE_MS = 100_000;

/**
 * Bumped to start the building over: on the first wake-up after a deploy with
 * a higher number, the server forgets every guest, friendship, message, room
 * and number, and browsers forget their character. Accounts come later.
 */
export const DATA_EPOCH = 2;

/** Access password attempts per address in ten minutes, before waiting. */
export const PASSWORD_TRIES = 8;
