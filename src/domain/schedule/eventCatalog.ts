import { tokenizeEventName, type EventNameTokens } from '../entries/eventNameTokens';
import type { EventDetails } from '../types';

/** An event with its name broken down for matching entries against it. */
export interface CompetitionEvent extends EventDetails {
  tokens: EventNameTokens;
}

/** A competition's events keyed by `eventId`, in schedule order. */
export type EventCatalog = ReadonlyMap<string, CompetitionEvent>;

export function buildEventCatalog(events: readonly EventDetails[]): EventCatalog {
  return new Map(
    events.map((event) => [event.eventId, { ...event, tokens: tokenizeEventName(event.name) }]),
  );
}
