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
    codeTitle: string;
    copy: string;
    copied: string;
  };
  chatter: [string[], string[], string[], string[]];
};

const en: More = {
  gate: {
    badge: 'Early beta',
    title: 'Join the closed beta',
    text: 'Around the Table is in a closed beta. You sign in with Google and enter this week’s access code to walk in. Email us for the code, or explore the site first.',
    ask: 'Ask for this week’s code',
    play: 'I have a code: open the game',
    explore: 'Explore the site',
    close: 'Close',
    codeTitle: 'Our address',
    copy: 'Copy address',
    copied: 'Copied',
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
    title: 'Kapalı betaya katıl',
    text: 'Around the Table kapalı betada. Google ile giriş yapıp bu haftanın erişim kodunu girerek içeri girersin. Kod için bize yaz ya da önce siteyi incele.',
    ask: 'Bu haftanın kodunu iste',
    play: 'Kodum var: oyunu aç',
    explore: 'Siteyi incele',
    close: 'Kapat',
    codeTitle: 'Adresimiz',
    copy: 'Adresi kopyala',
    copied: 'Kopyalandı',
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
    title: '加入封闭测试',
    text: 'Around the Table 正处于封闭测试阶段。用 Google 账号登录并输入本周的访问码才能进入。给我们写信索取访问码，或者先浏览网站。',
    ask: '索取本周访问码',
    play: '我有访问码：打开游戏',
    explore: '浏览网站',
    close: '关闭',
    codeTitle: '我们的邮箱',
    copy: '复制邮箱',
    copied: '已复制',
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
    title: 'クローズドベータに参加',
    text: 'Around the Table はクローズドベータです。Google でサインインし、今週のアクセスコードを入力すると入れます。コードはメールで請求するか、先にサイトを見てください。',
    ask: '今週のコードを請求する',
    play: 'コードあり：ゲームを開く',
    explore: 'サイトを見る',
    close: '閉じる',
    codeTitle: 'メールアドレス',
    copy: 'アドレスをコピー',
    copied: 'コピーしました',
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
