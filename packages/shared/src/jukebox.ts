/**
 * The smoking room's jukebox: people queue YouTube videos and the room hears
 * them one after another, everyone at the same point of the same song. The
 * server keeps the queue and when the current song started; each screen plays
 * it in YouTube's own embedded player, quietly.
 */

export const JUKEBOX = {
  /** Songs waiting, at most. */
  queue: 20,
  /** Songs one person may have waiting at once, so a queue goes round the room. */
  perPerson: 2,
  /** Longest song taken, in seconds: a long mix is fine, an all-day stream is not. */
  maxSeconds: 3 * 60 * 60,
  /**
   * The room's volume (YouTube's 0–100 scale), the same for everyone and low,
   * in the background. Each person may only turn it down, on their own screen.
   */
  maxVolume: 12,
  defaultVolume: 12,
  /** Share of the room that must ask before a song is skipped. */
  skipShare: 0.5,
} as const;

export type Tune = {
  /** Unique in the room, for skipping the right one. */
  id: string;
  video: string;
  title: string;
  by: string;
  byName: string;
};

export type Playing = Tune & {
  startedAt: number;
  /** Length in seconds, once a player has told the server; null until then. */
  seconds: number | null;
  /** Who asked to skip it. */
  skips: string[];
};

export type JukeboxState = { now: Playing | null; queue: Tune[] };

export const EMPTY_JUKEBOX: JukeboxState = { now: null, queue: [] };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * The video id in a YouTube link (watch, youtu.be, shorts, embed, music) or a
 * bare id; null for anything else.
 */
export function parseYouTubeId(input: string): string | null {
  const text = input.trim();
  if (VIDEO_ID.test(text)) return text;
  // Shared code runs without the URL class, so links are read by pattern.
  const link = /^(?:https?:\/\/)?(?:www\.|m\.|music\.)?([a-z.-]+)(\/[^?#]*)?(\?[^#]*)?/i.exec(text);
  if (!link) return null;
  const host = (link[1] ?? '').toLowerCase();
  const path = link[2] ?? '/';
  const query = link[3] ?? '';
  let id: string | null = null;
  if (host === 'youtu.be') id = path.slice(1).split('/')[0] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (path === '/watch') id = /[?&]v=([^&]+)/.exec(query)?.[1] ?? null;
    else {
      const [, kind, value] = path.split('/');
      if (kind === 'shorts' || kind === 'embed' || kind === 'live') id = value ?? null;
    }
  }
  return id && VIDEO_ID.test(id) ? id : null;
}

/** How far into the current song the room is, in seconds. */
export function playedSeconds(now: Playing, at: number): number {
  return Math.max(0, (at - now.startedAt) / 1000);
}

/** Whether the current song is over by the clock (with a few seconds' grace). */
export function songOver(now: Playing, at: number): boolean {
  return now.seconds !== null && playedSeconds(now, at) >= now.seconds + 3;
}

/** How many skip requests a room of `people` needs. */
export function skipsNeeded(people: number): number {
  return Math.max(1, Math.ceil(people * JUKEBOX.skipShare));
}
