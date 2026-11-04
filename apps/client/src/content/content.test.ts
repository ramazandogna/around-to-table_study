import { describe, expect, it } from 'vitest';
import * as en from './discoveries.en';
import * as tr from './discoveries.tr';
import { TOPICS as TOPICS_EN } from './topics.en';
import { TOPICS as TOPICS_TR } from './topics.tr';

/** Ids, sizes and keys: what code relies on must match in both languages. */
const shape = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(shape)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === 'id' ? v : shape(v)]))
      : typeof value;

describe('the Turkish content', () => {
  it('has the same shelves, paintings, notes and flaws as the English, in the same order', () => {
    expect(shape(tr.SHELF_TOPICS)).toEqual(shape(en.SHELF_TOPICS));
    expect(shape(tr.PAINTINGS)).toEqual(shape(en.PAINTINGS));
    expect(shape(tr.RENOVATION_NOTES)).toEqual(shape(en.RENOVATION_NOTES));
    expect(shape(tr.FLAWS)).toEqual(shape(en.FLAWS));
  });

  it('has a Turkish question for every topic jar question', () => {
    expect(TOPICS_TR).toHaveLength(TOPICS_EN.length);
  });

  it('is really translated: no text is left the same, except names', () => {
    const same = en.PAINTINGS.filter((p, i) => tr.PAINTINGS[i]?.story === p.story);
    expect(same).toEqual([]);
    expect(TOPICS_TR.filter((q, i) => q === TOPICS_EN[i])).toEqual([]);
  });
});
