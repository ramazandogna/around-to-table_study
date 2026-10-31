/**
 * Mouse cursors that say what a click will do before it happens: a door for
 * doors, a chair for free seats, a magnifier for things to look at, a speech
 * bubble for people, a note for boards and the reception, and "no" for
 * places that are closed. Drawn as tiny pixel-style SVGs in the game's colours.
 */
export type CursorKind = 'door' | 'sit' | 'look' | 'talk' | 'read' | 'closed' | 'self';

const INK = '#3a1d0c';
const FACE = '#ffe7b8';
const GOLD = '#f2c230';

const svg = (body: string) =>
  `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28' shape-rendering='crispEdges'>${body}</svg>`;

/** A small arrow in the corner, so the hot spot stays obvious, plus the icon. */
const arrow = `<path d='M1 1 L1 11 L4 8 L6 12 L8 11 L6 7 L10 7 Z' fill='${FACE}' stroke='${INK}' stroke-width='1.2'/>`;

const ICONS: Record<CursorKind, string> = {
  door: `<rect x='12' y='8' width='12' height='18' fill='${GOLD}' stroke='${INK}' stroke-width='1.5'/><rect x='15' y='11' width='6' height='12' fill='#8a5a34'/><rect x='19' y='17' width='2' height='2' fill='${GOLD}'/>`,
  sit: `<rect x='13' y='9' width='4' height='14' fill='#c8603e' stroke='${INK}'/><rect x='13' y='17' width='12' height='4' fill='#e07b52' stroke='${INK}'/><rect x='22' y='21' width='3' height='5' fill='${INK}'/><rect x='13' y='21' width='3' height='5' fill='${INK}'/>`,
  look: `<circle cx='18' cy='16' r='6' fill='#bfe6f2' stroke='${INK}' stroke-width='2'/><path d='M22 20 L27 25' stroke='${INK}' stroke-width='3'/>`,
  talk: `<rect x='11' y='9' width='16' height='11' rx='3' fill='${FACE}' stroke='${INK}' stroke-width='1.5'/><path d='M15 20 L14 25 L19 20 Z' fill='${FACE}' stroke='${INK}'/><rect x='14' y='13' width='2' height='2' fill='${INK}'/><rect x='18' y='13' width='2' height='2' fill='${INK}'/><rect x='22' y='13' width='2' height='2' fill='${INK}'/>`,
  read: `<rect x='12' y='8' width='13' height='17' fill='#fbfaf5' stroke='${INK}' stroke-width='1.5'/><rect x='15' y='12' width='7' height='1.5' fill='${INK}'/><rect x='15' y='16' width='7' height='1.5' fill='${INK}'/><rect x='15' y='20' width='5' height='1.5' fill='${INK}'/><circle cx='18.5' cy='8' r='1.8' fill='#c8403a'/>`,
  closed: `<circle cx='18' cy='17' r='7' fill='${FACE}' stroke='#c8403a' stroke-width='2.5'/><path d='M13 22 L23 12' stroke='#c8403a' stroke-width='2.5'/>`,
  self: `<circle cx='18' cy='17' r='8' fill='none' stroke='${GOLD}' stroke-width='2.5' stroke-dasharray='3 2'/><circle cx='18' cy='17' r='2.5' fill='${GOLD}'/>`,
};

const cache = new Map<CursorKind, string>();

/** A CSS `cursor` value for a kind, falling back to the system pointer. */
export function cursorFor(kind: CursorKind): string {
  let value = cache.get(kind);
  if (!value) {
    const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg(arrow + ICONS[kind]))}`;
    value = `url("${url}") 1 1, ${kind === 'closed' ? 'not-allowed' : 'pointer'}`;
    cache.set(kind, value);
  }
  return value;
}
