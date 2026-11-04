/**
 * Small things to find while walking around: what the shelves hold, the
 * paintings on the walls and the mess behind the renovation tape. Shelf
 * "moments" mix true facts about books with little scenes; the paintings and
 * their painters are made up, so no real person is credited with them.
 * Add freely: every list is picked from at random.
 */

export type ShelfTopic = {
  id: string;
  /** Printed on the plaque on top of the shelf. */
  name: string;
  /** What reading here might turn up. The first line is the book in hand. */
  moments: readonly { book: string; text: string }[];
};

export const SHELF_TOPICS: readonly ShelfTopic[] = [
  {
    id: 'fantasy',
    name: 'Fantasy',
    moments: [
      {
        book: 'Harry Potter and the Philosopher’s Stone',
        text: 'You pull out a worn copy. The Harry Potter books are among the best-selling series ever written, with more than 500 million copies sold. Someone has underlined “It does not do to dwell on dreams and forget to live.”',
      },
      {
        book: 'The Hobbit',
        text: 'Tolkien wrote its first line, “In a hole in the ground there lived a hobbit”, on a blank page of an exam paper he was marking. He said he had no idea why.',
      },
      {
        book: 'Alice’s Adventures in Wonderland',
        text: 'It began as a story Lewis Carroll made up for three sisters on a boat trip on the Thames in July 1862. One of them, Alice Liddell, asked him to write it down.',
      },
      {
        book: 'A map, folded small',
        text: 'Tucked between two volumes: a hand-drawn map of an island that does not exist. “Here be good coffee” is written over one of the bays.',
      },
    ],
  },
  {
    id: 'scifi',
    name: 'Science Fiction',
    moments: [
      {
        book: 'Frankenstein',
        text: 'Mary Shelley started it at eighteen, during a ghost-story contest with friends by Lake Geneva in the rainy summer of 1816. It is often called the first science fiction novel.',
      },
      {
        book: 'I, Robot',
        text: 'Isaac Asimov’s Three Laws of Robotics first appeared together in his 1942 story “Runaround”. Robots in fiction have been arguing about them ever since.',
      },
      {
        book: 'R.U.R.',
        text: 'The word “robot” comes from this 1920 play by Karel Čapek, from the Czech “robota”, forced labour. His brother Josef suggested it.',
      },
      {
        book: 'From the Earth to the Moon',
        text: 'Jules Verne launched his travellers to the Moon from Florida in 1865. A century later, Apollo 11 lifted off from Florida too.',
      },
    ],
  },
  {
    id: 'history',
    name: 'History',
    moments: [
      {
        book: 'The Histories',
        text: 'Herodotus wrote it in the 5th century BC. Cicero called him “the Father of History”, though even then people said he believed a good story a little too easily.',
      },
      {
        book: 'The Rosetta Stone, a guide',
        text: 'The stone carries one decree in three scripts: hieroglyphs, Demotic and Ancient Greek. Comparing them let Jean-François Champollion read hieroglyphs again in 1822.',
      },
      {
        book: 'The Gutenberg Bible, a facsimile',
        text: 'Printed around 1455, it was one of the first major books printed in Europe with movable metal type. Fewer than fifty copies of the original survive.',
      },
    ],
  },
  {
    id: 'poetry',
    name: 'Poetry',
    moments: [
      {
        book: 'Masnavi',
        text: 'Rumi wrote it in Konya, where he is buried. It runs to some 25,000 verses and begins with a reed flute longing for the reed bed it was cut from.',
      },
      {
        book: 'Human Landscapes from My Country',
        text: 'Nâzım Hikmet wrote most of this long poem in prison in Bursa in the 1940s. A pressed flower falls out of this copy.',
      },
      {
        book: 'The Complete Poems of Emily Dickinson',
        text: 'She wrote nearly 1,800 poems, and only about ten were published while she was alive, most of them without her name.',
      },
      {
        book: 'Bashō, haiku',
        text: '“An old pond / a frog jumps in / the sound of water.” Three short lines from 1686, and still one of the most famous poems in Japan.',
      },
    ],
  },
  {
    id: 'philosophy',
    name: 'Philosophy',
    moments: [
      {
        book: 'The Apology of Socrates',
        text: 'Socrates never wrote anything down. Almost everything we know about him comes from his students, above all Plato.',
      },
      {
        book: 'Discourse on the Method',
        text: '“I think, therefore I am” first appeared here in 1637, in French: “je pense, donc je suis”. The Latin version came later.',
      },
      {
        book: 'Meditations',
        text: 'Marcus Aurelius wrote these as private notes to himself, while he was emperor and often on campaign. He never meant anyone else to read them.',
      },
    ],
  },
  {
    id: 'science',
    name: 'Science',
    moments: [
      {
        book: 'On the Origin of Species',
        text: 'Published in 1859, its first printing of 1,250 copies was taken up by booksellers on the very first day.',
      },
      {
        book: 'Principia',
        text: 'Newton published it in 1687 thanks to Edmond Halley, who encouraged him to write it and paid for the printing himself.',
      },
      {
        book: 'Marie Curie, a biography',
        text: 'Her notebooks are still radioactive more than a century later. Readers who want to see them sign a waiver and wear protective clothing.',
      },
    ],
  },
  {
    id: 'politics',
    name: 'Politics',
    moments: [
      {
        book: 'Utopia',
        text: 'Thomas More coined the word in 1516, from Greek: “no place”. His perfect island was a question as much as a dream.',
      },
      {
        book: 'The Prince',
        text: 'Machiavelli wrote it in 1513, but it was only printed in 1532, five years after he died.',
      },
      {
        book: 'Nineteen Eighty-Four',
        text: 'George Orwell wrote much of it on Jura, a remote Scottish island, and it came out in 1949. Someone has pencilled “2+2=4” on the last page.',
      },
    ],
  },
  {
    id: 'novels',
    name: 'Novels',
    moments: [
      {
        book: 'Don Quixote',
        text: 'Its first part came out in 1605, and it is often called the first modern novel. A knight, a squire and a lot of windmills.',
      },
      {
        book: 'Kürk Mantolu Madonna',
        text: 'Sabahattin Ali’s novel came out in 1943 and quietly became one of the best-selling books in Turkey some seventy years later.',
      },
      {
        book: 'War and Peace',
        text: 'More than 500 characters. Someone has drawn a family tree on the inside cover, and given up halfway.',
      },
      {
        book: 'A borrowed library card',
        text: 'Slipped inside the back cover: a card with twelve names on it, the oldest from 1987. You feel like adding yours.',
      },
    ],
  },
];

export type Painting = {
  title: string;
  /** Who made it and the story behind it. */
  story: string;
};

/** Made-up paintings by made-up people, hung in every room. */
export const PAINTINGS: readonly Painting[] = [
  {
    title: 'Kite Day',
    story:
      'Painted in 2007 by Nesrin, who was four years old. Isn’t that tiny? She signed it with a sun instead of her name, and the kite is bigger than the house.',
  },
  {
    title: 'Hands Together',
    story:
      'This one is about the people of Vietnam holding on to each other through the war: a row of hands, each one painted by a different person in the painter’s village.',
  },
  {
    title: 'The Night Shift',
    story:
      'A library cat asleep on a pile of returned books. The librarian who painted it insists it is a self-portrait.',
  },
  {
    title: 'Bosphorus at Dawn',
    story:
      'By a retired ferry captain who crossed the strait some forty thousand times. He said the water was never the same colour twice, so he painted it in eleven blues.',
  },
  {
    title: 'Untitled (Blue)',
    story:
      'Painted by a student at three in the morning, the night before their final exam. A note on the back says: “I passed.”',
  },
  {
    title: 'First Snow',
    story:
      'A village schoolteacher painted the view from her classroom window every winter for thirty years. This is the first one, from the year she started.',
  },
  {
    title: 'The Long Table',
    story:
      'Twelve strangers studying at one table, each painted by the person sitting in that chair. Nobody agreed on the colour of the lamp.',
  },
  {
    title: 'Grandmother’s Garden',
    story:
      'Made of pressed flowers and embroidery thread by a grandmother of eight. Every grandchild has a flower of their own in it, somewhere.',
  },
  // The hall's gallery: people who shaped history, and days the world remembers.
  {
    title: 'Mustafa Kemal Atatürk',
    story:
      'Founder of the Republic of Türkiye, proclaimed on 29 October 1923, and its first president until his death in 1938. In 1928 he brought in the Latin-based Turkish alphabet and toured the country with a chalkboard, teaching the new letters himself; people called him the Head Teacher.',
  },
  {
    title: 'Napoléon Bonaparte',
    story:
      'Emperor of the French from 1804. The Civil Code he brought in that year still shapes the law of many countries. A great reader, he took a travelling library of small books with him on campaign.',
  },
  {
    title: 'Timur',
    story:
      'Timur (1336–1405) ruled a vast empire from Samarkand and filled the city with scholars, poets and builders. His tomb there, the Gur-e Amir, still stands under its ribbed blue dome. A larger variant of chess is named after him.',
  },
  {
    title: '17 August 1999',
    story:
      'At 3:02 in the morning a magnitude 7.6 earthquake struck near İzmit, and more than 17,000 people lost their lives. Strangers dug through the rubble side by side for days, and rescue teams came from many countries, Greece among the first. The lamps are theirs.',
  },
  {
    title: '1 September 1923',
    story:
      'Just before noon a magnitude 7.9 earthquake struck the Kantō plain, and fires swept through Tokyo and Yokohama; more than 100,000 people died. Both cities were rebuilt, and Japan keeps 1 September as Disaster Prevention Day.',
  },
  {
    title: 'Pompeii, AD 79',
    story:
      'When Vesuvius erupted in AD 79, ash buried the town of Pompeii. Dug out again from the 18th century on, it shows Roman life stopped in an instant: loaves still in a bakery oven, and notes scratched on the walls.',
  },
];

/** The gallery in the hall, as indexes into PAINTINGS. */
export const HALL_GALLERY = [8, 9, 10, 11, 12, 13] as const;

/** What the renovation hides, found by peering past the tape. */
export const RENOVATION_NOTES: readonly string[] = [
  'A note taped to a paint can: “Back on Monday. Please don’t sit on the wet chairs. — the painters”',
  'A cardboard box labelled “BOOKS — handle with care (and curiosity)”. The tape is already open.',
  'Half the wall is a fresh warm cream. The other half is waiting for more people to come.',
  'A stack of new desks, still wrapped. Each one has a sticker: “for two” or “for four”.',
];

export type Flaw = { title: string; text: string };

/** Small things wrong with the library, as in any real one: each can be looked at. */
export const FLAWS = {
  crack: {
    title: 'A cracked pane',
    text: 'A thin crack runs across one pane, star-shaped where a stray ball hit it last spring. A sticky note on the frame: “Glazier ordered. Please don’t lean on it. — the caretaker”',
  },
  shutter: {
    title: 'Shutters closed',
    text: 'This window lost its latch in the autumn storm, and the shutters banged all through exam week. They stay closed now, nailed shut, until the new latch arrives.',
  },
  shelf: {
    title: 'Being fixed',
    text: 'One shelf sagged under too many dictionaries. It is taped off while the carpenter makes a stronger one; its books wait in a neat pile beside it.',
  },
} as const satisfies Record<string, Flaw>;

export type FlawId = keyof typeof FLAWS;
export const FLAW_IDS = Object.keys(FLAWS) as FlawId[];
