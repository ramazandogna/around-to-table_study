import { computed } from 'vue';
import { language, type Language } from './i18n';

/**
 * Copy for the parts that came last: the beta door that opens before the
 * game, and what the hero's bubbles type now and then (one line per bubble,
 * picked in turn).
 */
export type More = {
  gate: {
    badge: string;
    title: string;
    text: string;
    ask: string;
    play: string;
    explore: string;
    close: string;
  };
  chatter: [string[], string[], string[], string[]];
};

const en: More = {
  gate: {
    badge: 'Early beta',
    title: 'We are still building it',
    text: 'Around the Table is in a closed beta. You sign in with Google, and you also need this week’s access code to walk in. You can look at the game’s door anyway, or explore the site first.',
    ask: 'No code yet? Write to us and we’ll send one.',
    play: 'See the game',
    explore: 'Explore the site',
    close: 'Close',
  },
  chatter: [
    ['anyone up for a pomodoro?', 'library in 5?', 'hi! first time here 👋'],
    ['2 of 4 done 🍅', 'deep focus till 9', 'break? ☕'],
    ['this song 🎵', 'rock… paper… ✂️!', 'best of 5?'],
    ['my corgi says hi', 'shh, the cat is asleep', 'walkies after this 🐾'],
  ],
};

const tr: More = {
  gate: {
    badge: 'Erken beta',
    title: 'Henüz yapım aşamasında',
    text: 'Around the Table kapalı betada. Google ile giriş yaparsın; içeri girmek için ayrıca bu haftanın erişim kodu gerekir. Yine de oyunun kapısına göz atabilir ya da önce siteyi inceleyebilirsin.',
    ask: 'Kodun yok mu? Bize yaz, gönderelim.',
    play: 'Oyunu gör',
    explore: 'Siteyi incele',
    close: 'Kapat',
  },
  chatter: [
    ['pomodoro yapan var mı?', '5 dk sonra kütüphane?', 'selam! ilk kez buradayım 👋'],
    ['4 bloktan 2’si tamam 🍅', '9’a kadar derin odak', 'mola? ☕'],
    ['bu şarkı 🎵', 'taş… kâğıt… ✂️!', '5’te en iyi?'],
    ['corgim selam söylüyor', 'şşş, kedi uyuyor', 'bundan sonra yürüyüş 🐾'],
  ],
};

const zh: More = {
  gate: {
    badge: '早期测试',
    title: '我们还在建造中',
    text: 'Around the Table 正处于封闭测试阶段。用 Google 账号登录，并且还需要本周的访问码才能进入。你也可以先看看游戏的大门，或者先浏览网站。',
    ask: '还没有访问码？写信给我们，我们会发给你。',
    play: '看看游戏',
    explore: '浏览网站',
    close: '关闭',
  },
  chatter: [
    ['有人一起番茄钟吗？', '5 分钟后图书馆见？', '嗨！第一次来 👋'],
    ['4 个完成了 2 个 🍅', '专注到 9 点', '休息一下？☕'],
    ['这首歌 🎵', '石头…剪刀…布 ✂️！', '五局三胜？'],
    ['我的柯基向你问好', '嘘，猫睡着了', '学完去散步 🐾'],
  ],
};

const ja: More = {
  gate: {
    badge: 'アーリーベータ',
    title: 'まだ建設中です',
    text: 'Around the Table はクローズドベータです。Google でサインインし、さらに今週のアクセスコードがあれば入れます。ゲームの入口をのぞいたり、先にサイトを見たりもできます。',
    ask: 'コードがない？メールをくれれば送ります。',
    play: 'ゲームを見る',
    explore: 'サイトを見る',
    close: '閉じる',
  },
  chatter: [
    ['ポモドーロする人いる？', '5分後に図書館？', 'こんにちは！初めてです 👋'],
    ['4つ中2つ完了 🍅', '9時まで集中', '休憩する？☕'],
    ['この曲いいね 🎵', 'じゃん…けん… ✂️！', '5本勝負？'],
    ['うちのコーギーがよろしくって', 'しーっ、猫が寝てる', '終わったら散歩 🐾'],
  ],
};

const MORE: Record<Language, More> = { en, tr, zh, ja };

export const more = computed(() => MORE[language.value]);
