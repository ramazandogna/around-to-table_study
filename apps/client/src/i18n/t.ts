import en from './en.json';

export type MessageKey = keyof typeof en;

/** English-only for now; other catalogs plug in here later. */
export function t(key: MessageKey): string {
  return en[key];
}
