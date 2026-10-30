import { describe, expect, it } from 'vitest';
import { AREA_RULES, applyAreaRules, containsLink, looksTurkish, quietCase } from '../src';

describe('quietCase', () => {
  it.each([
    ['HELLO THERE', 'hello there'],
    ['I THINK SO', 'i think so'],
    ['IŞIK ÇOK GÜZEL', 'ışık çok güzel'],
    ['İSTANBUL', 'istanbul'],
    ['今日はOK', '今日はok'],
  ])('lowercases %s', (raw, expected) => {
    expect(quietCase(raw)).toBe(expected);
  });
});

describe('containsLink', () => {
  it.each(['see https://x.y', 'www.example.org', 'go to example.com now'])('finds %s', (text) => {
    expect(containsLink(text)).toBe(true);
  });

  it.each(['chapter 3.5 is hard', 'ok. see you', 'i.e. tomorrow'])('ignores %s', (text) => {
    expect(containsLink(text)).toBe(false);
  });
});

describe('applyAreaRules', () => {
  it('quiets and shortens library messages', () => {
    const result = applyAreaRules(`STOP ${'a'.repeat(80)}`, AREA_RULES.library);
    expect(result).toEqual({ ok: true, text: `stop ${'a'.repeat(45)}`, lowered: true });
  });

  it('blocks links in the library but not in the smoking room', () => {
    expect(applyAreaRules('look at example.com', AREA_RULES.library)).toEqual({
      ok: false,
      reason: 'link',
    });
    expect(applyAreaRules('look at example.com', AREA_RULES.smoking).ok).toBe(true);
  });

  it('keeps caps where they are allowed', () => {
    expect(applyAreaRules('YES', AREA_RULES.smoking)).toEqual({
      ok: true,
      text: 'YES',
      lowered: false,
    });
  });

  it('drops empty messages', () => {
    expect(applyAreaRules('   ', AREA_RULES.hall)).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('looksTurkish', () => {
  it('spots Turkish-only letters', () => {
    expect(looksTurkish('IŞIK')).toBe(true);
    expect(looksTurkish('I THINK')).toBe(false);
  });
});
