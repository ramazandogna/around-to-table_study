/** Text cleanup shared by chat, whispers and status lines. */

// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/** Collapses whitespace and strips control characters; returns null when nothing is left. */
export function normalizeChat(raw: string, maxLength: number): string | null {
  const text = raw.normalize('NFC').replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, maxLength) : null;
}
