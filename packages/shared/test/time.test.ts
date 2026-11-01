import { describe, expect, it } from 'vitest';
import {
  cleanRoomRules,
  DEFAULT_ROOM_RULES,
  dayPhase,
  rulesFor,
  seasonOf,
  weatherDecor,
} from '../src';

describe('the building’s day and year', () => {
  it('splits the day into its parts', () => {
    expect(dayPhase(7)).toBe('morning');
    expect(dayPhase(12)).toBe('day');
    expect(dayPhase(16)).toBe('afternoon');
    expect(dayPhase(19)).toBe('evening');
    expect(dayPhase(23)).toBe('night');
    expect(dayPhase(3)).toBe('night');
  });

  it('knows the seasons', () => {
    expect(seasonOf(0)).toBe('winter');
    expect(seasonOf(10)).toBe('autumn');
    expect(seasonOf(11)).toBe('winter');
    expect(seasonOf(6)).toBe('summer');
    expect(seasonOf(3)).toBe('spring');
  });

  it('puts heaters up from November to March and fans in the summer', () => {
    expect(weatherDecor(10)).toBe('heaters');
    expect(weatherDecor(1)).toBe('heaters');
    expect(weatherDecor(4)).toBeNull();
    expect(weatherDecor(6)).toBe('fans');
    expect(weatherDecor(9)).toBeNull();
  });
});

describe('room rules', () => {
  it('fills in what is missing', () => {
    expect(cleanRoomRules(null)).toEqual(DEFAULT_ROOM_RULES);
    expect(cleanRoomRules({ pets: false, games: 'yes' })).toEqual({
      ...DEFAULT_ROOM_RULES,
      pets: false,
    });
  });

  it('lets a private room’s owner turn off sounds and pets, but not public rooms', () => {
    const rules = rulesFor('room5', { sound: false, pets: false });
    expect(rules.notifySound).toBe(false);
    expect(rules.pets).toBe(false);
    expect(rulesFor('hall', { sound: false, pets: false }).pets).toBe(true);
  });
});
