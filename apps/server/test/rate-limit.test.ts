import { describe, expect, it } from 'vitest';
import { takeToken } from '../src/rate-limit';

describe('takeToken', () => {
  it('allows up to the limit inside a window', () => {
    let window = { start: 0, count: 0 };
    for (let i = 0; i < 3; i++) {
      const next = takeToken(window, 100, 3, 1000);
      expect(next).not.toBeNull();
      if (next) window = next;
    }
    expect(takeToken(window, 200, 3, 1000)).toBeNull();
  });

  it('starts a new window once the old one has passed', () => {
    expect(takeToken({ start: 0, count: 3 }, 1000, 3, 1000)).toEqual({ start: 1000, count: 1 });
  });
});
