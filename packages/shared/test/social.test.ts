import { describe, expect, it } from 'vitest';
import { friendPair, parseSocialMessage } from '../src';

describe('social messages', () => {
  it('accepts where, befriend and unfriend', () => {
    expect(parseSocialMessage(JSON.stringify({ t: 'where', area: 'library' }))).toEqual({
      t: 'where',
      area: 'library',
    });
    expect(parseSocialMessage(JSON.stringify({ t: 'befriend', to: 'abc' }))).not.toBeNull();
    expect(parseSocialMessage(JSON.stringify({ t: 'unfriend', id: 'abc' }))).not.toBeNull();
  });

  it('rejects unknown rooms and empty ids', () => {
    expect(parseSocialMessage(JSON.stringify({ t: 'where', area: 'roof' }))).toBeNull();
    expect(parseSocialMessage(JSON.stringify({ t: 'befriend', to: '' }))).toBeNull();
    expect(parseSocialMessage('not json')).toBeNull();
  });

  it('orders a pair the same way from both sides', () => {
    expect(friendPair('b', 'a')).toEqual(['a', 'b']);
    expect(friendPair('a', 'b')).toEqual(['a', 'b']);
  });
});
