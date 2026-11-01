import { describe, expect, it } from 'vitest';
import { parseYouTubeId, skipsNeeded, songOver, type Playing } from '../src';

describe('jukebox links', () => {
  it('reads every common YouTube link', () => {
    const id = 'jfKfPfyJRdk';
    for (const link of [
      id,
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?feature=share&v=${id}&t=30`,
      `youtu.be/${id}`,
      `https://youtu.be/${id}?si=abc`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://music.youtube.com/watch?v=${id}`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/live/${id}`,
      `https://www.youtube-nocookie.com/embed/${id}`,
    ]) {
      expect(parseYouTubeId(link)).toBe(id);
    }
  });

  it('refuses other sites and broken ids', () => {
    expect(parseYouTubeId('https://vimeo.com/123456789')).toBeNull();
    expect(parseYouTubeId('https://evil.com/watch?v=jfKfPfyJRdk')).toBeNull();
    expect(parseYouTubeId('https://youtube.com/watch?v=short')).toBeNull();
    expect(parseYouTubeId('hello')).toBeNull();
  });

  it('knows when a song is over and how many must ask to skip', () => {
    const now: Playing = {
      id: '1',
      video: 'x',
      title: 't',
      by: 'a',
      byName: 'A',
      startedAt: 0,
      seconds: 100,
      skips: [],
    };
    expect(songOver(now, 100_000)).toBe(false);
    expect(songOver(now, 104_000)).toBe(true);
    expect(songOver({ ...now, seconds: null }, 1e9)).toBe(false);
    expect(skipsNeeded(1)).toBe(1);
    expect(skipsNeeded(5)).toBe(3);
  });
});
