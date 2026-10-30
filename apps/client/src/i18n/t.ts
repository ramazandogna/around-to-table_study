import en from './en.json';

export type MessageKey = keyof typeof en;

/** English-only for now; other catalogs plug in here later. `{name}` style slots are filled from `vars`. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const text = en[key];
  return vars
    ? text.replace(/\{(\w+)\}/g, (slot, name: string) => String(vars[name] ?? slot))
    : text;
}
