import {
  DM_HISTORY,
  EMPTY_JUKEBOX,
  EMPTY_LINES,
  JUKEBOX,
  type JukeboxState,
  type Profile,
  type ProposedEvent,
  type Role,
  type RoomRules,
  type Shout,
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
  | 'lines_expired'
  /** Someone blocked the player (the value is who). */
  | 'blocked_by'
  /** The player blocked, muted or unmuted someone (the value is who). */
  | 'blocked'
  | 'muted_person'
  | 'unmuted_person'
  /** One of the two blocked the other, so it did not go through. */
  | 'blocked_between'
  | 'forbidden'
  | 'bad_event'
  | 'too_many_events'
  /** A proposed event went to the admins. */
  | 'event_proposed'
  /** An admin approved or turned down the player's event (the value is its title). */
  | 'event_approved'
  | 'event_rejected'
  /** The private room's owner sent the player out, banned them, or closed the room. */
  | 'kicked'
  | 'banned'
  | 'room_closed'
  /** Building-wide chat is read-only in the library. */
  | 'shout_quiet'
  /** A friend request went out (the value is who to). */
  | 'friend_sent'
  /** Something that cannot be done right now; the value says why. */
  | 'off';

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

/**
 * The person whose card is open, with their status lines as they were when
 * tapped; `view` opens it on the profile or straight on the whisper.
 */
export type Selected = {
  id: string;
  name: string;
  lines: StatusLines;
  view?: 'profile' | 'whisper';
};

/** Something that happened to the player, kept in the bell's list until read. */
export type InboxItem = {
  key: number;
  kind:
    | 'dm'
    | 'poke'
    | 'invite'
    | 'friend_request'
    | 'friend_accepted'
    | 'buzz'
    | 'event_approved'
    | 'event_rejected'
    | 'blocked_by'
    | 'kicked'
    | 'banned'
    | 'room_closed';
  name: string;
  /** Whose it is, to open their conversation or card. */
  from?: string | undefined;
  /** A room code for invites. */
  code?: string | undefined;
  at: number;
};

const INBOX_SIZE = 40;
let inboxKey = 0;
const MUTED_KEY = 'att.mutedPeople';

function loadMuted(): Record<string, string> {
  try {
    const stored = JSON.parse(localStorage.getItem(MUTED_KEY) ?? '{}') as unknown;
    return stored && typeof stored === 'object' ? (stored as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** What the player chose when asked before the world goes on. */
export type ConfirmChoice = 'break' | 'end' | 'stay';

/**
 * A question the world waits on: standing up from a running timer, or leaving
 * the library with one.
 */
export type Confirm = {
  /** Also asked before blocking someone and before closing a private room. */
  kind: 'stand' | 'leave' | 'block' | 'closeRoom' | 'sofa';
  /** Who or what it is about, for the question's text. */
  name?: string;
  answer: (choice: ConfirmChoice) => void;
};

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
  kind: 'shelf' | 'painting' | 'renovation' | 'flaw' | 'lost';
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

/** The panels along the top of a phone's screen that can cover one another. */
export type Layer = 'plate' | 'map' | 'timer';

/** A top panel's z-index: the one that came up last is highest. */
export function layerIndex(layers: Record<Layer, number>, layer: Layer): number {
  const order = (Object.keys(layers) as Layer[]).sort((a, b) => layers[a] - layers[b]);
  return 4 + order.indexOf(layer);
}

/** Where the ring of actions around the player opens, in screen pixels. */
/**
 * Where a ring of actions opens, in screen pixels, and around whom: the player
 * (their actions, or the emotes), or someone else (what to do with them).
 */
export type Radial = {
  x: number;
  y: number;
  mode?: 'self' | 'emote' | 'person' | undefined;
  /** For 'person': who, by name, with their status lines as they were when tapped. */
  id?: string | undefined;
  name?: string | undefined;
  lines?: StatusLines | undefined;
};

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
  role: Role;
  /** People the player blocked (on the server) and muted (on this device only). */
  blocked: { id: string; name: string }[];
  mutedPeople: Record<string, string>;
  /** The building-wide chat, newest last, and lines not seen yet. */
  shouts: Shout[];
  shoutUnread: number;
  chatTab: 'room' | 'building';
  /** Proposed events as the server shows them to this player. */
  proposed: ProposedEvent[];
  /** A profile card opened, or the id being loaded. */
  profile: Profile | null;
  profileId: string | null;
  inbox: InboxItem[];
  inboxOpen: boolean;
  inboxUnread: number;
  /** The private room's rules while inside it; people inside, for its owner to manage. */
  roomRules: RoomRules | null;
  roomPeople: { id: string; name: string }[];
  roomAdminOpen: boolean;
  roomBans: { id: string; name: string }[];
  adminOpen: boolean;
  admins: { id: string; name: string }[];
  peopleOpen: boolean;
  eventFormOpen: boolean;
  /** Changing rooms: the loader shows while true. */
  loading: boolean;
  /** The early beta asks for the access password when making a character. */
  accessRequired: boolean;
  /**
   * When each of the top panels last came up (the plate, the map, the timer),
   * so the one opened last sits on top of the others on a small screen.
   */
  layers: Record<Layer, number>;
  /** The on-screen joystick's push, in screen directions (right, down), up to 1; null at rest. */
  stick: { x: number; y: number } | null;
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
  setMe: (role: Role, blocked: { id: string; name: string }[]) => void;
  mute: (id: string, name: string) => void;
  unmute: (id: string) => void;
  addShouts: (lines: Shout[], replace?: boolean) => void;
  setChatTab: (tab: 'room' | 'building') => void;
  setProposed: (events: ProposedEvent[]) => void;
  openProfile: (id: string | null) => void;
  setProfile: (profile: Profile | null) => void;
  /** Tells the player about something with a notice, and keeps it in the bell's list. */
  notify: (item: Omit<InboxItem, 'key' | 'at'>, notice?: Notice) => void;
  setInboxOpen: (open: boolean) => void;
  setRoomRules: (rules: RoomRules | null) => void;
  setRoomPeople: (people: { id: string; name: string }[]) => void;
  setRoomAdminOpen: (open: boolean) => void;
  setRoomBans: (banned: { id: string; name: string }[]) => void;
  setAdminOpen: (open: boolean) => void;
  setAdmins: (admins: { id: string; name: string }[]) => void;
  setPeopleOpen: (open: boolean) => void;
  setEventFormOpen: (open: boolean) => void;
  setLoading: (loading: boolean) => void;
  setAccessRequired: (required: boolean) => void;
  raise: (layer: Layer) => void;
  setStick: (stick: { x: number; y: number } | null) => void;
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
  role: 'user',
  blocked: [],
  mutedPeople: loadMuted(),
  shouts: [],
  shoutUnread: 0,
  chatTab: 'room',
  proposed: [],
  profile: null,
  profileId: null,
  inbox: [],
  inboxOpen: false,
  inboxUnread: 0,
  roomRules: null,
  roomPeople: [],
  roomAdminOpen: false,
  roomBans: [],
  adminOpen: false,
  admins: [],
  peopleOpen: false,
  eventFormOpen: false,
  loading: true,
  accessRequired: false,
  layers: { plate: 0, map: 0, timer: 0 },
  stick: null,
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
      roomPeople: [],
      roomAdminOpen: false,
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
  setPlateOpen: (plateOpen) => {
    set({ plateOpen });
    if (plateOpen) useGameStore.getState().raise('plate');
  },
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
  setMapOpen: (mapOpen) => {
    set({ mapOpen });
    if (mapOpen) useGameStore.getState().raise('map');
  },
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
  setMe: (role, blocked) => set({ role, blocked }),
  mute: (id, name) =>
    set((state) => {
      const mutedPeople = { ...state.mutedPeople, [id]: name };
      try {
        localStorage.setItem(MUTED_KEY, JSON.stringify(mutedPeople));
      } catch {
        // Private mode: muted for this visit.
      }
      return { mutedPeople };
    }),
  unmute: (id) =>
    set((state) => {
      const mutedPeople = Object.fromEntries(
        Object.entries(state.mutedPeople).filter(([key]) => key !== id),
      );
      try {
        localStorage.setItem(MUTED_KEY, JSON.stringify(mutedPeople));
      } catch {
        // Private mode.
      }
      return { mutedPeople };
    }),
  addShouts: (lines, replace = false) =>
    set((state) => {
      const shouts = (replace ? lines : [...state.shouts, ...lines]).slice(-100);
      const fresh = replace ? 0 : lines.filter((l) => l.from !== state.session?.id).length;
      const reading = state.chatOpen && state.chatTab === 'building';
      return { shouts, shoutUnread: reading ? 0 : state.shoutUnread + fresh };
    }),
  setChatTab: (chatTab) =>
    set((state) => ({ chatTab, shoutUnread: chatTab === 'building' ? 0 : state.shoutUnread })),
  setProposed: (proposed) => set({ proposed }),
  openProfile: (profileId) => set({ profileId, profile: null }),
  setProfile: (profile) =>
    set((state) => (profile && profile.id !== state.profileId ? {} : { profile })),
  notify: (item, notice) =>
    set((state) => ({
      inbox: [{ ...item, key: ++inboxKey, at: Date.now() }, ...state.inbox].slice(0, INBOX_SIZE),
      inboxUnread: state.inboxOpen ? 0 : state.inboxUnread + 1,
      ...(notice ? { notice, noticeValue: item.name } : {}),
    })),
  setInboxOpen: (inboxOpen) => set(inboxOpen ? { inboxOpen, inboxUnread: 0 } : { inboxOpen }),
  setRoomRules: (roomRules) => set({ roomRules }),
  setRoomPeople: (roomPeople) => set({ roomPeople }),
  setRoomAdminOpen: (roomAdminOpen) => set({ roomAdminOpen }),
  setRoomBans: (roomBans) => set({ roomBans }),
  setAdminOpen: (adminOpen) => set({ adminOpen }),
  setAdmins: (admins) => set({ admins }),
  setPeopleOpen: (peopleOpen) => set({ peopleOpen }),
  setEventFormOpen: (eventFormOpen) => set({ eventFormOpen }),
  setLoading: (loading) => set({ loading }),
  setAccessRequired: (accessRequired) => set({ accessRequired }),
  setStick: (stick) => set({ stick }),
  raise: (layer) =>
    set((state) => ({
      layers: { ...state.layers, [layer]: Math.max(...Object.values(state.layers)) + 1 },
    })),
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
  setChatOpen: (chatOpen) =>
    set((state) => ({
      chatOpen,
      unread: 0,
      shoutUnread: chatOpen && state.chatTab === 'building' ? 0 : state.shoutUnread,
    })),
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
  // What to work on is asked at the chair, before sitting; once seated, the timer is next
  // (unless a session is already going). Standing up clears the table.
  setSeated: (seated) =>
    set((state) =>
      seated
        ? {
            seated,
            sitStep: state.activity
              ? (state.sitStep ?? (state.timer || state.study ? null : 'timer'))
              : 'activity',
          }
        : { seated, sitStep: null, activity: null },
    ),
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
      role: 'user',
      blocked: [],
      inbox: [],
      inboxUnread: 0,
      shouts: [],
      proposed: [],
      profile: null,
      profileId: null,
    }),
}));

/** The player's study status as the server expects it. */
export function studyStatus(state: GameState = useGameStore.getState()): StudyStatus {
  const { activity, timer, dnd, study } = state;
  return {
    // Which focus block of the session, for others to see ("2 of 4").
    round:
      study?.rhythm && study.rhythm.rounds > 1 && study.phase !== 'free'
        ? { n: study.round, of: study.rhythm.rounds }
        : null,
    activity,
    timer: timer
      ? { remainingMs: Math.max(0, Math.round(timer.endsAt - Date.now())), totalMs: timer.totalMs }
      : null,
    dnd,
  };
}
