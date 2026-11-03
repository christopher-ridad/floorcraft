import { tokenizeEventName } from '../entries/eventNameTokens';
import type { EventDetails, Heat, IdFactory, Schedule, ScheduleBreak } from '../types';
import { parseHeatName } from './heatName';

/** A schedule line before its event is identified: a heat without an `eventId`, or a break. */
export type ScheduleLine = Omit<Heat, 'eventId'> | ScheduleBreak;

const normalizeName = (name: string) => name.toLowerCase().replace(/\s+/g, ' ').trim();

/** Strips event ids from a schedule, so it can be identified again after an edit. */
export const toScheduleLines = (items: Schedule['items']): ScheduleLine[] =>
  items.map((item) =>
    item.kind === 'break'
      ? item
      : {
          kind: 'heat',
          id: item.id,
          scheduledTime: item.scheduledTime,
          eventNumber: item.eventNumber,
          name: item.name,
        },
  );

/**
 * Works out each event on a schedule and gives every heat its event's id.
 *
 * Events keep the id they had in `previousEvents` so a couple's entries and callbacks stay
 * attached when an updated schedule is pasted. An event matches, in order of preference, one
 * with the same number and name, then one with the same name (it was renumbered), then one with
 * the same number (its name was corrected). Anything else gets a new id.
 */
export function identifyEvents(
  lines: readonly ScheduleLine[],
  previousEvents: readonly EventDetails[],
  createId: IdFactory,
): Schedule {
  const firstHeats = new Map<number, Omit<Heat, 'eventId'>>();
  for (const line of lines) {
    if (line.kind === 'heat' && !firstHeats.has(line.eventNumber)) {
      firstHeats.set(line.eventNumber, line);
    }
  }

  const details = [...firstHeats.values()].map((heat) => {
    const { baseName, style, dances } = parseHeatName(heat.name);
    return {
      eventNumber: heat.eventNumber,
      name: baseName,
      level: tokenizeEventName(baseName).level,
      style,
      dances,
    };
  });

  const unclaimed = new Set(previousEvents);
  const matches = new Map<number, EventDetails>();
  const claimMatches = (
    isMatch: (previous: EventDetails, event: (typeof details)[0]) => boolean,
  ) => {
    for (const event of details) {
      if (matches.has(event.eventNumber)) continue;
      const previous = [...unclaimed].find((candidate) => isMatch(candidate, event));
      if (!previous) continue;
      unclaimed.delete(previous);
      matches.set(event.eventNumber, previous);
    }
  };
  const sameName = (previous: EventDetails, event: (typeof details)[0]) =>
    normalizeName(previous.name) === normalizeName(event.name);
  claimMatches(
    (previous, event) => previous.eventNumber === event.eventNumber && sameName(previous, event),
  );
  claimMatches(sameName);
  claimMatches((previous, event) => previous.eventNumber === event.eventNumber);

  const events: EventDetails[] = details.map((event) => {
    const previous = matches.get(event.eventNumber);
    const isUnchanged =
      !!previous &&
      previous.name === event.name &&
      previous.style === event.style &&
      previous.dances === event.dances &&
      previous.level === event.level;
    return {
      ...event,
      eventId: previous?.eventId ?? createId(),
      // A reviewed event stays reviewed only if nothing about it changed.
      confirmed: isUnchanged && previous.confirmed,
    };
  });

  const idByNumber = new Map(events.map((event) => [event.eventNumber, event.eventId]));
  const items = lines.map((line) =>
    line.kind === 'heat' ? { ...line, eventId: idByNumber.get(line.eventNumber) ?? '' } : line,
  );
  return { items, events };
}
