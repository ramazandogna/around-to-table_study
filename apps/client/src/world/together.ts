import {
  isRoomArea,
  tableHourNow,
  tablesOf,
  whenLeft,
  type AreaGrid,
  type AreaId,
  type BookView,
  type ServerMessage,
} from '@att/shared';
import { t, type MessageKey } from '../i18n/t';
import { useGameStore } from '../state/store';
import { useTogether } from '../state/together';
import { createBooks, type Books } from './books';
import { createCandles, type Candles } from './candles';
import type { IsoView } from './IsoView';

/** How often the table hour and old books are checked. */
const CHECK_SECONDS = 15;
/** A book counts as "just now" for this long. */
const JUST_NOW_MS = 10 * 60_000;

/**
 * The room's share of studying together: the candles on the tables and the
 * books left on them, kept in step with what the room's server says. The
 * world calls in here at a few points (building the room, messages, the
 * frame, picking), so it stays out of the world's own code.
 */
export class TogetherLayer {
  private candles: Candles | null = null;
  private books: Books | null = null;
  private bookList: BookView[] = [];
  private checkIn = 0;

  constructor(
    private readonly view: IsoView,
    private readonly area: AreaId,
  ) {}

  /** Candles and books burn and lie only where there are tables to study at. */
  private get hasTables(): boolean {
    return this.area === 'library' || isRoomArea(this.area);
  }

  /** (Re)builds them for the room as it is now (the renovation may have opened a table). */
  build(grid: AreaGrid): void {
    this.removeMeshes();
    if (!this.hasTables) return;
    this.candles = createCandles(grid, tablesOf(this.area));
    this.books = createBooks(grid);
    this.view.add(this.candles.root);
    this.view.add(this.books.root);
    this.candles.set(useTogether.getState().candles, useGameStore.getState().clockOffset);
    this.candles.setTableHour(!!tableHourNow(this.serverNow()));
    this.books.set(this.bookList);
  }

  /** Takes the messages that are about studying together; true when one was. */
  onMessage(message: ServerMessage): boolean {
    const together = useTogether.getState();
    switch (message.t) {
      case 'welcome':
        together.setCandles(message.candles ?? []);
        this.bookList = message.books ?? [];
        this.candles?.set(together.candles, useGameStore.getState().clockOffset);
        this.books?.set(this.bookList);
        return false;
      case 'candles':
        together.setCandles(message.candles);
        this.candles?.set(message.candles, useGameStore.getState().clockOffset);
        return true;
      case 'book':
        this.bookList = [...this.bookList.filter((b) => b.id !== message.book.id), message.book];
        this.books?.add(message.book);
        return true;
      case 'reward':
        together.setReward(message.reward);
        return true;
      case 'focusing':
        together.setFocusing(message.focusing);
        return true;
      default:
        return false;
    }
  }

  update(delta: number): void {
    this.candles?.update(delta);
    this.checkIn -= delta;
    if (this.checkIn > 0) return;
    this.checkIn = CHECK_SECONDS;
    const now = this.serverNow();
    this.candles?.setTableHour(!!tableHourNow(now));
    this.books?.expire(now);
    this.bookList = this.bookList.filter((b) => now - b.at < 16 * 60 * 60_000);
  }

  /** The book under a screen point, if any. */
  bookAt(clientX: number, clientY: number): BookView | null {
    const books = this.books;
    if (!books) return null;
    const hit = this.view.pickObject(clientX, clientY, [books.root]);
    return hit?.instanceId !== undefined ? books.bookAt(hit.instanceId) : null;
  }

  /** "Mia · 50 min · this morning"; "someone" unless the finisher is a friend. */
  bookLabel(book: BookView): string {
    const now = this.serverNow();
    const who = book.mine ? t('book.you') : (book.name ?? t('book.someone'));
    let when: string;
    if (now - book.at < JUST_NOW_MS) when = t('book.when.now');
    else {
      const { day, part } = whenLeft(book.at, now, -new Date().getTimezoneOffset());
      when = t(`book.when.${day}.${part}` as MessageKey);
    }
    const label = `${who} · ${t('book.minutes', { n: book.minutes })} · ${when}`;
    return book.pair === null ? label : `${label} · ${t('book.shared')}`;
  }

  dispose(): void {
    this.removeMeshes();
    this.bookList = [];
    useTogether.getState().setCandles([]);
    useTogether.getState().setFocusing(null);
  }

  private removeMeshes(): void {
    if (this.candles) this.view.remove(this.candles.root);
    if (this.books) this.view.remove(this.books.root);
    this.candles?.dispose();
    this.books?.dispose();
    this.candles = null;
    this.books = null;
  }

  private serverNow(): number {
    return Date.now() + useGameStore.getState().clockOffset;
  }
}
