/**
 * A swear filter for English and Turkish, our own list. Chat keeps the
 * message with the word masked; names, room names, event titles and status
 * lines with one are refused. The server decides; the client may warn early.
 *
 * Words are compared whole, after folding the usual disguises: case (with the
 * Turkish İ/I), accents, look-alike letters from other alphabets (Cyrillic а,
 * Greek ο), full-width and invisible characters, digits and symbols for
 * letters (a5s, $hit), repeated letters (fuuuck), letters split by dots,
 * dashes or spaces (s.h.i.t, f u c k), stars in place of letters (f*ck) and
 * two-word phrases written apart (amına koyayım). Whole words, so "class",
 * "assistant" and "Scunthorpe" pass; stems also match their endings (Turkish
 * adds many), and a short allow list keeps everyday words that start like a stem.
 *
 * Turkish letters matter: "göt" is rude, "got" is English; "sik" is rude,
 * "sıkıntı" is trouble; "piç" is rude, "pic" is a picture. Words in `STRICT`
 * are matched only on a form that keeps those letters apart.
 *
 * More languages: add their lists to `EXACT` and `STEMS`.
 */

/** Rude only as the whole word (plain a–z after folding). */
const EXACT = new Set([
  // English
  'ass',
  'arse',
  'bastard',
  'bastards',
  'bellend',
  'bollocks',
  'cock',
  'cocks',
  'cum',
  'cumshot',
  'dick',
  'dicks',
  'dildo',
  'dildos',
  'fag',
  'fags',
  'fck',
  'fcking',
  'fk',
  'fking',
  'fkn',
  'fuk',
  'fuq',
  'fvck',
  'gtfo',
  'jizz',
  'kike',
  'kys',
  'milf',
  'porn',
  'prick',
  'pricks',
  'pussies',
  'pussy',
  'retard',
  'retards',
  'skank',
  'spic',
  'stfu',
  'tits',
  'titties',
  'tranny',
  'twat',
  'twats',
  'wank',
  'wanker',
  'wankers',
  'whore',
  'whores',
  // Turkish (plain letters)
  'amk',
  'amq',
  'aq',
  'mk',
  'mq',
  'pzv',
  'pzvnk',
  'sktr',
  'siktr',
  'sktir',
  'yrk',
  'yarak',
  'dlyrk',
  'aminakoyim',
  'amcik',
]);

/** Rude with any ending: fucking, bitches, orospuluk, yavşaklar… (plain a–z). */
const STEMS = [
  // English
  'arsehole',
  'asshole',
  'asswipe',
  'bitch',
  'blowjob',
  'bullshit',
  'clit',
  'cocksuck',
  'cunt',
  'dickhead',
  'dickface',
  'douche',
  'dumbass',
  'fagg',
  'fcuk',
  'fuck',
  'fukk',
  'fukin',
  'handjob',
  'horseshit',
  'jackass',
  'jerkoff',
  'motherfuck',
  'mofo',
  'nigga',
  'phuck',
  'pornhub',
  'shit',
  'slut',
  'sonofabitch',
  'titfuck',
  'wanking',
  'whoring',
  // Turkish (plain letters)
  'amcig',
  'amcik',
  'aminakoy',
  'aminakoyay',
  'aminakoyim',
  'aminakodu',
  'aminagoy',
  'ananisik',
  'ananiskm',
  'avradini',
  'bacinisik',
  'dalyarak',
  'dalyarrak',
  'fahise',
  'gavat',
  'gerizekali',
  'gotveren',
  'gotlek',
  'ibne',
  'kahpe',
  'kaltak',
  'kancik',
  'orosbu',
  'orospu',
  'orspu',
  'pezevenk',
  'pezeveng',
  'serefsiz',
  'sikerim',
  'sikeyim',
  'sikiyim',
  'sikicem',
  'siktir',
  'siktig',
  'surtuk',
  'tassak',
  'tasak',
  'yarrak',
  'yarrag',
  'yarram',
  'yavsak',
  'yavsag',
];

/** Rude when two words are written apart: "amına koyayım", "son of a bitch" (plain a–z, stems). */
const PHRASES = [
  'aminakoy',
  'aminagoy',
  'aminakod',
  'ananisik',
  'ananiskm',
  'bacinisik',
  'avradinisik',
  'sonofabitch',
  'ofabitch',
  'motherfuck',
  'dalyarak',
  'dalyarrak',
  'gotveren',
];

/**
 * Rude only with their Turkish letters (ö, ç, ı and a dotted i kept apart),
 * because their plain form is an everyday word: göt/got, piç/pic, sik/sıkı.
 * Each is a stem when it ends in `-`, else the whole word.
 */
const STRICT = [
  'göt',
  'götü',
  'götün',
  'götünü',
  'göte',
  'götler',
  'götlek-',
  'piç',
  'piçler',
  'piçlik',
  'oç',
  'sik',
  'sike',
  'siki',
  'sikim-',
  'sikik-',
  'sikiş-',
  'sikis-',
  'sikti-',
  'siktim-',
  'sikko-',
  'sikerler',
  'puşt-',
  'götüm',
  'yarrağ-',
  'amına',
  'amını',
  'amcı-',
];

/** Everyday words that begin like a stem, or that look like a rude word once folded. */
const ALLOWED = new Set([
  'shitake',
  'shiitake',
  'cocktail',
  'cocktails',
  'cockpit',
  'cockpits',
  'peacock',
  'hitchcock',
  'scunthorpe',
  'dickens',
  'dickinson',
  'cumhuriyet',
  'cumartesi',
  'cuma',
  'cumle',
  'assist',
  'assistant',
  'assume',
  'assess',
  'clitheroe',
  'gotten',
]);

/** Letters from other alphabets, and symbols, that stand in for Latin ones. */
const LOOKALIKE: Record<string, string> = {
  // Cyrillic
  а: 'a',
  в: 'b',
  е: 'e',
  ё: 'e',
  к: 'k',
  м: 'm',
  н: 'h',
  о: 'o',
  р: 'p',
  с: 'c',
  т: 't',
  у: 'y',
  х: 'x',
  і: 'i',
  ї: 'i',
  ј: 'j',
  ѕ: 's',
  ԁ: 'd',
  ԛ: 'q',
  ԝ: 'w',
  // Greek
  α: 'a',
  β: 'b',
  ε: 'e',
  η: 'n',
  ι: 'i',
  κ: 'k',
  ν: 'v',
  ο: 'o',
  ρ: 'p',
  τ: 't',
  υ: 'u',
  χ: 'x',
  // Symbols and digits
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '6': 'g',
  '7': 't',
  '8': 'b',
  '9': 'g',
  '@': 'a',
  $: 's',
  '!': 'i',
  '|': 'i',
  '€': 'e',
  '¢': 'c',
  '£': 'l',
  µ: 'u',
  ß: 'ss',
};

/** Turkish letters folded to plain ones (kept in the strict form). */
const TURKISH: Record<string, string> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
  â: 'a',
  î: 'i',
  û: 'u',
};

/** Zero-width and other invisible characters people slip between letters. */
const INVISIBLE_CHARS = '\\u00ad\\u180e\\u200b-\\u200f\\u202a-\\u202e\\u2060-\\u2064\\ufeff';
const INVISIBLE = new RegExp(`[${INVISIBLE_CHARS}]|\\u034f`, 'gu');
/** What may glue two pieces into one word: stars, dots, dashes and invisible characters. */
const GLUE = new RegExp(`^(?:[.\\-_*+~${INVISIBLE_CHARS}]|\\u034f)+$`, 'u');

/**
 * A word as the filter sees it: lower-case plain letters (look-alikes,
 * Turkish letters and digits folded), the same with doubled letters squeezed
 * (fuuuck), and a strict form that keeps the Turkish letters (göt ≠ got).
 */
export function foldWord(word: string): { plain: string; squeezed: string; strict: string } {
  const lower = word.normalize('NFKC').replace(INVISIBLE, '').toLocaleLowerCase('tr');
  let plain = '';
  let strict = '';
  for (const ch of lower) {
    const alike = LOOKALIKE[ch];
    if (alike) {
      plain += alike;
      strict += alike;
      continue;
    }
    if (TURKISH[ch]) {
      plain += TURKISH[ch];
      strict += ch;
      continue;
    }
    const bare = ch.normalize('NFD').replace(/\p{M}/gu, '');
    if (/^[a-z]+$/.test(bare)) {
      plain += bare;
      strict += bare;
    }
  }
  return { plain, squeezed: squeeze(plain, 1), strict };
}

/** Runs of one letter cut to `keep` (fuuuck → fuck with 1, pussssy → pussy with 2). */
function squeeze(text: string, keep: 1 | 2): string {
  return keep === 1 ? text.replace(/(.)\1+/gu, '$1') : text.replace(/(.)\1{2,}/gu, '$1$1');
}

/** The forms a word is compared in: as written, and with long runs of a letter cut short. */
function forms(text: string): string[] {
  return [text, squeeze(text, 1), squeeze(text, 2)];
}

const STRICT_EXACT = new Set(STRICT.filter((w) => !w.endsWith('-')));
const STRICT_STEMS = STRICT.filter((w) => w.endsWith('-')).map((w) => w.slice(0, -1));

function rude(word: string): boolean {
  const { plain, strict } = foldWord(word);
  if (plain.length < 2) return false;
  const plains = forms(plain);
  if (plains.some((form) => ALLOWED.has(form))) return false;
  if (plains.some((form) => EXACT.has(form) || STEMS.some((stem) => form.startsWith(stem))))
    return true;
  return forms(strict).some(
    (form) => STRICT_EXACT.has(form) || STRICT_STEMS.some((stem) => form.startsWith(stem)),
  );
}

/** Two words written apart that make a rude phrase. */
function rudePhrase(first: string, second: string): boolean {
  const joined = foldWord(first + second).plain;
  return forms(joined).some((form) => PHRASES.some((phrase) => form.startsWith(phrase)));
}

/** Every rude word and stem, for matching a word written with stars (f*ck, s**t). */
const ALL_WORDS = [...EXACT, ...STEMS];

/** A word with stars for some letters that can only be one of the rude words. */
function rudeWithStars(word: string): boolean {
  if (!word.includes('*') || /^\**$/.test(word)) return false;
  const parts = word.split(/\*+/).map((part) => foldWord(part).plain);
  // Too little left to tell: "a*" or "**k" could be anything.
  if (parts.join('').length < 2 || !parts[0]) return false;
  const pattern = new RegExp(`^${parts.join('[a-z]{1,3}')}`);
  return ALL_WORDS.some((rudeWord) => {
    const match = pattern.exec(rudeWord);
    return match !== null && rudeWord.length - match[0].length <= 1;
  });
}

type Word = { start: number; end: number; word: string };

/**
 * Words with their place in the text. Single letters split by dots, dashes or
 * spaces (s.h.i.t, f u c k) are joined into one word first, and so are pieces
 * joined by stars, dots or dashes with no space (f*ck, s.i.k, a-m-k).
 */
function words(text: string): Word[] {
  const tokens = [...text.matchAll(/(?:[\p{L}\p{N}@$|€¢£µ]|!(?=[\p{L}\p{N}]))+/gu)].map((m) => ({
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
    word: m[0],
  }));
  const found: Word[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;
    let j = i;
    let word = token.word;
    for (;;) {
      const next = tokens[j + 1];
      const current = tokens[j];
      if (!next || !current) break;
      const gap = text.slice(current.end, next.start);
      // Stars, dots or dashes with no space between two pieces: one word (f*ck, s.i.k).
      const glued = GLUE.test(gap);
      // Single letters with only dots, dashes or spaces between: one word (f u c k).
      // ("a b*tch": the b belongs to the starred word after it, not to the a).
      const after = tokens[j + 2];
      const nextGlued = after !== undefined && /^[*]+$/.test(text.slice(next.end, after.start));
      const spaced =
        current.word.length === 1 &&
        next.word.length === 1 &&
        /^[.\-_ *]+$/.test(gap) &&
        !(/\s/.test(gap) && nextGlued);
      if (!glued && !spaced) break;
      word += gap.includes('*') ? '*'.repeat(gap.length) + next.word : gap + next.word;
      j++;
    }
    // A lone spaced letter pair ("a b") is just two letters; three or more, or glued pieces, are a word.
    const joinedLetters = tokens.slice(i, j + 1).every((t) => t.word.length === 1);
    if (j > i && (!joinedLetters || j - i >= 2 || word.includes('*'))) {
      found.push({ start: token.start, end: tokens[j]?.end ?? token.end, word });
      i = j;
    } else found.push(token);
  }
  return found;
}

/** Spans of the text that are rude: single words, and two-word phrases written apart. */
function rudeSpans(text: string): { start: number; end: number }[] {
  const list = words(text);
  const spans: { start: number; end: number }[] = [];
  for (let i = 0; i < list.length; i++) {
    const word = list[i] as Word;
    // "amına koyayım", "son of a bitch": the phrase is rude as a whole.
    const next = list[i + 1];
    if (
      next &&
      /^\s+$/.test(text.slice(word.end, next.start)) &&
      rudePhrase(word.word, next.word)
    ) {
      spans.push({ start: word.start, end: next.end });
      i++;
      continue;
    }
    if (rude(word.word) || rudeWithStars(word.word)) {
      spans.push(word);
      continue;
    }
    // A word glued from pieces (big-ass) may hide a rude piece.
    for (const piece of word.word.split(/[.\-_+~]+/)) {
      if (piece.length > 1 && piece !== word.word && rude(piece)) {
        spans.push(word);
        break;
      }
    }
  }
  return spans;
}

/** Whether a text holds a rude word. */
export function hasProfanity(text: string): boolean {
  return rudeSpans(text).length > 0;
}

/** The text with each rude word replaced by asterisks; `masked` tells whether any was. */
export function maskProfanity(text: string): { text: string; masked: boolean } {
  let out = '';
  let at = 0;
  for (const { start, end } of rudeSpans(text)) {
    out += text.slice(at, start) + '*'.repeat(Math.min(6, Math.max(3, end - start)));
    at = end;
  }
  return { text: out + text.slice(at), masked: at > 0 };
}
