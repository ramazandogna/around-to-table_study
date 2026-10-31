import { describe, expect, it } from 'vitest';
import { CHARACTERS, isValidAppearance, parseClientMessage, randomAppearance } from '../src';

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
});
