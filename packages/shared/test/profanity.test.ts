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
    ]) {
      expect(hasProfanity(text), text).toBe(false);
    }
  });

  it('masks the word in chat and keeps the rest', () => {
    expect(maskProfanity('oh fuck, my exam')).toEqual({ text: 'oh ****, my exam', masked: true });
    expect(maskProfanity('siktir git be')).toEqual({ text: '****** git be', masked: true });
    expect(maskProfanity('hello there')).toEqual({ text: 'hello there', masked: false });
  });
});
