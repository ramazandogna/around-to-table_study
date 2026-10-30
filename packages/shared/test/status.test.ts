import { describe, expect, it } from 'vitest';
import { cleanStatusLines, EMPTY_LINES, hasStatusLines, parseClientMessage } from '../src';

describe('status lines', () => {
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
