import { describe, expect, it } from 'vitest';
import { normalizeChat, normalizeName, parseClientMessage } from '../src';

describe('parseClientMessage', () => {
  it('accepts a valid move', () => {
    expect(parseClientMessage('{"t":"move","to":{"x":3,"y":4}}')).toEqual({
      t: 'move',
      to: { x: 3, y: 4 },
    });
  });

  it.each(['not json', '{"t":"teleport"}', '{"t":"move","to":{"x":1.5,"y":2}}', '[]'])(
    'rejects %s',
    (raw) => {
      expect(parseClientMessage(raw)).toBeNull();
    },
  );
});

describe('normalizeName', () => {
  it.each([
    ['  ramazan  ', 'ramazan'],
    ['Ayşe Nur', 'Ayşe Nur'],
    ['さくら', 'さくら'],
  ])('accepts %s', (raw, expected) => {
    expect(normalizeName(raw)).toBe(expected);
  });

  it.each(['a', 'x'.repeat(21), '<script>', 'hi!'])('rejects %s', (raw) => {
    expect(normalizeName(raw)).toBeNull();
  });
});

describe('normalizeChat', () => {
  it('collapses whitespace and control characters', () => {
    expect(normalizeChat(' hello\n\tthere  ', 50)).toBe('hello there');
  });

  it('cuts to the limit and drops empty messages', () => {
    expect(normalizeChat('abcdef', 3)).toBe('abc');
    expect(normalizeChat('   ', 10)).toBeNull();
  });
});
