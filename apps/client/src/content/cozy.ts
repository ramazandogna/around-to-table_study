/**
 * The smoking room's own music: calm piano, guitar and strings by Kevin
 * MacLeod (incompetech.com), licensed CC BY 4.0, kept in `public/music`.
 * It plays whenever nobody queued a song on the jukebox. Where in the list
 * the room is comes from the clock, so everyone hears the same moment.
 */
export type CozyTrack = { file: string; title: string; seconds: number };

export const COZY_ARTIST = 'Kevin MacLeod';
export const COZY_LICENSE = 'CC BY 4.0';

export const COZY: readonly CozyTrack[] = [
  { file: 'gymnopedie-no-1.m4a', title: 'Gymnopédie No. 1', seconds: 187 },
  { file: 'laid-back-guitars.m4a', title: 'Laid Back Guitars', seconds: 244 },
  { file: 'peaceful-desolation.m4a', title: 'Peaceful Desolation', seconds: 91 },
  { file: 'lobby-time.m4a', title: 'Lobby Time', seconds: 193 },
  { file: 'sad-trio.m4a', title: 'Sad Trio', seconds: 251 },
  { file: 'easy-lemon.m4a', title: 'Easy Lemon', seconds: 126 },
  { file: 'meditation-impromptu-01.m4a', title: 'Meditation Impromptu 01', seconds: 212 },
  { file: 'touching-moments-two---higher.m4a', title: 'Touching Moments Two', seconds: 174 },
];

const LOOP = COZY.reduce((sum, track) => sum + track.seconds, 0);

/** The track the room is on at a moment, and how far into it. */
export function cozyAt(now: number): { index: number; track: CozyTrack; offset: number } {
  let at = (now / 1000) % LOOP;
  for (const [index, track] of COZY.entries()) {
    if (at < track.seconds) return { index, track, offset: at };
    at -= track.seconds;
  }
  const first = COZY[0] as CozyTrack;
  return { index: 0, track: first, offset: 0 };
}
