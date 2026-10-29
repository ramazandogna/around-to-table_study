import { describe, expect, it } from 'vitest';
import {
  CHARACTER_PARTS,
  characterLayers,
  isValidAppearance,
  randomAppearance,
  type Appearance,
} from '../src';

const plain: Appearance = { skin: 0, pants: 0, shoes: 0, top: 0, hair: 0, hairColor: 0, beard: 0 };

describe('characterLayers', () => {
  it('stacks body, clothes, then beard and hair', () => {
    expect(characterLayers({ ...plain, hair: 1, beard: 1 })).toEqual([0, 3, 4, 6, 19 + 3 * 54, 19]);
  });

  it('skips hair and beard when set to none', () => {
    expect(characterLayers(plain)).toEqual([0, 3, 4, 6]);
  });

  it('shifts hair by color block', () => {
    const blond = characterLayers({ ...plain, hair: 1, hairColor: 2 });
    expect(blond.at(-1)).toBe(CHARACTER_PARTS.hairColor[2]);
  });
});

describe('appearance validation', () => {
  it('accepts random appearances', () => {
    for (let i = 0; i < 50; i++) expect(isValidAppearance(randomAppearance())).toBe(true);
  });

  it('rejects out-of-range and fractional parts', () => {
    expect(isValidAppearance({ ...plain, top: CHARACTER_PARTS.top.length })).toBe(false);
    expect(isValidAppearance({ ...plain, skin: -1 })).toBe(false);
    expect(isValidAppearance({ ...plain, hair: 0.5 })).toBe(false);
  });
});
