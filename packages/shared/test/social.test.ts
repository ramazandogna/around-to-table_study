import { describe, expect, it } from 'vitest';
import { cleanDm, DM_MAX_CHARS, friendPair, parseSocialMessage, REPORT_NOTE_MAX } from '../src';

describe('social messages', () => {
  it('accepts where, befriend and unfriend', () => {
    expect(parseSocialMessage(JSON.stringify({ t: 'where', area: 'library' }))).toEqual({
      t: 'where',
      area: 'library',
    });
    const withPet = { t: 'where', area: 'library', studying: true, pet: 'cat' };
    expect(parseSocialMessage(JSON.stringify(withPet))).toEqual(withPet);
    expect(parseSocialMessage(JSON.stringify({ ...withPet, pet: 'dragon' }))).toBeNull();
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

  it('accepts a report with a known reason and a short note, and an admin listing', () => {
    const report = { t: 'report', id: 'abc', reason: 'harassment', note: 'kept following me' };
    expect(parseSocialMessage(JSON.stringify(report))).not.toBeNull();
    expect(
      parseSocialMessage(JSON.stringify({ t: 'report', id: 'abc', reason: 'spam' })),
    ).not.toBeNull();
    expect(parseSocialMessage(JSON.stringify({ t: 'reports' }))).not.toBeNull();
  });

  it('rejects a report with an unknown reason, no target or a huge note', () => {
    expect(
      parseSocialMessage(JSON.stringify({ t: 'report', id: 'abc', reason: 'meh' })),
    ).toBeNull();
    expect(parseSocialMessage(JSON.stringify({ t: 'report', reason: 'spam' }))).toBeNull();
    const huge = {
      t: 'report',
      id: 'abc',
      reason: 'spam',
      note: 'x'.repeat(REPORT_NOTE_MAX * 2 + 1),
    };
    expect(parseSocialMessage(JSON.stringify(huge))).toBeNull();
  });
});
