import { describe, expect, it } from 'vitest';
import { hasProfanity, maskProfanity } from '../src';

describe('the swear filter', () => {
  it('catches English and Turkish swears, however they are disguised', () => {
    for (const text of [
      'what the fuck',
      'FUUUCK this',
      'f.u.c.k',
      's h i t happens',
      'sh1t',
      'you a55hole',
      'siktir git',
      'SİKTİR',
      'orospu çocuğu',
      'amk ya',
      'yarrak',
      'amına koyayım',
      'ibne',
      // Stars, glue and look-alike letters.
      'f*ck off',
      'what the f**k',
      'you are a b*tch',
      'a-m-k',
      's.i.k.t.i.r',
      'big-ass problem',
      'fuсk', // Cyrillic с
      'ѕhit', // Cyrillic ѕ
      'ｆｕｃｋ', // full width
      'f\u200buck', // zero-width space
      'sh!t',
      '$hit',
      'pussssy',
      'motherfucker',
      'bullshit',
      'stfu',
      // Turkish, with endings and Turkish letters.
      'göt herif',
      'piç kurusu',
      'oç',
      'sikik',
      'sikim',
      'yavşaklar',
      'şerefsiz',
      'kaltaklık',
      'pezevenkler',
      'amcık',
      'ananı sikeyim',
      'amına kodumun',
      'dalyarak',
      'gerizekalı',
      'orospuluk',
      'puşt',
      'yarrağı',
    ]) {
      expect(hasProfanity(text), text).toBe(true);
    }
  });

  it('leaves everyday words alone', () => {
    for (const text of [
      'I got it, nice pic',
      'Scunthorpe has a class',
      'the assessment is due',
      'bu ders çok sıkıcı',
      'otobüs çok sıkışık',
      'sıkıntı yok, amin',
      'göt­ür bunu eve',
      'götürür müsün',
      'Dickens and shiitake',
      'a b c',
      'çalışıyorum, kafam sıkı',
      'sık sık gelirim',
      'SIK SIK',
      'as soon as possible',
      'my assistant passed the class',
      'a cocktail in the cockpit',
      'the bit chain broke',
      'niggling doubts',
      'Amina and Amini came',
      'cumartesi ve cuma',
      'Cumhuriyet Bayramı',
      'got it, I have gotten there',
      'nice picture',
      'e.g. U.S.A.',
      'well-known self-esteem',
      '2*3 = 6',
      'sıkı çalış, sıkılma',
      'götürdüm kitabı',
      'ibni sina',
      'mavi kalem',
      'yarın görüşürüz',
      'tasarruf et',
      'amcam geldi',
    ]) {
      expect(hasProfanity(text), text).toBe(false);
    }
  });

  it('masks the word in chat and keeps the rest', () => {
    expect(maskProfanity('oh fuck, my exam')).toEqual({ text: 'oh ****, my exam', masked: true });
    expect(maskProfanity('siktir git be')).toEqual({ text: '****** git be', masked: true });
    expect(maskProfanity('hello there')).toEqual({ text: 'hello there', masked: false });
    expect(maskProfanity('amına koyayım ya').text).toBe('****** ya');
    expect(maskProfanity('f*ck it').text).toBe('**** it');
  });
});
