import type { Flaw, Painting, ShelfTopic } from './discoveries.en';

/**
 * The Turkish side of `discoveries.en.ts`: the same shelves, paintings, notes
 * and flaws in the same order (a test keeps the two in step).
 */

export const SHELF_TOPICS: readonly ShelfTopic[] = [
  {
    id: 'fantasy',
    name: 'Fantastik',
    moments: [
      {
        book: 'Harry Potter ve Felsefe Taşı',
        text: 'Yıpranmış bir kopya çekiyorsun. Harry Potter kitapları 500 milyondan fazla satışla tarihin en çok satan serileri arasında. Biri şu cümlenin altını çizmiş: “Hayallere dalıp yaşamayı unutmak iyi değildir.”',
      },
      {
        book: 'Hobbit',
        text: 'Tolkien ilk cümlesini, “Yerin altındaki bir delikte bir hobbit yaşardı”, okuduğu bir sınav kâğıdının boş sayfasına yazmış. Neden yazdığını kendisi de bilmediğini söylermiş.',
      },
      {
        book: 'Alice Harikalar Diyarında',
        text: 'Lewis Carroll’un Temmuz 1862’de Thames’te bir tekne gezisinde üç kız kardeşe uydurduğu bir hikâye olarak başladı. İçlerinden Alice Liddell, yazıya dökmesini istedi.',
      },
      {
        book: 'Küçük katlanmış bir harita',
        text: 'İki cildin arasına sıkışmış: var olmayan bir adanın elle çizilmiş haritası. Koylardan birinin üstüne “Burada iyi kahve var” yazılmış.',
      },
    ],
  },
  {
    id: 'scifi',
    name: 'Bilimkurgu',
    moments: [
      {
        book: 'Frankenstein',
        text: 'Mary Shelley bu romana on sekiz yaşında, 1816’nın yağmurlu yazında Cenevre Gölü kıyısında arkadaşlarıyla yaptığı bir korku hikâyesi yarışmasında başladı. Çoğu zaman ilk bilimkurgu romanı sayılır.',
      },
      {
        book: 'Ben, Robot',
        text: 'Isaac Asimov’un Üç Robot Yasası ilk kez 1942’deki “Runaround” öyküsünde bir arada göründü. Kurgudaki robotlar o günden beri bu yasaları tartışıyor.',
      },
      {
        book: 'R.U.R.',
        text: '“Robot” kelimesi Karel Čapek’in 1920 tarihli bu oyunundan gelir: Çekçe “robota”, yani angarya. Kelimeyi ona kardeşi Josef önermiş.',
      },
      {
        book: 'Ay’a Yolculuk',
        text: 'Jules Verne yolcularını 1865’te Florida’dan Ay’a gönderdi. Bir asır sonra Apollo 11 de Florida’dan havalandı.',
      },
    ],
  },
  {
    id: 'history',
    name: 'Tarih',
    moments: [
      {
        book: 'Tarih (Herodot)',
        text: 'Herodot bu eseri MÖ 5. yüzyılda yazdı. Cicero ona “Tarihin Babası” dedi; gerçi o zaman bile iyi bir hikâyeye biraz fazla kolay inandığı söylenirdi.',
      },
      {
        book: 'Rosetta Taşı rehberi',
        text: 'Taşın üstünde tek bir ferman üç yazıyla yazılı: hiyeroglif, demotik ve Eski Yunanca. Jean-François Champollion bunları karşılaştırarak 1822’de hiyeroglifleri yeniden okudu.',
      },
      {
        book: 'Gutenberg İncili, tıpkıbasım',
        text: 'Yaklaşık 1455’te basıldı; Avrupa’da hareketli metal harflerle basılan ilk büyük kitaplardan biri. Orijinalinin ellisinden az kopyası günümüze ulaştı.',
      },
    ],
  },
  {
    id: 'poetry',
    name: 'Şiir',
    moments: [
      {
        book: 'Mesnevi',
        text: 'Mevlânâ onu Konya’da yazdı, orada da yatıyor. Yaklaşık 25.000 beyit tutar ve kesildiği sazlığa hasret çeken bir neyle başlar.',
      },
      {
        book: 'Memleketimden İnsan Manzaraları',
        text: 'Nâzım Hikmet bu uzun şiirin çoğunu 1940’larda Bursa Cezaevi’nde yazdı. Bu kopyanın arasından kurutulmuş bir çiçek düşüyor.',
      },
      {
        book: 'Emily Dickinson, Bütün Şiirleri',
        text: 'Yaklaşık 1.800 şiir yazdı; sağken yalnızca on kadarı yayımlandı, çoğu da adı olmadan.',
      },
      {
        book: 'Bashō, haikular',
        text: '“Eski bir havuz / bir kurbağa atlar / suyun sesi.” 1686’dan üç kısa dize ve hâlâ Japonya’nın en ünlü şiirlerinden biri.',
      },
    ],
  },
  {
    id: 'philosophy',
    name: 'Felsefe',
    moments: [
      {
        book: 'Sokrates’in Savunması',
        text: 'Sokrates hiçbir şey yazmadı. Onun hakkında bildiklerimizin neredeyse hepsi öğrencilerinden, en çok da Platon’dan geliyor.',
      },
      {
        book: 'Yöntem Üzerine Konuşma',
        text: '“Düşünüyorum, öyleyse varım” ilk kez burada, 1637’de, Fransızca çıktı: “je pense, donc je suis”. Latincesi sonra geldi.',
      },
      {
        book: 'Kendime Düşünceler',
        text: 'Marcus Aurelius bunları imparatorken, çoğu zaman sefer yolunda, kendine özel notlar olarak yazdı. Başkasının okumasını hiç düşünmemişti.',
      },
    ],
  },
  {
    id: 'science',
    name: 'Bilim',
    moments: [
      {
        book: 'Türlerin Kökeni',
        text: '1859’da yayımlandı; 1.250 nüshalık ilk baskısı daha ilk gün kitapçılar tarafından kapışıldı.',
      },
      {
        book: 'Principia',
        text: 'Newton onu 1687’de Edmond Halley sayesinde yayımladı: Halley yazması için onu yüreklendirdi, baskı parasını da kendi cebinden ödedi.',
      },
      {
        book: 'Marie Curie, bir biyografi',
        text: 'Defterleri bir asrı aşkın süre sonra bile hâlâ radyoaktif. Görmek isteyenler bir feragat belgesi imzalıyor ve koruyucu giysi giyiyor.',
      },
    ],
  },
  {
    id: 'politics',
    name: 'Siyaset',
    moments: [
      {
        book: 'Ütopya',
        text: 'Thomas More kelimeyi 1516’da Yunancadan türetti: “hiçbir yer”. Kusursuz adası bir hayal olduğu kadar bir soruydu.',
      },
      {
        book: 'Prens',
        text: 'Machiavelli onu 1513’te yazdı ama kitap ancak 1532’de, ölümünden beş yıl sonra basıldı.',
      },
      {
        book: 'Bin Dokuz Yüz Seksen Dört',
        text: 'George Orwell onun büyük kısmını uzak bir İskoç adası olan Jura’da yazdı; kitap 1949’da çıktı. Biri son sayfaya kurşun kalemle “2+2=4” yazmış.',
      },
    ],
  },
  {
    id: 'novels',
    name: 'Roman',
    moments: [
      {
        book: 'Don Kişot',
        text: 'İlk bölümü 1605’te çıktı ve çoğu zaman ilk modern roman sayılır. Bir şövalye, bir silahtar ve bolca yel değirmeni.',
      },
      {
        book: 'Kürk Mantolu Madonna',
        text: 'Sabahattin Ali’nin romanı 1943’te çıktı ve yaklaşık yetmiş yıl sonra sessiz sedasız Türkiye’nin en çok satan kitaplarından biri oldu.',
      },
      {
        book: 'Savaş ve Barış',
        text: '500’den fazla karakter. Biri iç kapağa bir soy ağacı çizmeye başlamış, yarıda bırakmış.',
      },
      {
        book: 'Ödünç bir kütüphane kartı',
        text: 'Arka kapağın içine sıkıştırılmış: üzerinde on iki isim olan bir kart, en eskisi 1987’den. Seninkini de eklemek istiyorsun.',
      },
    ],
  },
];

export const PAINTINGS: readonly Painting[] = [
  {
    title: 'Uçurtma Günü',
    story:
      '2007’de, dört yaşındaki Nesrin yaptı. Minicik, değil mi? Adı yerine bir güneş çizerek imzalamış; uçurtma da evden büyük.',
  },
  {
    title: 'El Ele',
    story:
      'Savaş boyunca birbirine tutunan Vietnam halkını anlatıyor: yan yana eller, her biri ressamın köyünden başka biri tarafından boyanmış.',
  },
  {
    title: 'Gece Vardiyası',
    story:
      'İade edilmiş kitap yığınının üstünde uyuyan bir kütüphane kedisi. Resmi yapan kütüphaneci bunun bir otoportre olduğunda ısrar ediyor.',
  },
  {
    title: 'Şafakta Boğaz',
    story:
      'Boğaz’ı kırk bin kez geçmiş emekli bir vapur kaptanının eseri. Suyun hiç iki kez aynı renk olmadığını söylermiş; bu yüzden onu on bir maviyle boyamış.',
  },
  {
    title: 'Adsız (Mavi)',
    story:
      'Bir öğrenci final sınavından önceki gece, sabaha karşı üçte yapmış. Arkasında bir not var: “Geçtim.”',
  },
  {
    title: 'İlk Kar',
    story:
      'Bir köy öğretmeni otuz yıl boyunca her kış sınıfının penceresinden görünen manzarayı resmetti. Bu ilki, işe başladığı yıldan.',
  },
  {
    title: 'Uzun Masa',
    story:
      'Tek bir masada çalışan on iki yabancı; her birini o sandalyede oturan kişi boyamış. Lambanın rengi konusunda kimse anlaşamamış.',
  },
  {
    title: 'Babaannemin Bahçesi',
    story:
      'Sekiz torunlu bir babaanne kurutulmuş çiçekler ve nakış ipliğiyle yapmış. Her torunun bir yerde kendine ait bir çiçeği var.',
  },
  {
    title: 'Mustafa Kemal Atatürk',
    story:
      '29 Ekim 1923’te ilan edilen Türkiye Cumhuriyeti’nin kurucusu ve 1938’deki ölümüne dek ilk cumhurbaşkanı. 1928’de Latin harflerine dayalı Türk alfabesini getirdi ve elinde bir yazı tahtasıyla ülkeyi gezerek yeni harfleri kendisi öğretti; halk ona Başöğretmen dedi.',
  },
  {
    title: 'Napolyon Bonapart',
    story:
      '1804’ten itibaren Fransızların imparatoru. Aynı yıl getirdiği Medeni Kanun bugün hâlâ pek çok ülkenin hukukunu şekillendiriyor. Büyük bir okurdu; seferlere küçük kitaplardan oluşan seyyar bir kütüphaneyle giderdi.',
  },
  {
    title: 'Timur',
    story:
      'Timur (1336–1405) Semerkant’tan uçsuz bucaksız bir imparatorluğu yönetti ve şehri âlimler, şairler ve ustalarla doldurdu. Oradaki türbesi Gur-i Emir, dilimli mavi kubbesinin altında hâlâ ayakta. Satrancın daha büyük bir türü onun adını taşır.',
  },
  {
    title: '17 Ağustos 1999',
    story:
      'Sabaha karşı 03.02’de İzmit yakınlarında 7,6 büyüklüğünde bir deprem oldu ve 17.000’den fazla insan hayatını kaybetti. Yabancılar günlerce yan yana enkaz kaldırdı; kurtarma ekipleri pek çok ülkeden, ilklerden biri olarak Yunanistan’dan geldi. Lambalar onlar için.',
  },
  {
    title: '1 Eylül 1923',
    story:
      'Öğleye az kala Kantō ovasında 7,9 büyüklüğünde bir deprem oldu ve yangınlar Tokyo ile Yokohama’yı sardı; 100.000’den fazla insan öldü. İki şehir de yeniden kuruldu ve Japonya 1 Eylül’ü Afet Önleme Günü olarak anıyor.',
  },
  {
    title: 'Pompeii, MS 79',
    story:
      'Vezüv MS 79’da patladığında kül Pompeii kasabasını gömdü. 18. yüzyıldan itibaren yeniden kazılarak çıkarılan şehir, bir anda durmuş Roma hayatını gösteriyor: fırında hâlâ duran ekmekler ve duvarlara kazınmış notlar.',
  },
];

export const RENOVATION_NOTES: readonly string[] = [
  'Bir boya kutusuna bantlanmış not: “Pazartesi dönüyoruz. Lütfen ıslak sandalyelere oturmayın. — boyacılar”',
  'Üstünde “KİTAP — dikkatli (ve meraklı) taşıyın” yazan bir karton koli. Bandı çoktan açılmış.',
  'Duvarın yarısı taze, sıcak bir krem rengine boyanmış. Öbür yarısı daha çok insanın gelmesini bekliyor.',
  'Hâlâ ambalajında yeni masalar. Her birinde bir etiket: “iki kişilik” ya da “dört kişilik”.',
];

export const FLAWS = {
  crack: {
    title: 'Çatlak bir cam',
    text: 'Camın birinde ince bir çatlak var; geçen bahar başıboş bir topun çarptığı yerde yıldız gibi dağılmış. Çerçevede yapışkan bir not: “Camcı çağrıldı. Lütfen yaslanmayın. — hademe”',
  },
  shutter: {
    title: 'Kepenkler kapalı',
    text: 'Bu pencerenin mandalı sonbahar fırtınasında koptu ve kepenkler bütün sınav haftası boyunca çarpıp durdu. Yeni mandal gelene kadar çivilenip kapalı kalıyor.',
  },
  shelf: {
    title: 'Tamir ediliyor',
    text: 'Raflardan biri fazla sözlüğün altında esnedi. Marangoz daha sağlamını yapana kadar şeritle kapatıldı; kitapları yanında düzgün bir yığın hâlinde bekliyor.',
  },
} as const satisfies Record<string, Flaw>;
