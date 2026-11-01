import { isWeekly, type ProposedEvent, type WeeklyEvent } from '@att/shared';
import { t, type MessageKey } from '../i18n/t';

/** An event's title: weekly ones are translated, proposed ones are as their author wrote them. */
export function eventTitle(event: WeeklyEvent | ProposedEvent): string {
  return isWeekly(event) ? t(`event.${event.id}.title` as MessageKey) : event.title;
}

/** A short name for small places (the clock). */
export function eventShort(event: WeeklyEvent | ProposedEvent): string {
  return isWeekly(event) ? t(`event.${event.id}.short` as MessageKey) : event.title;
}

/** What an event is about, in a line. */
export function eventText(event: WeeklyEvent | ProposedEvent): string {
  return isWeekly(event) ? t(`event.${event.id}.text` as MessageKey) : event.description;
}
