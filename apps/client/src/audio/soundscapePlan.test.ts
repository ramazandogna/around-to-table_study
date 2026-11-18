import { describe, expect, it } from 'vitest';
import {
  bedLevels,
  bedShare,
  DUCKED,
  hasCafe,
  hasPages,
  nearness,
  newPageState,
  nextPageTurn,
  PAGE_ANY_GAP_MS,
  PAGE_GAP_MS,
  PAGE_VOICES,
} from './soundscapePlan';

/** Runs the page scheduler every half second for a while; returns when each page turned, by whom. */
function simulate(focusing: readonly string[], seconds: number, random = () => 0.5) {
  const state = newPageState();
  const turns: { at: number; id: string }[] = [];
  for (let at = 0; at <= seconds * 1000; at += 500) {
    const id = nextPageTurn(state, at, focusing, random);
    if (id) turns.push({ at, id });
  }
  return turns;
}

describe('the room beds', () => {
  it('keeps the library to room tone, and rain only while it rains', () => {
    const dry = bedLevels('library', 'clear', 4);
    expect(dry.murmur).toBe(0);
    expect(dry.traffic).toBe(0);
    expect(dry.rain).toBe(0);
    expect(dry.tone).toBeGreaterThan(0);
    expect(bedLevels('library', 'rain', 4).rain).toBeGreaterThan(0);
    expect(bedLevels('library', 'snow', 4).rain).toBe(0);
  });

  it('lets the smoking room murmur grow with people, a little even when empty', () => {
    const empty = bedLevels('smoking', 'clear', 1).murmur;
    const busy = bedLevels('smoking', 'clear', 6).murmur;
    expect(empty).toBeGreaterThan(0);
    expect(busy).toBeGreaterThan(empty);
    expect(busy).toBeLessThanOrEqual(1);
  });

  it('gives the hall its street and the private rooms only air', () => {
    expect(bedLevels('hall', 'clear', 1).traffic).toBe(1);
    const room = bedLevels('room5', 'clear', 2);
    expect(room.murmur + room.traffic).toBe(0);
    expect(hasPages('library')).toBe(true);
    expect(hasPages('smoking')).toBe(false);
    expect(hasCafe('smoking')).toBe(true);
    expect(hasCafe('library')).toBe(false);
  });
});

describe('when the soundscape plays', () => {
  it('is silent when switched off, muted or hidden, and ducks under music', () => {
    const base = { on: true, muted: false, hidden: false, music: false };
    expect(bedShare(base)).toBe(1);
    expect(bedShare({ ...base, on: false })).toBe(0);
    expect(bedShare({ ...base, muted: true })).toBe(0);
    expect(bedShare({ ...base, hidden: true })).toBe(0);
    expect(bedShare({ ...base, music: true })).toBe(DUCKED);
    expect(DUCKED).toBeLessThan(0.1);
  });

  it('plays the coffee machine louder up close', () => {
    expect(nearness(1)).toBe(1);
    expect(nearness(5)).toBeLessThan(1);
    expect(nearness(20)).toBe(0.25);
    expect(nearness(Infinity)).toBe(0.25);
  });
});

describe('page turns in the library', () => {
  it('turns no pages when nobody is studying', () => {
    expect(simulate([], 120)).toEqual([]);
  });

  it('turns one person’s page no more than every 20 seconds', () => {
    const turns = simulate(['a'], 300);
    expect(turns.length).toBeGreaterThan(5);
    for (let i = 1; i < turns.length; i++) {
      expect((turns[i]?.at ?? 0) - (turns[i - 1]?.at ?? 0)).toBeGreaterThanOrEqual(PAGE_GAP_MS);
    }
  });

  it('keeps at least a few seconds between any two pages, however many study', () => {
    const many = Array.from({ length: 12 }, (_, i) => `p${i}`);
    const turns = simulate(many, 300, Math.random);
    expect(turns.length).toBeGreaterThan(10);
    for (let i = 1; i < turns.length; i++) {
      expect((turns[i]?.at ?? 0) - (turns[i - 1]?.at ?? 0)).toBeGreaterThanOrEqual(PAGE_ANY_GAP_MS);
    }
    // Twelve people, but never more than one page every four seconds.
    expect(turns.length).toBeLessThanOrEqual(300_000 / PAGE_ANY_GAP_MS + 1);
  });

  it('gives each studying person their turn and forgets those who stop', () => {
    const turns = simulate(['a', 'b', 'c'], 200);
    expect(new Set(turns.map((t) => t.id))).toEqual(new Set(['a', 'b', 'c']));
    const state = newPageState();
    nextPageTurn(state, 0, ['a', 'b']);
    nextPageTurn(state, 500, ['a']);
    expect([...state.last.keys()]).toEqual(['a']);
  });

  it('never sounds more voices than allowed', () => {
    const state = newPageState();
    state.sounding = Array.from({ length: PAGE_VOICES }, () => 10_000);
    state.last.set('a', -PAGE_GAP_MS * 3);
    expect(nextPageTurn(state, 5_000, ['a'])).toBeNull();
    expect(nextPageTurn(state, 10_500, ['a'])).toBe('a');
  });
});
