import { z } from 'zod';
import {
  PET_ACCESSORIES,
  PET_COLORS,
  PET_SEXES,
  PETS,
  type PetAccessory,
  type PetKind,
  type PetSex,
} from './character';
import { containsLink } from './rules';
import { DOINGS, MOODS, STATUS_LIMITS, VIBES, type Doing, type Mood, type Vibe } from './status';
import { normalizeChat } from './text';
import { EVENT_AREAS, EVENT_LIMITS, type ProposedEvent } from './events';
import type { Profile, Role } from './profile';
import type { AreaId } from './world';

/**
 * The social connection: one socket per player, next to the area socket, that
 * carries friends and their presence across every room.
 */
const areaId = z.enum(['hall', 'library', 'smoking', 'room3', 'room5', 'room9']);
const userId = z.string().min(1).max(64);
const roomCode = z.string().regex(/^[A-Z2-9]{6}$/);

/** Longest line in the building-wide chat. */
export const SHOUT_MAX_CHARS = 200;
/** Lines of the building-wide chat kept for people coming in. */
export const SHOUT_HISTORY = 50;

/** Most friends one person can have; plenty for a study place. */
export const MAX_FRIENDS = 200;

/** Longest phone message, in characters. */
export const DM_MAX_CHARS = 500;
/** Messages kept per conversation; older ones are dropped. */
export const DM_HISTORY = 200;

export const socialClientSchema = z.discriminatedUnion('t', [
  /**
   * First message on every (re)connect, and again whenever the player changes
   * rooms or sits down at a table or gets up.
   */
  z.object({
    t: z.literal('where'),
    area: areaId,
    studying: z.boolean().optional(),
    /** The pet walking along, so it can wait at the library door while its person studies. */
    pet: z.enum(PETS).nullable().optional(),
    /** How the pet looks, so the hall draws it right at the door. */
    petColor: z
      .number()
      .int()
      .min(0)
      .max(PET_COLORS.length - 1)
      .optional(),
    petSex: z.enum(PET_SEXES).optional(),
    petAccessory: z.enum(PET_ACCESSORIES).optional(),
    /** The private room's code, when in one, so the reception can count people inside. */
    room: z
      .string()
      .regex(/^[A-Z2-9]{6}$/)
      .optional(),
    /** The status lines, shortened, for friends' phones. */
    vibe: z.enum(VIBES).nullable().optional(),
    mood: z.enum(MOODS).nullable().optional(),
    doing: z.enum(DOINGS).nullable().optional(),
    note: z
      .string()
      .max(STATUS_LIMITS.announcement * 2)
      .optional(),
    /** The player's clock, minutes ahead of UTC: their "today" and "this week". */
    tz: z.number().int().min(-720).max(840).optional(),
  }),
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
  /** Makes a friend's phone buzz wherever they are: "come say hi". */
  z.object({ t: z.literal('buzz'), to: userId }),
  /** Says something to the whole building. */
  z.object({
    t: z.literal('shout'),
    text: z
      .string()
      .min(1)
      .max(SHOUT_MAX_CHARS * 2),
  }),
  /** Blocks someone: no messages, pokes or invites either way, and no friendship. */
  z.object({ t: z.literal('block'), to: userId }),
  z.object({ t: z.literal('unblock'), id: userId }),
  /** Asks for someone's profile card. */
  z.object({ t: z.literal('profile'), id: userId }),
  /** Proposes an event; it waits for an admin. */
  z.object({
    t: z.literal('propose'),
    title: z
      .string()
      .min(1)
      .max(EVENT_LIMITS.title.max * 2),
    description: z.string().max(EVENT_LIMITS.description * 2),
    area: z.enum(EVENT_AREAS),
    start: z.number().int(),
    minutes: z.number().int(),
  }),
  /** Admins: approves or turns down a proposed event, or takes an approved one off. */
  z.object({
    t: z.literal('review'),
    id: z.string().min(1).max(40),
    verdict: z.enum(['approved', 'rejected', 'removed']),
  }),
  /** Admins: makes someone an admin, or takes it back. */
  z.object({ t: z.literal('role'), id: userId, admin: z.boolean() }),
  /** Admins: who the admins are. */
  z.object({ t: z.literal('admins') }),
  /** A room's owner changes its rules. */
  z.object({
    t: z.literal('roomRules'),
    code: roomCode,
    rules: z.object({ sound: z.boolean(), pets: z.boolean(), games: z.boolean() }),
  }),
  /** A room's owner sends someone out; with `ban` they cannot come back. */
  z.object({ t: z.literal('roomOut'), code: roomCode, id: userId, ban: z.boolean() }),
  z.object({ t: z.literal('roomUnban'), code: roomCode, id: userId }),
  /** A room's owner closes it for good. */
  z.object({ t: z.literal('roomClose'), code: roomCode }),
  /** A room's owner asks who is banned. */
  z.object({ t: z.literal('roomBans'), code: roomCode }),
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
  /** The rest is only shared between friends, while they are online. */
  studying?: boolean;
  vibe?: Vibe | null;
  mood?: Mood | null;
  doing?: Doing | null;
  /** Their announcement line. */
  note?: string;
  /** The private room they are in, so a friend can ask to come. */
  room?: string | null;
  /** When they were last online, for friends who are not. */
  seenAt?: number | null;
};

export type Shout = { id: number; from: string; name: string; text: string; at: number };

export type DirectMessage = {
  id: number;
  from: string;
  to: string;
  text: string;
  at: number;
};

/** Pets cannot come into the library; they wait at its door in the hall. */
export type WaitingPet = {
  id: string;
  name: string;
  pet: PetKind;
  petColor?: number | undefined;
  petSex?: PetSex | undefined;
  petAccessory?: PetAccessory | undefined;
};

/** At most this many pets are drawn at the library door. */
export const MAX_WAITING_PETS = 8;

export type SocialErrorCode =
  | 'bad_message'
  | 'rate_limited'
  | 'unknown_user'
  | 'too_many'
  | 'not_friends'
  | 'link_blocked'
  | 'phone_silent'
  /** One of the two blocked the other. */
  | 'blocked'
  /** Only admins may do that. */
  | 'forbidden'
  /** A proposal that cannot be taken (the detail says why). */
  | 'bad_event'
  /** Too many proposals waiting already. */
  | 'too_many_events';

export type SocialServerMessage =
  /** The whole list, sent on connect and after every change. */
  | { t: 'friends'; friends: Friend[] }
  /** Something worth telling the player about. */
  | { t: 'friendEvent'; kind: 'request' | 'accepted'; id: string; name: string }
  /** A phone message, sent to both ends so every open tab shows it. */
  | { t: 'dm'; message: DirectMessage }
  /**
   * The newest messages of one conversation, oldest first; `seenUpTo` is the
   * newest of the player's own messages the friend has read.
   */
  | { t: 'history'; with: string; messages: DirectMessage[]; seenUpTo: number }
  /** A friend read the player's messages up to this one. */
  | { t: 'seen'; by: string; upTo: number }
  /** A friend buzzed the player's phone. */
  | { t: 'buzzed'; from: string; name: string }
  /** Who the player is to the building: their role and the people they blocked. */
  | { t: 'me'; role: Role; blocked: { id: string; name: string }[] }
  /** Building-wide chat: one new line, or the latest ones on connect. */
  | { t: 'shouted'; line: Shout }
  | { t: 'shouts'; lines: Shout[] }
  | { t: 'profile'; profile: Profile }
  /**
   * The calendar's proposed events: approved ones for everyone, and also those
   * waiting (admins see all, others their own).
   */
  | { t: 'events'; events: ProposedEvent[] }
  /** An admin decided on the player's proposal. */
  | { t: 'reviewed'; title: string; verdict: 'approved' | 'rejected' }
  /** Someone blocked the player. */
  | { t: 'blockedBy'; name: string }
  | { t: 'admins'; admins: { id: string; name: string }[] }
  /** Who is banned from the owner's room. */
  | { t: 'roomBans'; code: string; banned: { id: string; name: string }[] }
  /**
   * How lively the building is: everyone online, how many sit at a table, and
   * the pets waiting at the library door for their people.
   */
  | { t: 'world'; online: number; studying: number; waiting: WaitingPet[] }
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
