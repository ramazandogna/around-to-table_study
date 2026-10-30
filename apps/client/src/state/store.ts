import {
  EMPTY_LINES,
  type Activity,
  type Appearance,
  type AreaId,
  type Friend,
  type StatusLines,
  type StudyStatus,
} from '@att/shared';
import { create } from 'zustand';
import type { AreaConnection } from '../net/AreaConnection';
import type { SocialConnection } from '../net/SocialConnection';
import {
  loadLines,
  loadLook,
  loadSession,
  saveLines,
  saveLook,
  type GuestSession,
} from '../net/session';

export type Notice =
  | 'rate_limited'
  | 'replaced'
  | 'offline'
  | 'quiet_caps'
  | 'link_blocked'
  | 'poked'
  | 'dnd'
  | 'unavailable'
  | 'not_allowed'
  | 'friend_request'
  | 'friend_accepted'
  | 'unknown_user'
  | 'too_many';

/** One line in the room chat panel. */
export type ChatLine = {
  key: number;
  kind: 'say' | 'whisper' | 'joined' | 'left';
  name: string;
  /** For whispers: who it went to. */
  to?: string;
  text?: string;
  self: boolean;
};

const CHAT_LOG_LINES = 100;
let chatLineKey = 0;

export type Selected = { id: string; name: string; lines: StatusLines };

/** What the player chose when asked before the world goes on. */
export type ConfirmChoice = 'break' | 'end' | 'stay';

/**
 * A question the world waits on: standing up from a running timer, or leaving
 * the library with one.
 */
export type Confirm = { kind: 'stand' | 'leave'; answer: (choice: ConfirmChoice) => void };

/** A running timer on this device's clock. */
export type LocalTimer = { endsAt: number; totalMs: number };

/** The questions asked after sitting down, in order. */
export type SitStep = 'activity' | 'timer';

/** State shared between the three.js world and the React UI. */
type GameState = {
  session: GuestSession | null;
  /** Null until the player has made a character on this device. */
  look: Appearance | null;
  /** The player's own status lines, shown over their head. */
  lines: StatusLines;
  area: AreaId;
  connection: AreaConnection | null;
  social: SocialConnection | null;
  /** Friends, requests both ways, and where online friends are. */
  friends: Friend[];
  friendsOpen: boolean;
  connected: boolean;
  playersHere: number;
  /** True while the chat input has focus, so the keyboard does not walk the character. */
  typing: boolean;
  notice: Notice | null;
  /** The person a notice is about, e.g. who poked you. */
  noticeName: string | null;
  /** The room chat, newest last; cleared when changing areas. */
  chatLog: ChatLine[];
  chatOpen: boolean;
  /** Lines that arrived while the chat panel was closed. */
  unread: number;
  /** The person whose card is open, with their status lines as they were when tapped. */
  selected: Selected | null;
  statusOpen: boolean;
  emoteOpen: boolean;
  confirm: Confirm | null;
  /** True while standing next to the notice board. */
  boardOpen: boolean;
  /** True while the player sits at a table. */
  seated: boolean;
  sitStep: SitStep | null;
  /** The wardrobe takes the keyboard, so arrows and Enter do not reach the world. */
  wardrobeOpen: boolean;
  activity: Activity | null;
  timer: LocalTimer | null;
  dnd: boolean;
  /** When the player may talk again, per area (the library waits much longer). */
  cooldownUntil: Partial<Record<AreaId, number>>;
  setSession: (session: GuestSession | null) => void;
  /** Saves the look on this device and shows it in the world. */
  setLook: (look: Appearance) => void;
  setArea: (area: AreaId) => void;
  setConnection: (connection: AreaConnection | null) => void;
  setSocial: (social: SocialConnection | null) => void;
  setFriends: (friends: Friend[]) => void;
  setFriendsOpen: (open: boolean) => void;
  setConnected: (connected: boolean) => void;
  setPlayersHere: (count: number) => void;
  setTyping: (typing: boolean) => void;
  setNotice: (notice: Notice | null, name?: string) => void;
  addChatLine: (line: Omit<ChatLine, 'key'>) => void;
  setChatOpen: (open: boolean) => void;
  setSelected: (selected: Selected | null) => void;
  /** Saves the lines on this device and shows them in the world. */
  setLines: (lines: StatusLines) => void;
  setStatusOpen: (open: boolean) => void;
  setEmoteOpen: (open: boolean) => void;
  ask: (confirm: Confirm | null) => void;
  setBoardOpen: (open: boolean) => void;
  setSeated: (seated: boolean) => void;
  setSitStep: (step: SitStep | null) => void;
  setWardrobeOpen: (open: boolean) => void;
  setActivity: (activity: Activity | null) => void;
  startTimer: (minutes: number, dnd: boolean) => void;
  stopTimer: () => void;
  setDnd: (dnd: boolean) => void;
  setCooldown: (area: AreaId, until: number) => void;
  /** Back to the name screen with nothing carried over. */
  startOver: () => void;
};

export const useGameStore = create<GameState>((set) => ({
  session: loadSession(),
  look: loadLook(),
  lines: loadLines(),
  area: 'hall',
  connection: null,
  social: null,
  friends: [],
  friendsOpen: false,
  connected: false,
  playersHere: 1,
  typing: false,
  notice: null,
  noticeName: null,
  chatLog: [],
  chatOpen: typeof window !== 'undefined' && window.innerWidth >= 900,
  unread: 0,
  selected: null,
  statusOpen: false,
  emoteOpen: false,
  confirm: null,
  boardOpen: false,
  seated: false,
  sitStep: null,
  wardrobeOpen: false,
  activity: null,
  timer: null,
  dnd: false,
  cooldownUntil: {},
  setSession: (session) => set({ session }),
  setLook: (look) => {
    saveLook(look);
    set({ look });
  },
  // Each room has its own chat and people, so nothing carries over.
  setArea: (area) => set({ area, chatLog: [], unread: 0, selected: null, boardOpen: false }),
  setConnection: (connection) => set({ connection }),
  setSocial: (social) => set({ social }),
  setFriends: (friends) => set({ friends }),
  setFriendsOpen: (friendsOpen) => set({ friendsOpen }),
  setConnected: (connected) => set({ connected }),
  setPlayersHere: (playersHere) => set({ playersHere }),
  setTyping: (typing) => set({ typing }),
  setNotice: (notice, name) => set({ notice, noticeName: name ?? null }),
  addChatLine: (line) =>
    set((state) => ({
      chatLog: [...state.chatLog, { ...line, key: ++chatLineKey }].slice(-CHAT_LOG_LINES),
      // Comings and goings are worth seeing but not worth a badge.
      unread: state.chatOpen
        ? 0
        : state.unread + (line.kind === 'say' || line.kind === 'whisper' ? 1 : 0),
    })),
  setChatOpen: (chatOpen) => set({ chatOpen, unread: 0 }),
  setSelected: (selected) => set({ selected }),
  setLines: (lines) => {
    saveLines(lines);
    set({ lines });
  },
  setStatusOpen: (statusOpen) => set({ statusOpen }),
  setEmoteOpen: (emoteOpen) => set({ emoteOpen }),
  ask: (confirm) => set({ confirm }),
  setBoardOpen: (boardOpen) => set({ boardOpen }),
  // Sitting down asks what you will work on; standing up clears the table.
  setSeated: (seated) =>
    set(seated ? { seated, sitStep: 'activity' } : { seated, sitStep: null, activity: null }),
  setSitStep: (sitStep) => set({ sitStep }),
  setWardrobeOpen: (wardrobeOpen) => set({ wardrobeOpen }),
  setActivity: (activity) => set({ activity }),
  startTimer: (minutes, dnd) =>
    set({ timer: { endsAt: Date.now() + minutes * 60_000, totalMs: minutes * 60_000 }, dnd }),
  // Do not disturb belongs to the timer, so it ends with it.
  stopTimer: () => set({ timer: null, dnd: false }),
  setDnd: (dnd) => set({ dnd }),
  setCooldown: (area, until) =>
    set((state) => ({ cooldownUntil: { ...state.cooldownUntil, [area]: until } })),
  startOver: () =>
    set({
      session: null,
      look: null,
      lines: EMPTY_LINES,
      selected: null,
      confirm: null,
      seated: false,
      sitStep: null,
      activity: null,
      timer: null,
      dnd: false,
    }),
}));

/** The player's study status as the server expects it. */
export function studyStatus(state: GameState = useGameStore.getState()): StudyStatus {
  const { activity, timer, dnd } = state;
  return {
    activity,
    timer: timer
      ? { remainingMs: Math.max(0, Math.round(timer.endsAt - Date.now())), totalMs: timer.totalMs }
      : null,
    dnd,
  };
}
