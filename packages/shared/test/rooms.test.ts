import { describe, expect, it } from 'vitest';
import {
  cleanRoomName,
  findRoomInvite,
  isValidRoomPassword,
  makeRoomCode,
  normalizeRoomCode,
  roomInviteMark,
} from '../src';

describe('private room codes', () => {
  it('makes six characters nobody can misread', () => {
    for (let i = 0; i < 50; i++) {
      const code = makeRoomCode();
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
      expect(normalizeRoomCode(code)).toBe(code);
    }
  });

  it('accepts a code typed loosely', () => {
    expect(normalizeRoomCode(' abc-def ')).toBe('ABCDEF');
    expect(normalizeRoomCode('ab cd')).toBeNull();
    expect(normalizeRoomCode('ABCDEF7')).toBeNull();
    // Letters a code never has are not guessed at.
    expect(normalizeRoomCode('ABCDE0')).toBeNull();
  });

  it('keeps names short and free of links', () => {
    expect(cleanRoomName('  Exam crew  ')).toBe('Exam crew');
    expect(cleanRoomName('a')).toBeNull();
    expect(cleanRoomName('join www.spam.com')).toBeNull();
    expect(cleanRoomName('x'.repeat(40))?.length).toBeLessThanOrEqual(24);
  });

  it('asks for a sensible password', () => {
    expect(isValidRoomPassword('abc')).toBe(false);
    expect(isValidRoomPassword('abcd')).toBe(true);
    expect(isValidRoomPassword('x'.repeat(33))).toBe(false);
  });

  it('finds an invite inside a phone message', () => {
    const text = `come study with us ${roomInviteMark('ABCDEF')}`;
    expect(findRoomInvite(text)).toBe('ABCDEF');
    expect(findRoomInvite('no invite here')).toBeNull();
  });
});
