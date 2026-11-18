import type { Appearance, ClientMessage, WearProfile } from '@att/shared';
import { describe, expect, it, vi } from 'vitest';
import { lookForNewCharacter, lookToSave, withAllowedLook } from '../src/looks';

const HOUR = 60 * 60 * 1000;

const profile = (change: Partial<WearProfile> = {}): WearProfile => ({
  id: 'p',
  name: 'Mia',
  role: 'user',
  joinedAt: 0,
  online: true,
  blocks: { today: 0, week: 0, month: 0, year: 0, total: 0 },
  kinds: { pomodoro: 0, deep: 0, marathon: 0, custom: 0 },
  focusMs: 0,
  timeMs: 0,
  friends: 0,
  messages: 0,
  bestStreak: 0,
  ...change,
});

const dressed: Appearance = {
  character: 2,
  head: 7,
  hat: 'headphones',
  hatColor: 3,
  face: 'round',
  back: 'backpack',
  backColor: 1,
};

describe('looks the server lets through', () => {
  it('gives a new character only the free things', () => {
    expect(lookForNewCharacter(dressed)).toEqual({ character: 2, head: 7, face: 'round' });
    expect(lookForNewCharacter({ character: 99 })).toBeNull();
    expect(lookForNewCharacter('hat')).toBeNull();
  });

  it('saves what the profile earned and takes off the rest', () => {
    const fiveBlocks = profile({ blocks: { today: 0, week: 0, month: 0, year: 0, total: 5 } });
    expect(lookToSave(dressed, fiveBlocks)).toEqual({
      character: 2,
      head: 7,
      hat: 'headphones',
      hatColor: 3,
      face: 'round',
    });
    expect(lookToSave(dressed, profile({ ...fiveBlocks, focusMs: 10 * HOUR }))).toEqual(dressed);
    expect(lookToSave(dressed, null)).toEqual(lookForNewCharacter(dressed));
    expect(lookToSave({ character: 0, hat: 'crown' }, fiveBlocks)).toBeNull();
  });

  it('asks the hub about a hello or look wearing earned things', async () => {
    const allowed = vi.fn(async (look: Appearance) => ({ ...look, hat: undefined }));
    const hello: ClientMessage = { t: 'hello', look: dressed };
    const checked = await withAllowedLook(hello, allowed);
    expect(allowed).toHaveBeenCalledOnce();
    expect(checked).toEqual({ t: 'hello', look: { ...dressed, hat: undefined } });
    const look: ClientMessage = { t: 'look', look: dressed };
    expect((await withAllowedLook(look, allowed)).t).toBe('look');
    expect(allowed).toHaveBeenCalledTimes(2);
  });

  it('does not ask about free things or other messages', async () => {
    const allowed = vi.fn(async (look: Appearance) => look);
    const free: ClientMessage = { t: 'look', look: { character: 1, hat: 'cap', neck: 'scarf' } };
    expect(await withAllowedLook(free, allowed)).toBe(free);
    const say: ClientMessage = { t: 'say', text: 'hi' };
    expect(await withAllowedLook(say, allowed)).toBe(say);
    expect(allowed).not.toHaveBeenCalled();
  });
});
