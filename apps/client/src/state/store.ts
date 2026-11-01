import {
  DM_HISTORY,
  EMPTY_JUKEBOX,
  EMPTY_LINES,
  JUKEBOX,
  type JukeboxState,
  type Table,
  type TableKind,
  type Activity,
  type Appearance,
  type AreaId,
  type DirectMessage,
  type Friend,
  type StatusLines,
  type StudyPlanId,
  type StudyRhythm,
  type StudyStatus,
  type WaitingPet,
} from '@att/shared';
import { create } from 'zustand';
import { isMusicOn, setMusicOn } from '../audio/music';
import { isMuted, setMuted as setSoundMuted } from '../audio/sound';
import type { AreaConnection } from '../net/AreaConnection';
import type { RoomTicket } from '../net/rooms';
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
  | 'too_many'
  | 'dm'
  | 'phone_silent'
  | 'not_friends'
  | 'seat_taken'
  | 'desk_opened'
  | 'no_dance'
  | 'muted'
  | 'unmuted'
  /** The player's pet stays at the library door. */
  | 'pet_waits'
  /** A study timer ran out. */
  | 'finished'
  /** An event just started (the value is its room). */
  | 'event_started'
  /** A coffee from the vending machine. */
  | 'vending'
  /** A prize from the claw machine (the value is the prize). */
  | 'prize'
  /** A score at the arcade worth telling about (the value is the score). */
  | 'highscore'
  /** Someone's invite to a private room could not be sent or used. */
  | 'room_gone'
  /** An invite to the player's room went out (the value is who to). */
  | 'room_invited'
  /** A friend buzzed the player's phone (the value is who). */
  | 'buzzed'
  /** The player's buzz went out (the value is who to). */
  | 'buzz_sent'
  /** Someone's friend link was opened: a request went to them (the value is who). */
  | 'friend_link'
  /** The jukebox could not take a song. */
  | 'tune_bad'
  | 'tune_full'
  | 'tune_long'
  /** A song went into the queue. */
  | 'tune_added'
  /** No smoking outside the smoking room. */
  | 'no_smoke'
  /** The status lines ran out and were cleared. */
  | 'lines_expired';

/** One line in the room chat panel. */
export type ChatLine = {
  key: number;
  kind: 'say' | 'whisper' | 'joined' | 'left';
  name: string;
  /** For whispers: who it went to. */
  to?: string;
  text?: string;
  self: boolean;
  /** When it was said: the server's clock for chat, this device's for comings and goings. */
  at: number;
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

/**
 * A study session at the table: focus blocks with breaks between them.
 * `timer` in the store is the focus block running now (others see it); breaks
 * and the free stopwatch stay on this device.
 */
export type StudySession = {
  plan: StudyPlanId;
  /** Null for the free stopwatch and for joining someone's block. */
  rhythm: StudyRhythm | null;
  /** 1-based. */
  round: number;
  /** 'between': a break ended and the next round waits for a yes. */
  phase: 'work' | 'break' | 'between' | 'free' | 'done';
  breakEndsAt: number | null;
  /** When the free stopwatch started. */
  startedAt: number;
};

/** Someone else in the room in the middle of a focus block, to join. */
export type RunningBlock = { id: string; name: string; endsAt: number; totalMs: number };

/** The questions asked after sitting down, in order. */
export type SitStep = 'activity' | 'timer';

/** Something found by looking closely: a shelf moment, a painting, the renovation. */
export type Discovery = {
  kind: 'shelf' | 'painting' | 'renovation' | 'flaw';
  /** Index into the content list for its kind. */
  index: number;
  /** Which moment of a shelf, or which note of the renovation. */
  pick: number;
};

/** What opened at the smoking room's game corner: one game, or the list of them. */
export type TableOpen = TableKind | 'menu';

const JUKEBOX_KEY = 'att.jukebox';
const LINES_UNTIL_KEY = 'att.linesUntil';

/** The jukebox on this device: listening or not, and how loud (never past the room's cap). */
function loadJukeboxPrefs(): { on: boolean; volume: number } {
  try {
    const stored = JSON.parse(localStorage.getItem(JUKEBOX_KEY) ?? 'null') as {
      on?: boolean;
      volume?: number;
    } | null;
    const volume = Number(stored?.volume ?? JUKEBOX.defaultVolume);
    return {
      on: stored?.on ?? true,
      volume: Math.min(JUKEBOX.maxVolume, Math.max(0, Number.isFinite(volume) ? volume : 0)),
    };
  } catch {
    return { on: true, volume: JUKEBOX.defaultVolume };
  }
}

function loadLinesUntil(): number | null {
  try {
    const until = Number(localStorage.getItem(LINES_UNTIL_KEY));
    return until > 0 ? until : null;
  } catch {
    return null;
  }
}

/** Where the ring of actions around the player opens, in screen pixels. */
export type Radial = { x: number; y: number };

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
  phoneOpen: boolean;
  /** The friend whose conversation is open on the phone; null shows the list. */
  phoneWith: string | null;
  /** Conversations loaded this session, by friend id, oldest message first. */
  conversations: Record<string, DirectMessage[]>;
  connected: boolean;
  playersHere: number;
  /** Everyone in the building and how many of them sit at a table, from the social socket. */
  world: { online: number; studying: number } | null;
  /** Pets sitting at the library door while their people study, from the social socket. */
  waitingPets: WaitingPet[];
  /** On phones the title plate and the map fold into small buttons; these open them. */
  plateOpen: boolean;
  mapOpen: boolean;
  /** The event calendar, opened from the clock. */
  calendarOpen: boolean;
  /** A machine in the smoking room being played. */
  game: 'arcade' | 'claw' | null;
  /** The private room the player is in or going into. */
  room: RoomTicket | null;
  /** The rooms panel (reception or elevator), and a code to fill in from a link or invite. */
  roomsOpen: boolean;
  roomCode: string | null;
  /** Someone in the room invited the player to theirs. */
  invite: { from: string; code: string; name: string } | null;
  /** Event music on or off (all sound has its own switch too). */
  musicOn: boolean;
  /** Renovation strips opened per room, as the server last said. */
  opened: Partial<Record<AreaId, number>>;
  radial: Radial | null;
  discovery: Discovery | null;
  /** The "what is Around the Table" note from the board, open over the game. */
  introOpen: boolean;
  /** The player dances (where the room allows it). */
  dancing: boolean;
  /** The player smokes (in the smoking room). */
  smoking: boolean;
  /** The smoking room's game tables, as the server last said. */
  tables: Partial<Record<TableKind, Table>>;
  tableOpen: TableOpen | null;
  jukebox: JukeboxState;
  jukeboxOpen: boolean;
  /** Listening to the jukebox on this device, and how loud. */
  jukeboxOn: boolean;
  jukeboxVolume: number;
  /** When the phone last buzzed, for the little shaking phone by the player's name. */
  buzzAt: number;
  /** Per friend: the newest of the player's messages they have read. */
  seen: Record<string, number>;
  /** When the status lines clear by themselves; null keeps them. */
  linesUntil: number | null;
  /** A room the player asked to go to from the phone (to a friend); the world takes them. */
  travel: AreaId | null;
  muted: boolean;
  /** People sitting at the table in this room right now, the player included. */
  studying: number;
  /** True while the chat input has focus, so the keyboard does not walk the character. */
  typing: boolean;
  notice: Notice | null;
  /** The person or number a notice is about, e.g. who poked you. */
  noticeValue: string | null;
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
  study: StudySession | null;
  /** Focus blocks running in the room that could be joined. */
  blocksHere: RunningBlock[];
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
  /** Opens the phone on a conversation, or on the list with null. */
  openPhone: (friend: string | null) => void;
  closePhone: () => void;
  /** Replaces a conversation with its history, or adds one message to it. */
  setConversation: (friend: string, messages: DirectMessage[]) => void;
  addMessage: (friend: string, message: DirectMessage) => void;
  setConnected: (connected: boolean) => void;
  setPlayersHere: (count: number) => void;
  setWorld: (world: { online: number; studying: number }, waiting: WaitingPet[]) => void;
  setPlateOpen: (open: boolean) => void;
  setCalendarOpen: (open: boolean) => void;
  setGame: (game: 'arcade' | 'claw' | null) => void;
  setRoom: (room: RoomTicket | null) => void;
  openRooms: (code?: string | null) => void;
  closeRooms: () => void;
  setInvite: (invite: { from: string; code: string; name: string } | null) => void;
  setMusicOn: (on: boolean) => void;
  setMapOpen: (open: boolean) => void;
  setOpened: (area: AreaId, opened: number) => void;
  setRadial: (radial: Radial | null) => void;
  setDiscovery: (discovery: Discovery | null) => void;
  setIntroOpen: (open: boolean) => void;
  setDancing: (dancing: boolean) => void;
  setSmoking: (smoking: boolean) => void;
  setTable: (kind: TableKind, table: Table | null) => void;
  setTableOpen: (open: TableOpen | null) => void;
  setJukebox: (state: JukeboxState) => void;
  setJukeboxOpen: (open: boolean) => void;
  /** Saves on this device whether to listen and how loud. */
  setJukeboxPrefs: (prefs: { on?: boolean; volume?: number }) => void;
  /** Shakes the phone by the player's name. */
  buzz: () => void;
  setSeen: (friend: string, upTo: number) => void;
  setTravel: (area: AreaId | null) => void;
  setMuted: (muted: boolean) => void;
  setStudying: (count: number) => void;
  setTyping: (typing: boolean) => void;
  setNotice: (notice: Notice | null, value?: string) => void;
  addChatLine: (line: Omit<ChatLine, 'key' | 'at'> & { at?: number }) => void;
  setChatOpen: (open: boolean) => void;
  setSelected: (selected: Selected | null) => void;
  /** Saves the lines on this device and shows them in the world; `until` clears them later. */
  setLines: (lines: StatusLines, until?: number | null) => void;
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
  /** Starts a plan: the first focus block (or the stopwatch, or someone else's block). */
  startSession: (
    plan: StudyPlanId,
    rhythm: StudyRhythm | null,
    dnd: boolean,
    join?: LocalTimer,
  ) => void;
  /** A focus block ended with rounds left: the break begins. */
  beginBreak: (minutes: number) => void;
  /** The break ended; waiting for the player. */
  breakOver: () => void;
  nextRound: () => void;
  /** The last focus block of the session ended. */
  finishStudy: () => void;
  setBlocksHere: (blocks: RunningBlock[]) => void;
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
  phoneOpen: false,
  phoneWith: null,
  conversations: {},
  connected: false,
  playersHere: 1,
  world: null,
  waitingPets: [],
  plateOpen: false,
  mapOpen: false,
  calendarOpen: false,
  game: null,
  room: null,
  roomsOpen: false,
  roomCode: null,
  invite: null,
  musicOn: isMusicOn(),
  opened: {},
  radial: null,
  discovery: null,
  introOpen: false,
  dancing: false,
  smoking: false,
  tables: {},
  tableOpen: null,
  jukebox: EMPTY_JUKEBOX,
  jukeboxOpen: false,
  jukeboxOn: loadJukeboxPrefs().on,
  jukeboxVolume: loadJukeboxPrefs().volume,
  buzzAt: 0,
  seen: {},
  linesUntil: loadLinesUntil(),
  travel: null,
  muted: isMuted(),
  studying: 0,
  typing: false,
  notice: null,
  noticeValue: null,
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
  study: null,
  blocksHere: [],
  dnd: false,
  cooldownUntil: {},
  setSession: (session) => set({ session }),
  setLook: (look) => {
    saveLook(look);
    set({ look });
  },
  // Each room has its own chat and people, so nothing carries over.
  setArea: (area) =>
    set({
      area,
      chatLog: [],
      unread: 0,
      selected: null,
      boardOpen: false,
      radial: null,
      discovery: null,
      dancing: false,
      smoking: false,
      game: null,
      tables: {},
      tableOpen: null,
      jukebox: EMPTY_JUKEBOX,
      jukeboxOpen: false,
    }),
  setConnection: (connection) => set({ connection }),
  setSocial: (social) => set({ social }),
  setFriends: (friends) => set({ friends }),
  setFriendsOpen: (friendsOpen) => set({ friendsOpen }),
  openPhone: (phoneWith) => set({ phoneOpen: true, phoneWith }),
  closePhone: () => set({ phoneOpen: false, phoneWith: null }),
  setConversation: (friend, messages) =>
    set((state) => ({ conversations: { ...state.conversations, [friend]: messages } })),
  addMessage: (friend, message) =>
    set((state) => {
      const before = state.conversations[friend] ?? [];
      // Another tab of this player may already have added it.
      if (before.some((m) => m.id === message.id)) return {};
      return {
        conversations: {
          ...state.conversations,
          [friend]: [...before, message].slice(-DM_HISTORY),
        },
      };
    }),
  setConnected: (connected) => set({ connected }),
  setPlayersHere: (playersHere) => set({ playersHere }),
  setWorld: (world, waitingPets) => set({ world, waitingPets }),
  setPlateOpen: (plateOpen) => set({ plateOpen }),
  setCalendarOpen: (calendarOpen) => set({ calendarOpen }),
  setGame: (game) => set({ game }),
  setRoom: (room) => set({ room }),
  openRooms: (roomCode = null) => set({ roomsOpen: true, roomCode }),
  closeRooms: () => set({ roomsOpen: false, roomCode: null }),
  setInvite: (invite) => set({ invite }),
  setMusicOn: (musicOn) => {
    setMusicOn(musicOn);
    set({ musicOn });
  },
  setMapOpen: (mapOpen) => set({ mapOpen }),
  setOpened: (area, opened) => set((state) => ({ opened: { ...state.opened, [area]: opened } })),
  setRadial: (radial) => set({ radial }),
  setDiscovery: (discovery) => set({ discovery }),
  setIntroOpen: (introOpen) => set({ introOpen }),
  setDancing: (dancing) => set(dancing ? { dancing, smoking: false } : { dancing }),
  setSmoking: (smoking) => set(smoking ? { smoking, dancing: false } : { smoking }),
  setTable: (kind, table) =>
    set((state) => {
      // A table nobody sits at any more drops out of the list.
      const tables = Object.fromEntries(
        Object.entries({ ...state.tables, [kind]: table }).filter(([, t]) => t),
      ) as Partial<Record<TableKind, Table>>;
      return { tables };
    }),
  setTableOpen: (tableOpen) => set({ tableOpen }),
  setJukebox: (jukebox) => set({ jukebox }),
  setJukeboxOpen: (jukeboxOpen) => set({ jukeboxOpen }),
  setJukeboxPrefs: (prefs) =>
    set((state) => {
      const on = prefs.on ?? state.jukeboxOn;
      const volume = Math.min(JUKEBOX.maxVolume, Math.max(0, prefs.volume ?? state.jukeboxVolume));
      try {
        localStorage.setItem(JUKEBOX_KEY, JSON.stringify({ on, volume }));
      } catch {
        // Private mode: the choice lasts for this visit.
      }
      return { jukeboxOn: on, jukeboxVolume: volume };
    }),
  buzz: () => set({ buzzAt: Date.now() }),
  setTravel: (travel) => set({ travel }),
  setSeen: (friend, upTo) =>
    set((state) =>
      (state.seen[friend] ?? 0) >= upTo ? {} : { seen: { ...state.seen, [friend]: upTo } },
    ),
  setMuted: (muted) => {
    setSoundMuted(muted);
    set({ muted });
  },
  setStudying: (studying) => set((state) => (state.studying === studying ? {} : { studying })),
  setTyping: (typing) => set({ typing }),
  setNotice: (notice, value) => set({ notice, noticeValue: value ?? null }),
  addChatLine: (line) =>
    set((state) => ({
      chatLog: [...state.chatLog, { ...line, at: line.at ?? Date.now(), key: ++chatLineKey }].slice(
        -CHAT_LOG_LINES,
      ),
      // Comings and goings are worth seeing but not worth a badge.
      unread: state.chatOpen
        ? 0
        : state.unread + (line.kind === 'say' || line.kind === 'whisper' ? 1 : 0),
    })),
  setChatOpen: (chatOpen) => set({ chatOpen, unread: 0 }),
  setSelected: (selected) => set({ selected }),
  setLines: (lines, until = null) => {
    saveLines(lines);
    try {
      if (until) localStorage.setItem(LINES_UNTIL_KEY, String(until));
      else localStorage.removeItem(LINES_UNTIL_KEY);
    } catch {
      // Private mode: the lines just stay.
    }
    set({ lines, linesUntil: until });
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
  stopTimer: () => set({ timer: null, study: null, dnd: false }),
  startSession: (plan, rhythm, dnd, join) => {
    const now = Date.now();
    const block = rhythm ? rhythm.workMinutes * 60_000 : 0;
    set({
      study: {
        plan,
        rhythm,
        round: 1,
        phase: plan === 'free' ? 'free' : 'work',
        breakEndsAt: null,
        startedAt: now,
      },
      timer: join ?? (block > 0 ? { endsAt: now + block, totalMs: block } : null),
      dnd,
    });
  },
  beginBreak: (minutes) =>
    set((state) =>
      state.study
        ? {
            timer: null,
            study: { ...state.study, phase: 'break', breakEndsAt: Date.now() + minutes * 60_000 },
          }
        : {},
    ),
  breakOver: () =>
    set((state) =>
      state.study ? { study: { ...state.study, phase: 'between', breakEndsAt: null } } : {},
    ),
  nextRound: () =>
    set((state) => {
      const study = state.study;
      if (!study?.rhythm) return {};
      const block = study.rhythm.workMinutes * 60_000;
      return {
        study: { ...study, phase: 'work', round: study.round + 1, breakEndsAt: null },
        timer: { endsAt: Date.now() + block, totalMs: block },
      };
    }),
  setBlocksHere: (blocksHere) => set({ blocksHere }),
  finishStudy: () =>
    set((state) => (state.study ? { study: { ...state.study, phase: 'done' }, dnd: false } : {})),
  setDnd: (dnd) => set({ dnd }),
  setCooldown: (area, until) =>
    set((state) => ({ cooldownUntil: { ...state.cooldownUntil, [area]: until } })),
  startOver: () =>
    set({
      session: null,
      look: null,
      lines: EMPTY_LINES,
      linesUntil: null,
      seen: {},
      selected: null,
      confirm: null,
      phoneOpen: false,
      phoneWith: null,
      conversations: {},
      seated: false,
      sitStep: null,
      activity: null,
      timer: null,
      study: null,
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
