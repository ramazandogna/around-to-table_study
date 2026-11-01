import { computed } from 'vue';
import { language, type Language } from './i18n';

/** The pets, as the game has them: its icon, and how each one behaves. */
export const PETS = ['cat', 'dog', 'corgi', 'dachshund', 'shiba', 'rabbit', 'turtle'] as const;
export const PET_ICON: Record<(typeof PETS)[number], string> = {
  cat: '🐱',
  dog: '🐶',
  corgi: '🦊',
  dachshund: '🌭',
  shiba: '🐕',
  rabbit: '🐰',
  turtle: '🐢',
};

type Pet = { name: string; trait: string };

/** The copy the livelier page added: the pets, the ticker and a few labels. */
export type Extra = {
  nav: { pets: string; menu: string; language: string };
  ticker: string[];
  pillarsHint: string;
  pets: { title: string; lead: string; hint: string; list: [Pet, Pet, Pet, Pet, Pet, Pet, Pet] };
  stepsHint: string;
  scroll: string;
};

const en: Extra = {
  nav: { pets: 'Pets', menu: 'Menu', language: 'Language' },
  ticker: [
    '🍅 Pomodoro with friends',
    '🎯 Darts in the smoking room',
    '🎵 Cozy music for everyone',
    '📚 Quiet library desks',
    '🐾 A pet that follows you',
    '🌙 Day and night in real time',
    '🔑 Private rooms for 3, 5 or 9',
    '🏅 Badges for focus',
  ],
  pillarsHint: 'Tap a reason',
  pets: {
    title: 'Bring a friend with four legs',
    lead: 'Every character can walk in with a pet. They follow you, get in trouble and have their own ways.',
    hint: 'Hover or tap one to say hi',
    list: [
      { name: 'Cat', trait: 'Chases specks of dust and sleeps on your desk.' },
      { name: 'Beagle', trait: 'Happy to see everyone, a little clumsy.' },
      { name: 'Corgi', trait: 'Short legs, fastest in the building, never quiet.' },
      { name: 'Dachshund', trait: 'Long, proud and always nearly tripping.' },
      { name: 'Shiba', trait: 'Graceful and aloof. Rarely falls, rarely barks.' },
      { name: 'Rabbit', trait: 'Hops everywhere instead of walking.' },
      { name: 'Turtle', trait: 'Slow, steady, and hides in its shell when shy.' },
    ],
  },
  stepsHint: 'Three steps to sit down with us',
  scroll: 'Scroll',
};

const tr: Extra = {
  nav: { pets: 'Petler', menu: 'Menü', language: 'Dil' },
  ticker: [
    '🍅 Arkadaşlarla pomodoro',
    '🎯 Sigara odasında dart',
    '🎵 Herkese sakin müzik',
    '📚 Sessiz kütüphane masaları',
    '🐾 Peşinden gelen bir pet',
    '🌙 Gerçek zamanlı gece ve gündüz',
    '🔑 3, 5 ya da 9 kişilik özel odalar',
    '🏅 Odaklanmaya rozetler',
  ],
  pillarsHint: 'Bir sebebe dokun',
  pets: {
    title: 'Dört ayaklı bir dost getir',
    lead: 'Her karakter yanında bir petle gelebilir. Peşinden gelir, başını belaya sokar ve kendi huyları vardır.',
    hint: 'Selam vermek için üstüne gel ya da dokun',
    list: [
      { name: 'Kedi', trait: 'Toz zerrelerini kovalar, masanda uyur.' },
      { name: 'Beagle', trait: 'Herkesi görünce sevinir, biraz sakardır.' },
      { name: 'Corgi', trait: 'Kısa bacaklı, binanın en hızlısı, hiç susmaz.' },
      { name: 'Dachshund', trait: 'Uzun, gururlu ve hep tökezlemek üzere.' },
      { name: 'Shiba', trait: 'Zarif ve mesafeli. Nadiren düşer, nadiren havlar.' },
      { name: 'Tavşan', trait: 'Yürümek yerine her yere zıplar.' },
      { name: 'Kaplumbağa', trait: 'Yavaş ama emin; utanınca kabuğuna saklanır.' },
    ],
  },
  stepsHint: 'Masaya oturmak için üç adım',
  scroll: 'Kaydır',
};

const zh: Extra = {
  nav: { pets: '宠物', menu: '菜单', language: '语言' },
  ticker: [
    '🍅 和朋友一起番茄钟',
    '🎯 吸烟室里玩飞镖',
    '🎵 大家一起听轻音乐',
    '📚 安静的图书馆书桌',
    '🐾 跟着你走的宠物',
    '🌙 实时的白天与夜晚',
    '🔑 3、5 或 9 人私人房间',
    '🏅 专注徽章',
  ],
  pillarsHint: '点一个理由',
  pets: {
    title: '带上四条腿的朋友',
    lead: '每个角色都可以带着宠物进来。它们跟着你，惹点小麻烦，各有各的性格。',
    hint: '把鼠标移上去或点一下打个招呼',
    list: [
      { name: '猫', trait: '追着灰尘跑，在你的书桌上睡觉。' },
      { name: '比格犬', trait: '见谁都开心，有点笨手笨脚。' },
      { name: '柯基', trait: '腿短，楼里跑得最快，从不安静。' },
      { name: '腊肠犬', trait: '又长又骄傲，总是差点绊倒。' },
      { name: '柴犬', trait: '优雅又高冷，很少摔倒，很少叫。' },
      { name: '兔子', trait: '不走路，到哪儿都蹦着去。' },
      { name: '乌龟', trait: '慢而稳，害羞时缩进壳里。' },
    ],
  },
  stepsHint: '三步坐到桌边',
  scroll: '向下',
};

const ja: Extra = {
  nav: { pets: 'ペット', menu: 'メニュー', language: '言語' },
  ticker: [
    '🍅 友だちとポモドーロ',
    '🎯 喫煙室でダーツ',
    '🎵 みんなで聴く穏やかな音楽',
    '📚 静かな図書館の机',
    '🐾 ついてくるペット',
    '🌙 リアルタイムの昼と夜',
    '🔑 3・5・9人のプライベートルーム',
    '🏅 集中のバッジ',
  ],
  pillarsHint: '理由をタップ',
  pets: {
    title: '四本足の友だちを連れて',
    lead: 'どのキャラクターもペットと一緒に入れます。ついてきて、ちょっと騒ぎを起こし、それぞれ個性があります。',
    hint: 'カーソルを合わせるかタップしてあいさつ',
    list: [
      { name: 'ネコ', trait: 'ほこりを追いかけ、机の上で眠ります。' },
      { name: 'ビーグル', trait: '誰にでも大喜び、ちょっとドジ。' },
      { name: 'コーギー', trait: '短い足で館内いちばん速く、いつもにぎやか。' },
      { name: 'ダックスフンド', trait: '長くて誇り高く、いつも転びそう。' },
      { name: '柴犬', trait: '上品でクール。めったに転ばず、めったに吠えない。' },
      { name: 'ウサギ', trait: '歩かずにどこへでも跳ねていきます。' },
      { name: 'カメ', trait: 'ゆっくり確実。照れると甲羅に隠れます。' },
    ],
  },
  stepsHint: '席に着くまで3ステップ',
  scroll: 'スクロール',
};

const EXTRA: Record<Language, Extra> = { en, tr, zh, ja };

export const extra = computed(() => EXTRA[language.value]);
