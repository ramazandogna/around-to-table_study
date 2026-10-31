import { describe, expect, it } from 'vitest';
import { cleanDm, DM_MAX_CHARS, friendPair, parseSocialMessage } from '../src';

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

  it('accepts phone messages and conversation reads', () => {
    expect(parseSocialMessage(JSON.stringify({ t: 'dm', to: 'abc', text: 'hi' }))).not.toBeNull();
    expect(parseSocialMessage(JSON.stringify({ t: 'history', with: 'abc' }))).not.toBeNull();
    expect(parseSocialMessage(JSON.stringify({ t: 'read', with: 'abc' }))).not.toBeNull();
    expect(parseSocialMessage(JSON.stringify({ t: 'dm', to: 'abc', text: '' }))).toBeNull();
  });

  it('cleans phone messages: trims, caps the length and blocks links', () => {
    expect(cleanDm('  Hello   THERE ')).toEqual({ ok: true, text: 'Hello THERE' });
    expect(cleanDm('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(cleanDm('see example.com')).toEqual({ ok: false, reason: 'link' });
    const long = cleanDm('a'.repeat(DM_MAX_CHARS + 50));
    expect(long.ok && long.text.length).toBe(DM_MAX_CHARS);
  });
});
