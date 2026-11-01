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

  it('only lets the pets that are ready walk along', () => {
    expect(isValidAppearance({ character: 0, pet: 'cat' })).toBe(true);
    expect(isValidAppearance({ character: 0, pet: 'dog' })).toBe(false);
    expect(isValidAppearance({ character: 0, pet: 'dragon' })).toBe(false);
    const hello = { t: 'hello', look: { character: 0, pet: 'cat', top: 2 } };
    expect(parseClientMessage(JSON.stringify(hello))).toEqual(hello);
    const dog = { t: 'hello', look: { character: 0, pet: 'dog' } };
    expect(parseClientMessage(JSON.stringify(dog))).toBeNull();
  });
});
