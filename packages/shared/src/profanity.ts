/**
 * A small swear filter for English and Turkish, our own list. Chat keeps the
 * message with the word masked; names, room names, event titles and status
 * lines with one are refused. The server decides; the client may warn early.
 *
 * Words are compared whole, after folding the usual disguises: case (with the
 * Turkish İ/I), accents, digits for letters (a5s), repeated letters (fuuuck)
 * and letters split by dots or spaces (s.h.i.t). Whole words, so "class" and
 * "Scunthorpe" pass; a few stems also match their endings (Turkish adds them),
 * and a short allow list keeps everyday words that start like a stem.
 *
 * More languages: add their lists to `EXACT` and `STEMS`.
 */

/** Rude only as the whole word. */
const EXACT = new Set([
  // English
  'ass',
  'asshole',
  'bastard',
  'bitch',
  'bitches',
  'cock',
  'cunt',
  'dick',
  'dickhead',
  'fag',
  'pussy',
  'slut',
  'twat',
  'wanker',
  'whore',
  // Turkish
  'amk',
  'aq',
  'amq',
  'sikik',
  'yarak',
]);

/** Rude with any ending (fucking, siktir, orospuluk…). */
const STEMS = [
  // English
  'fuck',
  'motherfuck',
  'shit',
  'nigger',
  'nigga',
  'faggot',
  // Turkish
  'orospu',
  'siktir',
  'sikerim',
  'sikeyim',
  'sikiyim',
  'amina',
  'aminakoy',
  'amcik',
  'yarrak',
  'gotveren',
  'ibne',
  'kahpe',
  'pezevenk',
  'gavat',
  'yavsak',
  'kaltak',
];

/** Everyday words that begin like a stem. */
const ALLOWED = new Set(['shitake', 'shiitake']);

const FOLD: Record<string, string> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
  â: 'a',
  î: 'i',
  û: 'u',
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
};

/**
 * A word as the filter sees it: lower-case plain letters (Turkish letters and
 * digits folded), and the same with doubled letters squeezed (fuuuck).
 */
export function foldWord(word: string): { plain: string; squeezed: string } {
  const lower = word.toLocaleLowerCase('tr');
  let plain = '';
  for (const ch of lower) {
    const folded = FOLD[ch] ?? ch.normalize('NFD').replace(/\p{M}/gu, '');
    if (/^[a-z]$/.test(folded)) plain += folded;
  }
  return { plain, squeezed: plain.replace(/(.)\1+/g, '$1') };
}

function rude(word: string): boolean {
  const { plain, squeezed } = foldWord(word);
  if (plain.length < 2 || ALLOWED.has(plain)) return false;
  return [plain, squeezed].some(
    (form) => EXACT.has(form) || STEMS.some((stem) => form.startsWith(stem)),
  );
}

/**
 * Words with their place in the text. Single letters split by dots, dashes or
 * spaces (s.h.i.t, f u c k) are joined into one word first.
 */
function words(text: string): { start: number; end: number; word: string }[] {
  const tokens = [...text.matchAll(/[\p{L}\p{N}@$]+/gu)].map((m) => ({
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
    word: m[0],
  }));
  const found: { start: number; end: number; word: string }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;
    // Three or more single letters with only dots, dashes or spaces between: one word.
    let j = i;
    while (
      token.word.length === 1 &&
      tokens[j + 1]?.word.length === 1 &&
      /^[.\-_ *]+$/.test(text.slice(tokens[j]?.end, tokens[j + 1]?.start))
    ) {
      j++;
    }
    if (j - i >= 2) {
      const last = tokens[j];
      found.push({
        start: token.start,
        end: last?.end ?? token.end,
        word: tokens
          .slice(i, j + 1)
          .map((t) => t.word)
          .join(''),
      });
      i = j;
    } else found.push(token);
  }
  return found;
}

/** Whether a text holds a rude word. */
export function hasProfanity(text: string): boolean {
  return words(text).some(({ word }) => rude(word));
}

/** The text with each rude word replaced by asterisks; `masked` tells whether any was. */
export function maskProfanity(text: string): { text: string; masked: boolean } {
  let out = '';
  let at = 0;
  let masked = false;
  for (const { start, end, word } of words(text)) {
    if (!rude(word)) continue;
    out += text.slice(at, start) + '*'.repeat(Math.min(6, Math.max(3, word.length)));
    at = end;
    masked = true;
  }
  return { text: out + text.slice(at), masked };
}
