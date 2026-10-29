import { describe, expect, it } from 'vitest';
import { CHARACTER_SKINS, isValidAppearance, randomAppearance } from '../src';

describe('appearance', () => {
  it('random appearances are always valid', () => {
    for (let i = 0; i < 50; i++) expect(isValidAppearance(randomAppearance())).toBe(true);
  });

  it.each([-1, 0.5, CHARACTER_SKINS.length])('rejects skin %s', (skin) => {
    expect(isValidAppearance({ skin })).toBe(false);
  });
});
