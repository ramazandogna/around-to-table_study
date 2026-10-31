import { z } from 'zod';
import { containsLink } from './rules';
import { normalizeChat } from './text';
import type { AreaId } from './world';

/**
 * The social connection: one socket per player, next to the area socket, that
 * carries friends and their presence across every room.
 */
const areaId = z.enum(['hall', 'library', 'smoking']);
const userId = z.string().min(1).max(64);

/** Most friends one person can have; plenty for a study place. */
export const MAX_FRIENDS = 200;

/** Longest phone message, in characters. */
export const DM_MAX_CHARS = 500;
/** Messages kept per conversation; older ones are dropped. */
export const DM_HISTORY = 200;

export const socialClientSchema = z.discriminatedUnion('t', [
  /** First message on every (re)connect, and again whenever the player changes rooms. */
  z.object({ t: z.literal('where'), area: areaId }),
  /** Sends a request, or accepts theirs if they already asked. */
  z.object({ t: z.literal('befriend'), to: userId }),
  /** Declines a request, cancels one, or ends a friendship. */
  z.object({ t: z.literal('unfriend'), id: userId }),
  /** A phone message to a friend, in any room but the library. */
  z.object({
    t: z.literal('dm'),
    to: userId,
    text: z
      .string()
      .min(1)
      .max(DM_MAX_CHARS * 2),
  }),
  /** Opens a conversation: the server answers with its history and marks it read. */
  z.object({ t: z.literal('history'), with: userId }),
  /** Marks a conversation read, e.g. when a message arrives while it is open. */
  z.object({ t: z.literal('read'), with: userId }),
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
  /** Phone messages from them not read yet. */
  unread: number;
};

export type DirectMessage = {
  id: number;
  from: string;
  to: string;
  text: string;
  at: number;
};

export type SocialErrorCode =
  | 'bad_message'
  | 'rate_limited'
  | 'unknown_user'
  | 'too_many'
  | 'not_friends'
  | 'link_blocked'
  | 'phone_silent';

export type SocialServerMessage =
  /** The whole list, sent on connect and after every change. */
  | { t: 'friends'; friends: Friend[] }
  /** Something worth telling the player about. */
  | { t: 'friendEvent'; kind: 'request' | 'accepted'; id: string; name: string }
  /** A phone message, sent to both ends so every open tab shows it. */
  | { t: 'dm'; message: DirectMessage }
  /** The newest messages of one conversation, oldest first. */
  | { t: 'history'; with: string; messages: DirectMessage[] }
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

export type DmTextResult = { ok: true; text: string } | { ok: false; reason: 'empty' | 'link' };

/** Phone messages keep their case but, like the hall, carry no links. */
export function cleanDm(raw: string): DmTextResult {
  const text = normalizeChat(raw, DM_MAX_CHARS);
  if (!text) return { ok: false, reason: 'empty' };
  if (containsLink(text)) return { ok: false, reason: 'link' };
  return { ok: true, text };
}
