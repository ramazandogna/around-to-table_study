import { DECOR_LEAD_MS, type ProposedEvent } from './events';
import { parseYouTubeId } from './jukebox';
import { maskProfanity } from './profanity';

/**
 * The conference hall's stage. A presenter opens one thing on the big screen
 * (a picture, a YouTube video, a sound) and everyone in the hall sees and
 * hears the same thing at the same moment, like a room watching one TV. It is
 * not a screen share: only a link travels, and each screen loads it itself.
 *
 * Links only, for now: no uploads (that needs storage) and no PDF (hard to read
 * on a phone). A new kind is a new entry in `STAGE_KINDS` and in `cleanStage`.
 */

export const STAGE_KINDS = ['image', 'youtube', 'audio'] as const;
export type StageKind = (typeof STAGE_KINDS)[number];

export const STAGE_LIMITS = {
  /** Longest link taken. */
  src: 500,
  /** Longest caption under the screen. */
  caption: 80,
  /** Stage changes (show, play, pause, seek, clear) per presenter per minute. */
  perMinute: 20,
  /** Furthest a seek may jump, in seconds (a long concert recording). */
  maxSeconds: 6 * 60 * 60,
} as const;

/**
 * Hosts pictures and sounds may come from: places that serve files over https
 * with a stable link, so every screen loads the same file and the worker never
 * has to fetch or relay anything.
 */
export const IMAGE_HOSTS = [
  'i.imgur.com',
  'upload.wikimedia.org',
  'images.unsplash.com',
  'raw.githubusercontent.com',
  'user-images.githubusercontent.com',
  'i.ibb.co',
  'pbs.twimg.com',
] as const;

export const AUDIO_HOSTS = [
  'upload.wikimedia.org',
  'archive.org',
  'raw.githubusercontent.com',
  'files.freemusicarchive.org',
  'cdn.pixabay.com',
] as const;

const IMAGE_FILE = /\.(png|jpe?g|gif|webp|avif)$/i;
const AUDIO_FILE = /\.(mp3|ogg|oga|opus|m4a|wav)$/i;
/** Hosts whose image links carry no file ending (Unsplash serves by id). */
const IMAGE_WITHOUT_ENDING: ReadonlySet<string> = new Set(['images.unsplash.com', 'pbs.twimg.com']);

/** What is on the screen now. Times are the server's clock in milliseconds. */
export type StageState = {
  kind: StageKind;
  /** The link for a picture or a sound; the video id for YouTube. */
  src: string;
  caption: string;
  by: string;
  byName: string;
  /** When the video or sound would have been at its start, had it played without stopping. */
  startedAt: number;
  /** While paused: when it was paused. */
  pausedAt: number | null;
};

export type StageShow = { kind: StageKind; src: string; caption?: string | undefined };
export type StageError = 'stage_link' | 'stage_host';

/** Splits an https link into host and path without the URL class (shared code runs anywhere). */
function readLink(text: string): { host: string; path: string } | null {
  const match = /^https:\/\/([a-z0-9.-]+)(?::\d+)?(\/[^\s?#]*)?(\?[^\s#]*)?(#\S*)?$/i.exec(text);
  if (!match) return null;
  return { host: (match[1] ?? '').toLowerCase(), path: match[2] ?? '/' };
}

/**
 * A presenter's link made safe to show, or why it cannot be: YouTube links
 * become a video id, pictures and sounds must be https files from a known host.
 * The caption is cut to length and any swear in it is masked.
 */
export function cleanStage(
  show: StageShow,
): { ok: true; kind: StageKind; src: string; caption: string } | { ok: false; error: StageError } {
  const text = show.src.trim();
  const caption = maskProfanity((show.caption ?? '').trim().slice(0, STAGE_LIMITS.caption)).text;
  if (!text || text.length > STAGE_LIMITS.src) return { ok: false, error: 'stage_link' };
  if (show.kind === 'youtube') {
    const id = parseYouTubeId(text);
    return id
      ? { ok: true, kind: 'youtube', src: id, caption }
      : { ok: false, error: 'stage_link' };
  }
  const link = readLink(text);
  if (!link) return { ok: false, error: 'stage_link' };
  const hosts: readonly string[] = show.kind === 'image' ? IMAGE_HOSTS : AUDIO_HOSTS;
  if (!hosts.includes(link.host)) return { ok: false, error: 'stage_host' };
  const file = show.kind === 'image' ? IMAGE_FILE : AUDIO_FILE;
  const needsEnding = !(show.kind === 'image' && IMAGE_WITHOUT_ENDING.has(link.host));
  if (needsEnding && !file.test(link.path)) return { ok: false, error: 'stage_link' };
  return { ok: true, kind: show.kind, src: text, caption };
}

/** Which kind a pasted link most likely is: YouTube, a sound file, or else a picture. */
export function guessStageKind(text: string): StageKind {
  if (parseYouTubeId(text)) return 'youtube';
  const link = readLink(text.trim());
  return link && AUDIO_FILE.test(link.path) ? 'audio' : 'image';
}

/** How far into the video or sound the room is, in seconds, at server time `now`. */
export function stagePosition(state: StageState, now: number): number {
  const at = state.pausedAt ?? now;
  return Math.max(0, (at - state.startedAt) / 1000);
}

export type StageControl = { action: 'play' | 'pause' | 'seek'; at?: number | undefined };

/** The stage after a play, pause or seek, at server time `now`. Pictures do not change. */
export function controlStage(state: StageState, control: StageControl, now: number): StageState {
  if (state.kind === 'image') return state;
  switch (control.action) {
    case 'pause':
      return state.pausedAt === null ? { ...state, pausedAt: now } : state;
    case 'play':
      return state.pausedAt === null
        ? state
        : { ...state, startedAt: state.startedAt + (now - state.pausedAt), pausedAt: null };
    case 'seek': {
      const seconds = Math.min(STAGE_LIMITS.maxSeconds, Math.max(0, control.at ?? 0));
      const startedAt = now - seconds * 1000;
      return { ...state, startedAt, pausedAt: state.pausedAt === null ? null : now };
    }
  }
}

/**
 * Who may be in the conference hall now, and who may present. It is closed
 * except around an approved event held there: from `DECOR_LEAD_MS` before it
 * starts until it ends, everyone may come in and the person who proposed it
 * presents. Admins, and anyone on a local server (no access password), may
 * always come in and present, to set things up and to test.
 */
export type ConferenceRole = 'presenter' | 'audience' | null;

export function conferenceRole(
  id: string,
  events: readonly Pick<ProposedEvent, 'area' | 'start' | 'minutes' | 'by' | 'status'>[],
  now: number,
  { open }: { open: boolean },
): ConferenceRole {
  if (open) return 'presenter';
  const live = events.filter(
    (event) =>
      event.area === 'conference' &&
      event.status === 'approved' &&
      now >= event.start - DECOR_LEAD_MS &&
      now < event.start + event.minutes * 60_000,
  );
  if (live.length === 0) return null;
  return live.some((event) => event.by === id) ? 'presenter' : 'audience';
}
