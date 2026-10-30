import { describe, expect, it } from 'vitest';
import { LOOK_OPTIONS, isValidAppearance, parseClientMessage, randomAppearance } from '../src';

const look = randomAppearance(() => 0);

describe('appearance', () => {
  it('random appearances are always valid', () => {
    for (let i = 0; i < 50; i++) expect(isValidAppearance(randomAppearance())).toBe(true);
  });

  it.each([-1, 0.5, LOOK_OPTIONS.hair.length])('rejects hair %s', (hair) => {
    expect(isValidAppearance({ ...look, hair })).toBe(false);
  });

  it('rejects looks from before the character creator', () => {
    expect(isValidAppearance({ skin: 1 })).toBe(false);
  });

  it('is checked in hello and look messages', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'look', look }))).toEqual({ t: 'look', look });
    const tooFar = { ...look, topColor: LOOK_OPTIONS.topColor.length };
    expect(parseClientMessage(JSON.stringify({ t: 'look', look: tooFar }))).toBeNull();
  });
});
