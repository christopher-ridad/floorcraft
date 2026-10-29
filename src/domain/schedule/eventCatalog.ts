import { tokenizeEventName, type EventNameTokens } from '../entries/eventNameTokens';
import type { DanceStyle, ScheduleItem } from '../types';
import { parseHeatName } from './heatName';

/** One numbered event, however many rounds it has. */
export interface CompetitionEvent {
  eventNumber: number;
  baseName: string;
  style: DanceStyle;
  dances: string;
  tokens: EventNameTokens;
}

/** Events keyed by number, in the order they first appear on the schedule. */
export type EventCatalog = ReadonlyMap<number, CompetitionEvent>;

export function buildEventCatalog(schedule: readonly ScheduleItem[]): EventCatalog {
  const catalog = new Map<number, CompetitionEvent>();
  for (const item of schedule) {
    if (item.kind !== 'heat' || catalog.has(item.eventNumber)) continue;
    const { baseName, style, dances } = parseHeatName(item.name);
    catalog.set(item.eventNumber, {
      eventNumber: item.eventNumber,
      baseName,
      style,
      dances,
      tokens: tokenizeEventName(baseName),
    });
  }
  return catalog;
}
