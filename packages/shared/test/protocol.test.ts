import { describe, expect, it } from 'vitest';
import { normalizeChat, normalizeName, parseClientMessage } from '../src';

describe('parseClientMessage', () => {
  it('accepts a valid move', () => {
    expect(parseClientMessage('{"t":"move","to":{"x":3,"y":4}}')).toEqual({
      t: 'move',
      to: { x: 3, y: 4 },
    });
  });

  it('accepts a study status', () => {
    const status = {
      activity: 'reading',
      timer: { remainingMs: 1000, totalMs: 1500000 },
      dnd: true,
    };
    expect(parseClientMessage(JSON.stringify({ t: 'status', status }))).toEqual({
      t: 'status',
      status,
    });
  });

  it.each([
    { activity: 'sleeping', timer: null, dnd: false },
    { activity: null, timer: { remainingMs: 1, totalMs: 24 * 60 * 60 * 1000 }, dnd: false },
    { activity: null, timer: null },
  ])('rejects the study status %j', (status) => {
    expect(parseClientMessage(JSON.stringify({ t: 'status', status }))).toBeNull();
  });

  it.each(['not json', '{"t":"teleport"}', '{"t":"move","to":{"x":1.5,"y":2}}', '[]'])(
    'rejects %s',
    (raw) => {
      expect(parseClientMessage(raw)).toBeNull();
    },
  );
});

describe('poke and whisper', () => {
  it('accepts a poke and a whisper to someone', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'poke', to: 'abc' }))).toEqual({
      t: 'poke',
      to: 'abc',
    });
    expect(parseClientMessage(JSON.stringify({ t: 'whisper', to: 'abc', text: 'hi' }))).toEqual({
      t: 'whisper',
      to: 'abc',
      text: 'hi',
    });
  });

  it('rejects a poke without anyone to poke', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'poke', to: '' }))).toBeNull();
  });
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
