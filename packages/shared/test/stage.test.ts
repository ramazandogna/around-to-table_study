import { describe, expect, it } from 'vitest';
import {
  cleanStage,
  conferenceRole,
  controlStage,
  DECOR_LEAD_MS,
  guessStageKind,
  stagePosition,
  type StageState,
} from '../src';

const at = (startedAt: number, pausedAt: number | null = null): StageState => ({
  kind: 'youtube',
  src: 'aqz-KE-bpKQ',
  caption: '',
  by: 'a',
  byName: 'Ada',
  startedAt,
  pausedAt,
});

describe('cleanStage', () => {
  it('turns any YouTube link into its video id', () => {
    for (const link of [
      'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      'https://youtu.be/aqz-KE-bpKQ',
      'aqz-KE-bpKQ',
    ]) {
      expect(cleanStage({ kind: 'youtube', src: link })).toMatchObject({
        ok: true,
        src: 'aqz-KE-bpKQ',
      });
    }
    expect(cleanStage({ kind: 'youtube', src: 'https://vimeo.com/123' })).toEqual({
      ok: false,
      error: 'stage_link',
    });
    expect(cleanStage({ kind: 'youtube', src: 'https://youtu.be/short' }).ok).toBe(false);
  });

  it('takes pictures and sounds only over https, from known hosts, as files', () => {
    expect(cleanStage({ kind: 'image', src: 'https://i.imgur.com/abc123.png' })).toMatchObject({
      ok: true,
    });
    expect(cleanStage({ kind: 'image', src: 'http://i.imgur.com/abc123.png' })).toEqual({
      ok: false,
      error: 'stage_link',
    });
    expect(cleanStage({ kind: 'image', src: 'https://evil.example/abc.png' })).toEqual({
      ok: false,
      error: 'stage_host',
    });
    // A page on a known host is not a picture.
    expect(cleanStage({ kind: 'image', src: 'https://i.imgur.com/gallery/abc' }).ok).toBe(false);
    // Unsplash serves pictures without a file ending.
    expect(cleanStage({ kind: 'image', src: 'https://images.unsplash.com/photo-1?w=800' }).ok).toBe(
      true,
    );
    expect(
      cleanStage({
        kind: 'audio',
        src: 'https://upload.wikimedia.org/wikipedia/commons/c/c8/Example.ogg',
      }).ok,
    ).toBe(true);
    expect(cleanStage({ kind: 'audio', src: 'https://i.imgur.com/a.mp3' })).toEqual({
      ok: false,
      error: 'stage_host',
    });
    expect(
      cleanStage({ kind: 'image', src: `https://i.imgur.com/${'a'.repeat(600)}.png` }).ok,
    ).toBe(false);
  });

  it('cuts the caption to length and masks swears in it', () => {
    const clean = cleanStage({ kind: 'youtube', src: 'aqz-KE-bpKQ', caption: 'what the fuck' });
    expect(clean).toMatchObject({ ok: true });
    if (clean.ok) expect(clean.caption).not.toMatch(/fuck/);
    const long = cleanStage({ kind: 'youtube', src: 'aqz-KE-bpKQ', caption: 'x'.repeat(200) });
    if (long.ok) expect(long.caption).toHaveLength(80);
  });
});

describe('guessStageKind', () => {
  it('tells YouTube, sounds and pictures apart', () => {
    expect(guessStageKind('https://youtu.be/aqz-KE-bpKQ')).toBe('youtube');
    expect(guessStageKind('https://archive.org/download/x/song.mp3')).toBe('audio');
    expect(guessStageKind('https://i.imgur.com/a.png')).toBe('image');
  });
});

describe('stage timing', () => {
  it('counts the room forward from the start, and holds still while paused', () => {
    expect(stagePosition(at(1_000), 11_000)).toBe(10);
    expect(stagePosition(at(1_000, 6_000), 60_000)).toBe(5);
  });

  it('pauses, plays on from the same point, and seeks', () => {
    const paused = controlStage(at(0), { action: 'pause' }, 30_000);
    expect(stagePosition(paused, 90_000)).toBe(30);
    const playing = controlStage(paused, { action: 'play' }, 90_000);
    expect(playing.pausedAt).toBeNull();
    expect(stagePosition(playing, 100_000)).toBe(40);
    const sought = controlStage(playing, { action: 'seek', at: 120 }, 100_000);
    expect(stagePosition(sought, 100_000)).toBe(120);
    // Seeking while paused stays paused at the new point.
    const pausedSeek = controlStage(paused, { action: 'seek', at: 5 }, 200_000);
    expect(pausedSeek.pausedAt).toBe(200_000);
    expect(stagePosition(pausedSeek, 500_000)).toBe(5);
  });

  it('leaves a picture alone', () => {
    const picture = { ...at(0), kind: 'image' as const };
    expect(controlStage(picture, { action: 'pause' }, 10)).toBe(picture);
  });
});

describe('conferenceRole', () => {
  const start = 10 * 60 * 60_000;
  const event = {
    area: 'conference' as const,
    start,
    minutes: 60,
    by: 'host',
    status: 'approved' as const,
  };

  it('is closed with no event, and open to everyone on a local server', () => {
    expect(conferenceRole('x', [], start, { open: false })).toBeNull();
    expect(conferenceRole('x', [], start, { open: true })).toBe('presenter');
  });

  it('opens around an approved event: its proposer presents, the rest watch', () => {
    expect(conferenceRole('host', [event], start - DECOR_LEAD_MS - 1, { open: false })).toBeNull();
    expect(conferenceRole('host', [event], start - DECOR_LEAD_MS, { open: false })).toBe(
      'presenter',
    );
    expect(conferenceRole('guest', [event], start + 1, { open: false })).toBe('audience');
    expect(conferenceRole('guest', [event], start + 60 * 60_000, { open: false })).toBeNull();
  });

  it('ignores events still waiting and events in other rooms', () => {
    expect(
      conferenceRole('host', [{ ...event, status: 'pending' }], start, { open: false }),
    ).toBeNull();
    expect(
      conferenceRole('host', [{ ...event, area: 'smoking' }], start, { open: false }),
    ).toBeNull();
  });
});
