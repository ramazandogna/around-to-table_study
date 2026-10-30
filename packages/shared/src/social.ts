import { z } from 'zod';
import type { AreaId } from './world';

/**
 * The social connection: one socket per player, next to the area socket, that
 * carries friends and their presence across every room.
 */
const areaId = z.enum(['hall', 'library', 'smoking']);
const userId = z.string().min(1).max(64);

/** Most friends one person can have; plenty for a study place. */
export const MAX_FRIENDS = 200;

export const socialClientSchema = z.discriminatedUnion('t', [
  /** First message on every (re)connect, and again whenever the player changes rooms. */
  z.object({ t: z.literal('where'), area: areaId }),
  /** Sends a request, or accepts theirs if they already asked. */
  z.object({ t: z.literal('befriend'), to: userId }),
  /** Declines a request, cancels one, or ends a friendship. */
  z.object({ t: z.literal('unfriend'), id: userId }),
]);

export type SocialClientMessage = z.infer<typeof socialClientSchema>;

/** Where a friendship stands, from the receiver's point of view. */
export type FriendState = 'friend' | 'incoming' | 'outgoing';

export type Friend = {
  id: string;
  name: string;
  state: FriendState;
  /** Only shared between friends; null when offline or not yet friends. */
  area: AreaId | null;
};

export type SocialErrorCode = 'bad_message' | 'rate_limited' | 'unknown_user' | 'too_many';

export type SocialServerMessage =
  /** The whole list, sent on connect and after every change. */
  | { t: 'friends'; friends: Friend[] }
  /** Something worth telling the player about. */
  | { t: 'friendEvent'; kind: 'request' | 'accepted'; id: string; name: string }
  | { t: 'error'; code: SocialErrorCode };

export function parseSocialMessage(raw: string): SocialClientMessage | null {
  try {
    const result = socialClientSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Friendships are stored once, with the smaller id first. */
export function friendPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}
