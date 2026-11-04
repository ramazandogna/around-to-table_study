import { computed, ref, watch } from 'vue';

export const LANGUAGES = [
  { value: 'en', label: 'EN' },
  { value: 'tr', label: 'TR' },
  { value: 'zh', label: '中文' },
  { value: 'ja', label: '日本語' },
] as const;

export type Language = (typeof LANGUAGES)[number]['value'];

type Pillar = { title: string; text: string };

export type Copy = {
  nav: { features: string; rooms: string; beta: string; feedback: string; play: string };
  hero: {
    badge: string;
    title: string;
    subtitle: string;
    web: string;
    appStore: string;
    googlePlay: string;
    soon: string;
    invite: string;
  };
  pillarsTitle: string;
  pillarsLead: string;
  pillars: [Pillar, Pillar, Pillar, Pillar, Pillar];
  featuresTitle: string;
  features: [Pillar, Pillar, Pillar, Pillar, Pillar, Pillar];
  shotsTitle: string;
  shots: [string, string, string];
  beta: {
    title: string;
    lead: string;
    steps: [Pillar, Pillar, Pillar];
    suggest: string;
    bug: string;
    mailSubject: string;
    bugSubject: string;
  };
  footer: { made: string; credits: string; kit: string };
};

const en: Copy = {
  nav: {
    features: 'Features',
    rooms: 'Rooms',
    beta: 'Early beta',
    feedback: 'Suggest something',
    play: 'Play',
  },
  hero: {
    badge: 'Early beta · test it now',
    title: "Don't study alone.",
    subtitle:
      'A cozy little building where you study next to real people, take your breaks in the smoking room and make friends along the way.',
    web: 'Play on the web',
    appStore: 'App Store',
    googlePlay: 'Google Play',
    soon: 'Coming soon',
    invite: 'The beta is invite-only: ask for this week’s access code.',
  },
  pillarsTitle: 'A day inside the building',
  pillarsLead:
    'Real moments from the game: people meeting in the hall, playing in the smoking room, studying side by side and filling the conference hall.',
  pillars: [
    {
      title: 'A place to meet people',
      text: 'Walk in as your own character, see who is around, wave, poke, chat and add friends.',
    },
    {
      title: 'The smoking room',
      text: 'The break room where friendships start: rock-paper-scissors, tic-tac-toe, emoji riddles, darts, dice and a jukebox, with the score kept until someone wins.',
    },
    {
      title: 'Private rooms',
      text: 'Rooms for 3, 5 or 9 to study as a group or talk in private. Your rules, your guests.',
    },
    {
      title: 'The library',
      text: 'Sit at a desk next to others, pick a plan (pomodoro, deep focus, marathon) and let their focus carry yours.',
    },
    {
      title: 'Events',
      text: 'A weekly meetup, themed days and talks on the conference hall’s big screen, proposed by the community on one calendar everyone shares.',
    },
  ],
  featuresTitle: 'Made with care',
  features: [
    {
      title: 'Study plans',
      text: 'Pomodoro, deep focus, marathon, your own rhythm or a stopwatch. Others see your progress, like “🍅 2/4”.',
    },
    {
      title: 'Profiles and badges',
      text: 'Focus blocks today, this week, this month and this year, friends, time in the building, and badges for the effort.',
    },
    {
      title: 'Pets',
      text: 'A cat, a beagle, a corgi, a dachshund, a shiba, a rabbit and a turtle, each with its own ways and things to wear.',
    },
    {
      title: 'Day and night',
      text: 'The light follows your clock: morning sun, a golden afternoon, lamps at night. Staff work in shifts.',
    },
    {
      title: 'Phone and building chat',
      text: 'Message friends anywhere, see where they are, buzz their phone, and talk to the whole building.',
    },
    {
      title: 'Safe by design',
      text: 'Mute or block anyone, room owners can send people out, and the library stays quiet.',
    },
  ],
  shotsTitle: 'New this week',
  shots: [
    'Quick games: best of five, scores kept to the end',
    'Today’s goals and quests, filled by your focus time',
    'Two characters per device, each with their own story',
  ],
  beta: {
    title: 'Test the early beta',
    lead: 'Around the Table is young and changing every week. Play it, break it, and tell us what you think.',
    steps: [
      {
        title: 'Get the access code',
        text: 'Ask for it: it changes with every update, so the beta stays small.',
      },
      {
        title: 'Make your character',
        text: 'Pick a name, a look and a pet. No sign-up for now.',
      },
      {
        title: 'Tell us what you think',
        text: 'Ideas, bugs, wishes: every message is read.',
      },
    ],
    suggest: 'Suggest something',
    bug: 'Report a bug',
    mailSubject: 'Around the Table: a suggestion',
    bugSubject: 'Around the Table: a bug',
  },
  footer: {
    made: 'Made by Ramazan Doğan',
    credits: '3D models by Kenney (CC0). Music by Kevin MacLeod (CC BY 4.0). Built with rei-kit.',
    kit: 'rei-kit',
  },
};

const tr: Copy = {
  nav: {
    features: 'Özellikler',
    rooms: 'Odalar',
    beta: 'Erken beta',
    feedback: 'Öneride bulun',
    play: 'Oyna',
  },
  hero: {
    badge: 'Erken beta · şimdi dene',
    title: 'Yalnız çalışma.',
    subtitle:
      'Gerçek insanların yanında ders çalıştığın, molalarını sigara odasında verdiğin ve yol boyunca arkadaş edindiğin sıcacık küçük bir bina.',
    web: 'Web’de oyna',
    appStore: 'App Store',
    googlePlay: 'Google Play',
    soon: 'Yakında',
    invite: 'Beta davetle: bu haftanın giriş kodunu iste.',
  },
  pillarsTitle: 'Binada bir gün',
  pillarsLead:
    'Oyundan gerçek anlar: holde tanışan, sigara odasında oyun oynayan, yan yana çalışan ve konferans salonunu dolduran insanlar.',
  pillars: [
    {
      title: 'İnsanlarla tanışacağın bir yer',
      text: 'Kendi karakterinle içeri gir, kimler var gör; el salla, dürt, sohbet et, arkadaş ekle.',
    },
    {
      title: 'Sigara odası',
      text: 'Arkadaşlıkların başladığı mola odası: taş-kâğıt-makas, XOX, emoji bilmece, dart, zar ve müzik kutusu; biri kazanana kadar skor tutulur.',
    },
    {
      title: 'Özel odalar',
      text: '3, 5 ya da 9 kişilik odalarda grupça çalış ya da baş başa konuş. Kurallar senin, misafirler senin.',
    },
    {
      title: 'Kütüphane',
      text: 'Başkalarının yanında bir masaya otur, bir plan seç (pomodoro, derin odak, maraton); onların odağı seninkini taşısın.',
    },
    {
      title: 'Etkinlikler',
      text: 'Haftalık buluşma, temalı günler ve konferans salonunun büyük ekranında sunumlar; topluluk önerir, herkes aynı takvimi paylaşır.',
    },
  ],
  featuresTitle: 'Özenle yapıldı',
  features: [
    {
      title: 'Çalışma planları',
      text: 'Pomodoro, derin odak, maraton, kendi ritmin ya da kronometre. Diğerleri ilerlemeni “🍅 2/4” gibi görür.',
    },
    {
      title: 'Profil ve rozetler',
      text: 'Bugün, bu hafta, bu ay ve bu yıl odak blokları, arkadaşlar, binada geçen süre ve emeğin için rozetler.',
    },
    {
      title: 'Evcil hayvanlar',
      text: 'Kedi, beagle, corgi, dachshund, shiba, tavşan ve kaplumbağa; her birinin kendi huyu ve aksesuarları var.',
    },
    {
      title: 'Gece ve gündüz',
      text: 'Işık senin saatini izler: sabah güneşi, altın bir öğleden sonra, gece lambalar. Görevliler vardiyayla çalışır.',
    },
    {
      title: 'Telefon ve bina sohbeti',
      text: 'Arkadaşlarına her yerden yaz, nerede olduklarını gör, telefonlarını titret, tüm binayla konuş.',
    },
    {
      title: 'Güvenli tasarım',
      text: 'İstediğini sessize al ya da engelle; oda sahipleri birini çıkarabilir; kütüphane sessiz kalır.',
    },
  ],
  shotsTitle: 'Bu hafta yeni',
  shots: [
    'Hızlı oyunlar: 5’te en iyi, skor sonuna kadar',
    'Bugünün hedefleri ve görevleri, odak sürenle dolar',
    'Bir cihazda iki karakter, her birinin kendi hikâyesi',
  ],
  beta: {
    title: 'Erken betayı test et',
    lead: 'Around the Table genç ve her hafta değişiyor. Oyna, boz, ne düşündüğünü bize yaz.',
    steps: [
      {
        title: 'Giriş kodunu al',
        text: 'İste: her güncellemede değişir, böylece beta küçük kalır.',
      },
      {
        title: 'Karakterini yap',
        text: 'Bir isim, bir görünüm ve bir evcil hayvan seç. Şimdilik kayıt yok.',
      },
      {
        title: 'Ne düşündüğünü söyle',
        text: 'Fikir, hata, istek: her mesaj okunuyor.',
      },
    ],
    suggest: 'Öneride bulun',
    bug: 'Hata bildir',
    mailSubject: 'Around the Table: bir öneri',
    bugSubject: 'Around the Table: bir hata',
  },
  footer: {
    made: 'Ramazan Doğan tarafından yapıldı',
    credits: '3B modeller: Kenney (CC0). Müzik: Kevin MacLeod (CC BY 4.0). rei-kit ile yapıldı.',
    kit: 'rei-kit',
  },
};

const zh: Copy = {
  nav: { features: '特色', rooms: '房间', beta: '抢先测试', feedback: '提建议', play: '开始' },
  hero: {
    badge: '抢先测试 · 现在就试',
    title: '别一个人学习。',
    subtitle: '一栋温馨的小楼：在真人身边学习，到吸烟室休息，顺便交到朋友。',
    web: '在网页上玩',
    appStore: 'App Store',
    googlePlay: 'Google Play',
    soon: '即将推出',
    invite: '测试仅限受邀：请索取本周的访问码。',
  },
  pillarsTitle: '楼里的一天',
  pillarsLead: '来自游戏的真实瞬间：在大厅相识、在吸烟室玩游戏、并肩学习、坐满会议厅。',
  pillars: [
    {
      title: '认识新朋友的地方',
      text: '用自己的角色走进来，看看谁在，打招呼、戳一戳、聊天、加好友。',
    },
    {
      title: '吸烟室',
      text: '友谊开始的休息室：石头剪刀布、井字棋、表情猜谜、飞镖、骰子和点唱机，比分一直记到有人获胜。',
    },
    {
      title: '私人房间',
      text: '3、5 或 9 人的房间，可以一起学习，也可以私下聊天。规则你定，客人你选。',
    },
    {
      title: '图书馆',
      text: '在别人身边找张书桌坐下，选一个计划（番茄钟、深度专注、马拉松），让他们的专注带着你。',
    },
    {
      title: '活动',
      text: '每周聚会、主题日，以及会议厅大屏幕上的分享，由社区提议，放在一个大家共享的日历上。',
    },
  ],
  featuresTitle: '用心打造',
  features: [
    {
      title: '学习计划',
      text: '番茄钟、深度专注、马拉松、自定节奏或秒表。别人能看到你的进度，比如“🍅 2/4”。',
    },
    {
      title: '个人资料与徽章',
      text: '今天、本周、本月和今年的专注次数、好友、在楼里的时间，以及为努力颁发的徽章。',
    },
    {
      title: '宠物',
      text: '猫、比格犬、柯基、腊肠犬、柴犬、兔子和乌龟，各有各的脾气和配饰。',
    },
    {
      title: '日与夜',
      text: '光线跟随你的时间：清晨的阳光、金色的午后、夜里的台灯。员工轮班工作。',
    },
    {
      title: '手机与全楼聊天',
      text: '随时给朋友发消息，看到他们在哪儿，让他们的手机震一下，或者和整栋楼聊天。',
    },
    {
      title: '安全的设计',
      text: '可以静音或屏蔽任何人，房主可以请人离开，图书馆始终保持安静。',
    },
  ],
  shotsTitle: '本周新增',
  shots: [
    '小游戏：五局三胜，比分记到最后',
    '今天的目标和任务，用专注时间填满',
    '一台设备两个角色，各有各的故事',
  ],
  beta: {
    title: '参加抢先测试',
    lead: 'Around the Table 还很年轻，每周都在变化。来玩、来找问题，告诉我们你的想法。',
    steps: [
      { title: '获取访问码', text: '向我们索取：每次更新都会更换，测试因此保持小规模。' },
      { title: '创建你的角色', text: '选一个名字、一个造型和一只宠物。暂时不需要注册。' },
      { title: '告诉我们你的想法', text: '想法、问题、愿望：每条消息都会被认真阅读。' },
    ],
    suggest: '提建议',
    bug: '报告问题',
    mailSubject: 'Around the Table：建议',
    bugSubject: 'Around the Table：问题',
  },
  footer: {
    made: '由 Ramazan Doğan 制作',
    credits: '3D 模型：Kenney（CC0）。音乐：Kevin MacLeod（CC BY 4.0）。使用 rei-kit 构建。',
    kit: 'rei-kit',
  },
};

const ja: Copy = {
  nav: {
    features: '特長',
    rooms: '部屋',
    beta: 'アーリーベータ',
    feedback: '提案する',
    play: 'あそぶ',
  },
  hero: {
    badge: 'アーリーベータ・いますぐ試せます',
    title: 'ひとりで勉強しないで。',
    subtitle:
      '本物の人たちのとなりで勉強して、休憩は喫煙室で。気がつけば友だちができている、あたたかな小さな建物です。',
    web: 'ブラウザであそぶ',
    appStore: 'App Store',
    googlePlay: 'Google Play',
    soon: '近日公開',
    invite: 'ベータは招待制です。今週のアクセスコードをお問い合わせください。',
  },
  pillarsTitle: '建物の一日',
  pillarsLead:
    'ゲームの中の本当の瞬間：ホールで出会い、喫煙室で遊び、並んで勉強し、会議ホールを満たす人たち。',
  pillars: [
    {
      title: '人と出会える場所',
      text: '自分のキャラクターで入って、誰がいるか見て、手を振ったり、つついたり、話したり、友だちになったり。',
    },
    {
      title: '喫煙室',
      text: '友情が始まる休憩室。じゃんけん、三目並べ、絵文字なぞなぞ、ダーツ、サイコロ、ジュークボックス。勝者が決まるまでスコアを記録。',
    },
    {
      title: 'プライベートルーム',
      text: '3人、5人、9人の部屋で、みんなで勉強したり、内緒の話をしたり。ルールもゲストもあなた次第。',
    },
    {
      title: '図書館',
      text: '誰かのとなりの机に座って、プラン（ポモドーロ、ディープフォーカス、マラソン）を選べば、みんなの集中があなたを支えます。',
    },
    {
      title: 'イベント',
      text: '毎週のミートアップ、テーマの日、会議ホールの大画面での発表。コミュニティが提案し、みんなで共有するひとつのカレンダーに。',
    },
  ],
  featuresTitle: 'ていねいに作っています',
  features: [
    {
      title: '勉強プラン',
      text: 'ポモドーロ、ディープフォーカス、マラソン、自分のリズム、ストップウォッチ。進み具合は「🍅 2/4」のようにみんなに見えます。',
    },
    {
      title: 'プロフィールとバッジ',
      text: '今日・今週・今月・今年の集中ブロック、友だち、建物にいた時間、そして努力のバッジ。',
    },
    {
      title: 'ペット',
      text: 'ねこ、ビーグル、コーギー、ダックスフント、柴犬、うさぎ、カメ。それぞれに性格と身につけるものがあります。',
    },
    {
      title: '昼と夜',
      text: '光はあなたの時計に合わせて変わります。朝の日差し、金色の午後、夜のランプ。スタッフはシフト制です。',
    },
    {
      title: 'スマホと建物チャット',
      text: 'どこからでも友だちにメッセージ。居場所がわかり、スマホを鳴らせて、建物全体とも話せます。',
    },
    {
      title: '安心の設計',
      text: '誰でもミュートやブロックができ、部屋のオーナーは退出させることも。図書館はいつも静かです。',
    },
  ],
  shotsTitle: '今週の新機能',
  shots: [
    'ミニゲーム：5本勝負、最後までスコアを記録',
    '今日の目標とクエスト、集中した時間で埋まる',
    '1台に2人のキャラクター、それぞれの物語',
  ],
  beta: {
    title: 'アーリーベータに参加する',
    lead: 'Around the Table はまだ生まれたばかりで、毎週変わっています。遊んで、壊して、感想を聞かせてください。',
    steps: [
      {
        title: 'アクセスコードをもらう',
        text: 'お問い合わせください。更新のたびに変わるので、ベータは小さく保たれます。',
      },
      {
        title: 'キャラクターを作る',
        text: '名前、見た目、ペットを選ぶだけ。いまは登録不要です。',
      },
      {
        title: '感想を送る',
        text: 'アイデア、バグ、お願い。すべてのメッセージを読んでいます。',
      },
    ],
    suggest: '提案する',
    bug: 'バグを報告',
    mailSubject: 'Around the Table：提案',
    bugSubject: 'Around the Table：バグ',
  },
  footer: {
    made: '制作：Ramazan Doğan',
    credits:
      '3Dモデル：Kenney（CC0）。音楽：Kevin MacLeod（CC BY 4.0）。rei-kit で作られています。',
    kit: 'rei-kit',
  },
};

const COPY: Record<Language, Copy> = { en, tr, zh, ja };
const KEY = 'att-site.language';

function stored(): Language {
  try {
    const value = localStorage.getItem(KEY);
    return LANGUAGES.some((l) => l.value === value) ? (value as Language) : 'en';
  } catch {
    return 'en';
  }
}

/** The page's language: English unless the visitor picked another, kept on their device. */
export const language = ref<Language>(stored());
export const copy = computed(() => COPY[language.value]);

watch(
  language,
  (value) => {
    document.documentElement.lang = value === 'zh' ? 'zh-Hans' : value;
    try {
      localStorage.setItem(KEY, value);
    } catch {
      // Not kept; English next time.
    }
  },
  { immediate: true },
);
