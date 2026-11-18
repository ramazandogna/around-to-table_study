import { describe, expect, it } from 'vitest';
import {
  buildingNow,
  CAT_ARRIVE_MS,
  CAT_COMPANY_MS,
  CAT_ROOMS,
  CAT_SLOT_MS,
  catCompanion,
  catPick,
  catPlan,
  catRoomAt,
  DAY_MS,
  HOUR_MS,
  slotProgress,
  staffTopics,
  utcDay,
  utcHour,
  utcSlot,
  WEATHER_BLOCK_MS,
  WEATHER_ODDS,
  WEATHERS,
  weatherAt,
} from '../src';

// 18 November 2026, 12:00 UTC: 21:00 in Tokyo, 15:00 in Istanbul.
const NOON = Date.UTC(2026, 10, 18, 12);

describe('the building clock', () => {
  it('corrects the device clock by the server offset', () => {
    expect(buildingNow(1000, 250)).toBe(1250);
    expect(buildingNow(1000, -90_000)).toBe(-89_000);
    expect(buildingNow(1000, Number.NaN)).toBe(1000);
  });

  it('cuts time into UTC slots, whatever the viewer’s time zone', () => {
    expect(utcSlot(NOON, HOUR_MS)).toBe(NOON / HOUR_MS);
    expect(utcHour(NOON)).toBe(12);
    expect(utcDay(NOON)).toBe(Math.floor(NOON / DAY_MS));
    expect(slotProgress(NOON + 30 * 60_000, HOUR_MS)).toBeCloseTo(0.5);
  });

  it('agrees for two devices whose clocks are 90 s apart once both are corrected', () => {
    const server = NOON + 17 * 60_000;
    const tokyo = buildingNow(server - 90_000, 90_000);
    const istanbul = buildingNow(server + 90_000, -90_000);
    expect(weatherAt(tokyo)).toBe(weatherAt(istanbul));
    expect(catPlan(tokyo)).toEqual(catPlan(istanbul));
  });
});

describe('the weather', () => {
  it('has odds that add up to one in every season', () => {
    for (const odds of Object.values(WEATHER_ODDS)) {
      const sum = WEATHERS.reduce((total, w) => total + odds[w], 0);
      expect(sum).toBeCloseTo(1);
    }
  });

  it('holds for a whole block and is the same for everyone', () => {
    const block = utcSlot(NOON, WEATHER_BLOCK_MS) * WEATHER_BLOCK_MS;
    const weather = weatherAt(block);
    expect(weatherAt(block + WEATHER_BLOCK_MS - 1)).toBe(weather);
    expect(weatherAt(block + 60_000)).toBe(weather);
  });

  it('snows only in the cold months, and every weather happens', () => {
    const seen = new Set<string>();
    for (let month = 0; month < 12; month++) {
      for (let block = 0; block < 240; block++) {
        const at = Date.UTC(2026, month, 1) + block * WEATHER_BLOCK_MS;
        if (new Date(at).getUTCMonth() !== month) continue;
        const weather = weatherAt(at);
        seen.add(weather);
        if (weather === 'snow') expect([11, 0, 1]).toContain(month);
      }
    }
    expect([...seen].sort()).toEqual([...WEATHERS].sort());
  });

  it('changes now and then rather than every block', () => {
    let changes = 0;
    let last = weatherAt(NOON);
    for (let block = 1; block <= 80; block++) {
      const next = weatherAt(NOON + block * WEATHER_BLOCK_MS);
      if (next !== last) changes++;
      last = next;
    }
    expect(changes).toBeGreaterThan(10);
    expect(changes).toBeLessThan(80);
  });
});

describe('the house cat', () => {
  it('visits every room of her round in a day, and only those', () => {
    const day = utcSlot(NOON, DAY_MS) * (DAY_MS / CAT_SLOT_MS);
    const rooms = new Set<string>();
    for (let s = 0; s < DAY_MS / CAT_SLOT_MS; s++) rooms.add(catRoomAt(day + s));
    expect([...rooms].sort()).toEqual([...CAT_ROOMS].sort());
  });

  it('arrives, roams, naps and leaves in order within a slot', () => {
    // Find a slot she arrives in and leaves from.
    let slot = utcSlot(NOON, CAT_SLOT_MS);
    while (catRoomAt(slot - 1) === catRoomAt(slot) || catRoomAt(slot + 1) === catRoomAt(slot)) {
      slot++;
    }
    const start = slot * CAT_SLOT_MS;
    expect(catPlan(start).phase).toBe('arrive');
    expect(catPlan(start).from).toBe(catRoomAt(slot - 1));
    expect(catPlan(start + CAT_ARRIVE_MS).phase).toBe('roam');
    expect(catPlan(start + CAT_SLOT_MS / 2).phase).toBe('nap');
    const end = catPlan(start + CAT_SLOT_MS - 1);
    expect(end.phase).toBe('leave');
    expect(end.to).toBe(catRoomAt(slot + 1));
  });

  it('never arrives or leaves when she stays in the same room', () => {
    let slot = utcSlot(NOON, CAT_SLOT_MS);
    while (catRoomAt(slot - 1) !== catRoomAt(slot)) slot++;
    expect(catPlan(slot * CAT_SLOT_MS).phase).toBe('roam');
  });

  it('picks spots in range and the same way every time', () => {
    for (let step = 0; step < 20; step++) {
      const pick = catPick(1234, step, 5);
      expect(pick).toBeGreaterThanOrEqual(0);
      expect(pick).toBeLessThan(5);
      expect(catPick(1234, step, 5)).toBe(pick);
    }
    expect(catPick(1, 1, 0)).toBe(0);
  });

  it('curls up next to the longest studier past 25 minutes, ties to the smaller id', () => {
    const long = CAT_COMPANY_MS + 60_000;
    expect(catCompanion([])).toBeNull();
    expect(catCompanion([{ id: 'a', focusedMs: CAT_COMPANY_MS - 1 }])).toBeNull();
    expect(
      catCompanion([
        { id: 'b', focusedMs: long },
        { id: 'c', focusedMs: long + 5 },
        { id: 'a', focusedMs: 10 },
      ]),
    ).toBe('c');
    expect(
      catCompanion([
        { id: 'z', focusedMs: long },
        { id: 'k', focusedMs: long },
      ]),
    ).toBe('k');
  });
});

describe('what staff talk about', () => {
  it('greets first, then a hint, the company, the weather and their own lines', () => {
    expect(staffTopics({ hint: true, studying: 3 })).toEqual([
      'greet',
      'hint',
      'company',
      'weather',
      'own',
    ]);
  });

  it('keeps quiet about numbers below two and skips a hint when all is found', () => {
    expect(staffTopics({ hint: false, studying: 1 })).toEqual(['greet', 'weather', 'own']);
    expect(staffTopics({ hint: true, studying: 0 })).not.toContain('company');
  });
});
