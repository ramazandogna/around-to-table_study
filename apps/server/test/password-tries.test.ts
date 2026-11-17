import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PASSWORD_TRIES } from '@att/shared';
import { SocialHub } from '../src/social-hub';
import { hubRig } from './support/rigs';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-17T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

async function lockedRoom() {
  const rig = hubRig();
  const room = await rig.hub.createRoom('owner', 'Locked', 5, 'secret');
  return { rig, code: room?.code ?? '' };
}

describe('room password try limit', () => {
  it('stops an account after too many wrong passwords, even with the right one', async () => {
    const { rig, code } = await lockedRoom();
    for (let i = 0; i < PASSWORD_TRIES; i++) {
      expect(await rig.hub.checkRoom(code, `guess${i}`, 'u1')).toBe('password');
    }
    expect(await rig.hub.checkRoom(code, 'guess-more', 'u1')).toBe('too_many');
    expect(await rig.hub.checkRoom(code, 'secret', 'u1')).toBe('too_many');
  });

  it('counts per account and room: others are not locked out', async () => {
    const { rig, code } = await lockedRoom();
    for (let i = 0; i < PASSWORD_TRIES; i++) await rig.hub.checkRoom(code, 'x', 'u1');
    expect(await rig.hub.checkRoom(code, 'secret', 'u2')).toBe('ok');
    const other = await rig.hub.createRoom('owner', 'Other', 5, 'secret');
    expect(await rig.hub.checkRoom(other?.code ?? '', 'secret', 'u1')).toBe('ok');
  });

  it('counts per account, not per character: a second character shares the tries', async () => {
    const { rig, code } = await lockedRoom();
    for (let i = 0; i < PASSWORD_TRIES; i++) await rig.hub.checkRoom(code, 'x', 'char1', 'acct1');
    expect(await rig.hub.checkRoom(code, 'secret', 'char2', 'acct1')).toBe('too_many');
    expect(await rig.hub.checkRoom(code, 'secret', 'char3', 'acct2')).toBe('ok');
  });

  it('a right password does not use up tries', async () => {
    const { rig, code } = await lockedRoom();
    for (let i = 0; i < PASSWORD_TRIES * 2; i++) {
      expect(await rig.hub.checkRoom(code, 'secret', 'u1')).toBe('ok');
    }
  });

  it('lets the account try again after ten minutes', async () => {
    const { rig, code } = await lockedRoom();
    for (let i = 0; i < PASSWORD_TRIES; i++) await rig.hub.checkRoom(code, 'x', 'u1');
    expect(await rig.hub.checkRoom(code, 'secret', 'u1')).toBe('too_many');
    vi.advanceTimersByTime(10 * 60_000 + 1);
    expect(await rig.hub.checkRoom(code, 'secret', 'u1')).toBe('ok');
  });

  it('survives the hub being evicted from memory', async () => {
    const { rig, code } = await lockedRoom();
    for (let i = 0; i < PASSWORD_TRIES; i++) await rig.hub.checkRoom(code, 'x', 'u1');
    // A new object over the same storage: what memory held is gone.
    const reborn = new SocialHub(rig.state as unknown as DurableObjectState, rig.env);
    expect(await reborn.checkRoom(code, 'secret', 'u1')).toBe('too_many');
  });

  it('keeps the door code limit in storage too, and prunes old rows', async () => {
    const rig = hubRig();
    for (let i = 0; i < PASSWORD_TRIES; i++) expect(await rig.hub.passwordTry('ip:1')).toBe(true);
    expect(await rig.hub.passwordTry('ip:1')).toBe(false);
    const reborn = new SocialHub(rig.state as unknown as DurableObjectState, rig.env);
    expect(await reborn.passwordTry('ip:1')).toBe(false);
    vi.advanceTimersByTime(11 * 60_000);
    expect(await reborn.passwordTry('ip:2')).toBe(true);
    expect(rig.sql.all('tries').map((r) => r['key'])).toEqual(['ip:2']);
  });
});
