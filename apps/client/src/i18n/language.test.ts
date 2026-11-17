import { describe, expect, it } from 'vitest';
import { pickLanguage } from './t';

describe('pickLanguage', () => {
  it('a saved choice always wins', () => {
    expect(pickLanguage('en', '?lang=tr', 'tr-TR')).toBe('en');
    expect(pickLanguage('tr', '', 'en-US')).toBe('tr');
  });

  it('?lang= decides on a first visit', () => {
    expect(pickLanguage(null, '?lang=tr', 'en-US')).toBe('tr');
    expect(pickLanguage(null, '?x=1&lang=EN', 'tr-TR')).toBe('en');
  });

  it('a Turkish browser gets Turkish, anything else English', () => {
    expect(pickLanguage(null, '', 'tr')).toBe('tr');
    expect(pickLanguage(null, '', 'tr-TR')).toBe('tr');
    expect(pickLanguage(null, '', 'en-GB')).toBe('en');
    expect(pickLanguage(null, '', 'de-DE')).toBe('en');
    expect(pickLanguage(null, '', undefined)).toBe('en');
  });

  it('ignores a language the game does not speak', () => {
    expect(pickLanguage(null, '?lang=zh', 'tr-TR')).toBe('tr');
    expect(pickLanguage('fr', '', 'en')).toBe('en');
  });
});
