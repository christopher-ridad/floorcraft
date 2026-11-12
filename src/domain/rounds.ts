import { parseHeatName } from './schedule/heatName';
import type { Round, ScheduleItem } from './types';

/** The rounds each event has on the schedule, ascending, keyed by `eventId`. */
export type RoundsByEvent = ReadonlyMap<string, readonly Round[]>;

export function roundsByEvent(schedule: readonly ScheduleItem[]): RoundsByEvent {
  const rounds = new Map<string, Round[]>();
  for (const item of schedule) {
    if (item.kind !== 'heat') continue;
    const { round } = parseHeatName(item.name);
    const eventRounds = rounds.get(item.eventId) ?? [];
    if (!eventRounds.includes(round)) eventRounds.push(round);
    rounds.set(item.eventId, eventRounds);
  }
  for (const eventRounds of rounds.values()) eventRounds.sort((a, b) => a - b);
  return rounds;
}
