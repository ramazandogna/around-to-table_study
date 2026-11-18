import { describe, expect, it } from 'vitest';
import { PAINTINGS, SHELF_TOPICS } from '../content/discoveries';
import { staffLine, type TalkContext } from './staffTalk';

const base: TalkContext = {
  name: 'Ayşe',
  area: 'hall',
  kind: 'receptionist',
  phase: 'morning',
  weather: 'rain',
  studying: 3,
  found: new Set(),
  own: ['staff.receptionDay.1', 'staff.receptionDay.2'],
};

/** Every thing there is to find, as the device remembers it. */
const everything = new Set([
  ...PAINTINGS.map((_, i) => `painting:${i}`),
  ...SHELF_TOPICS.flatMap((topic, i) => topic.moments.map((_, pick) => `shelf:${i}:${pick}`)),
  'cat:0',
]);

describe('what staff say', () => {
  it('greets by name, hints, counts, mentions the weather, then their own lines', () => {
    const lines = Array.from({ length: 6 }, (_, turn) => staffLine(turn, base));
    expect(lines[0]).toContain('Ayşe');
    expect(lines[1]).toMatch(/painting|story/);
    expect(lines[2]).toContain('3 people');
    expect(lines[3]).toContain('raining');
    expect(lines[4]).toBe('welcome! the library is straight ahead.');
    // The next round says their other own line.
    expect(staffLine(9, base)).toBe('want a room of your own? just ask at the desk.');
  });

  it('never gives a count below two and never says how long anyone was away', () => {
    const alone = Array.from({ length: 8 }, (_, turn) => staffLine(turn, { ...base, studying: 1 }));
    expect(alone.join(' ')).not.toMatch(/\d+ people/);
    expect(alone.join(' ')).not.toMatch(/days|missed/);
  });

  it('points the librarian at the shelves first, and stops hinting once all is found', () => {
    expect(staffLine(1, { ...base, area: 'library', kind: 'librarian' })).toContain('shelf');
    const done = Array.from({ length: 4 }, (_, turn) =>
      staffLine(turn, { ...base, found: everything }),
    );
    expect(done.join(' ')).not.toMatch(/haven't|have you/);
  });

  it('tells of the cat once the paintings here are seen', () => {
    const seenHere = new Set([...everything].filter((key) => key !== 'cat:0'));
    expect(staffLine(1, { ...base, found: seenHere })).toContain('Simit');
  });
});
