import { describe, expect, it } from 'vitest';
import {
  cleanNote,
  cleanStatusLines,
  EMPTY_LINES,
  hasStatusLines,
  parseClientMessage,
  STATUS_LIMITS,
} from '../src';

describe('status lines', () => {
  it('keeps the vibe, and takes lines without one from older clients', () => {
    expect(cleanStatusLines({ ...EMPTY_LINES, vibe: 'buddy' })?.vibe).toBe('buddy');
    const older: Partial<typeof EMPTY_LINES> = { ...EMPTY_LINES };
    delete older.vibe;
    expect(cleanStatusLines(older as typeof EMPTY_LINES)?.vibe).toBeNull();
    expect(hasStatusLines({ ...EMPTY_LINES, vibe: 'chat' })).toBe(true);
  });

  it('trims and cuts every line to its length', () => {
    const lines = cleanStatusLines({
      announcement: '  we need   3 more people for our tuesday room, please  ',
      doing: 'reading',
      doingNote: '1984 by george orwell, part two',
      mood: null,
      moodNote: 'left over',
    });
    expect(lines).toEqual({
      announcement: 'we need 3 more people for our tuesday ro',
      doing: 'reading',
      doingNote: '1984 by george orwel',
      mood: null,
      moodNote: '',
      vibe: null,
    });
  });

  it('refuses links anywhere', () => {
    expect(cleanStatusLines({ ...EMPTY_LINES, announcement: 'join at example.com' })).toBeNull();
    expect(
      cleanStatusLines({ ...EMPTY_LINES, mood: 'happy', moodNote: 'www.spam' + '.io' }),
    ).toBeNull();
  });

  it('knows when there is nothing to show', () => {
    expect(hasStatusLines(EMPTY_LINES)).toBe(false);
    expect(hasStatusLines({ ...EMPTY_LINES, mood: 'calm' })).toBe(true);
  });

  it('accepts lines and emotes as messages', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'lines', lines: EMPTY_LINES }))).not.toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'emote', emote: 'wave' }))).not.toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'emote', emote: 'dance' }))).toBeNull();
  });
});

describe('cleanNote', () => {
  it('keeps a plain note, cut to the status line length', () => {
    expect(cleanNote('reading chapter 4')).toBe('reading chapter 4');
    expect(cleanNote('a'.repeat(80))).toHaveLength(STATUS_LIMITS.announcement);
  });
  it('drops a note with a link or a swear', () => {
    expect(cleanNote('visit evil.com now')).toBe('');
    expect(cleanNote('visit evil．com now')).toBe('');
    expect(cleanNote('you fucking idiot')).toBe('');
  });
});
