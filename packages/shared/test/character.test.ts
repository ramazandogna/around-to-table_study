import { describe, expect, it } from 'vitest';
import {
  CHARACTERS,
  isValidAppearance,
  PALETTES,
  parseClientMessage,
  randomAppearance,
} from '../src';

const look = randomAppearance(() => 0);

describe('appearance', () => {
  it('random appearances are always valid', () => {
    for (let i = 0; i < 50; i++) expect(isValidAppearance(randomAppearance())).toBe(true);
  });

  it.each([-1, 0.5, CHARACTERS.length])('rejects character %s', (character) => {
    expect(isValidAppearance({ character })).toBe(false);
  });

  it('rejects looks from the painted characters that came before', () => {
    expect(isValidAppearance({ skin: 1, hair: 2, top: 0 })).toBe(false);
  });

  it('is checked in hello and look messages', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'look', look }))).toEqual({ t: 'look', look });
    const tooFar = { character: CHARACTERS.length };
    expect(parseClientMessage(JSON.stringify({ t: 'look', look: tooFar }))).toBeNull();
  });

  it('takes colours for each part from its palette, and keeps old looks valid', () => {
    expect(isValidAppearance({ character: 2 })).toBe(true);
    expect(isValidAppearance({ character: 2, skin: 0, hair: 3, top: 9, bottom: 1, shoes: 5 })).toBe(
      true,
    );
    expect(isValidAppearance({ character: 2, top: PALETTES.top.length })).toBe(false);
    expect(isValidAppearance({ character: 2, hair: -1 })).toBe(false);
    expect(isValidAppearance({ character: 2, skin: 1.5 })).toBe(false);
  });

  it('lets every pet there is walk along, and nothing else', () => {
    for (const pet of ['cat', 'dog', 'corgi', 'dachshund', 'shiba', 'rabbit', 'turtle']) {
      expect(isValidAppearance({ character: 0, pet })).toBe(true);
    }
    expect(isValidAppearance({ character: 0, pet: 'dragon' })).toBe(false);
    const hello = { t: 'hello', look: { character: 0, pet: 'turtle', top: 2 } };
    expect(parseClientMessage(JSON.stringify(hello))).toEqual(hello);
    const dragon = { t: 'hello', look: { character: 0, pet: 'dragon' } };
    expect(parseClientMessage(JSON.stringify(dragon))).toBeNull();
  });

  it('dresses the pet from fixed lists', () => {
    const cat = { character: 0, pet: 'cat', petSex: 'female', petColor: 2, petAccessory: 'bow' };
    expect(isValidAppearance(cat)).toBe(true);
    expect(parseClientMessage(JSON.stringify({ t: 'look', look: cat }))).toEqual({
      t: 'look',
      look: cat,
    });
    expect(isValidAppearance({ ...cat, petAccessory: 'crown' })).toBe(false);
    expect(isValidAppearance({ ...cat, petColor: 99 })).toBe(false);
    expect(isValidAppearance({ ...cat, petSex: 'robot' })).toBe(false);
  });
});
