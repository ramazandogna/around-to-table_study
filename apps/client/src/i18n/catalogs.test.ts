import { WEARABLES } from '@att/shared';
import { describe, expect, it } from 'vitest';
import en from './en.json';
import tr from './tr.json';

const slots = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('the Turkish catalog', () => {
  it('has every English key and no extra ones', () => {
    expect(Object.keys(tr).sort()).toEqual(Object.keys(en).sort());
  });

  it('keeps the same {slots} in every message', () => {
    for (const [key, text] of Object.entries(en)) {
      expect(slots((tr as Record<string, string>)[key] ?? ''), key).toEqual(slots(text));
    }
  });
});

describe('things to wear', () => {
  it('have a name and a way to earn them in the catalog', () => {
    const keys = new Set(Object.keys(en));
    for (const item of Object.values(WEARABLES)) {
      expect(keys.has(`wear.item.${item.id}`), item.id).toBe(true);
      expect(keys.has(`wear.slot.${item.slot}`), item.slot).toBe(true);
      if (item.earn) expect(keys.has(`wear.earn.${item.earn.kind}`), item.earn.kind).toBe(true);
    }
  });
});
