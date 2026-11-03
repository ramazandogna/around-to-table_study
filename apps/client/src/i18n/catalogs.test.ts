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
