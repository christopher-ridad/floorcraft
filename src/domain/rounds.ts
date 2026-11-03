import { parseHeatName } from './schedule/heatName';
import type { Heat, Round, ScheduleItem } from './types';

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

export function firstRound(rounds: RoundsByEvent, eventId: string): Round | undefined {
  return rounds.get(eventId)?.[0];
}

/** The round before `round`, or `round` itself when it is the first (or not scheduled). */
export function previousRound(rounds: RoundsByEvent, eventId: string, round: Round): Round {
  const eventRounds = rounds.get(eventId) ?? [];
  const index = eventRounds.indexOf(round);
  return index > 0 ? (eventRounds[index - 1] ?? round) : round;
}

/** The round after `round`, or null when it is the last (or not scheduled). */
export function nextRound(rounds: RoundsByEvent, eventId: string, round: Round): Round | null {
  const eventRounds = rounds.get(eventId) ?? [];
  const index = eventRounds.indexOf(round);
  return index >= 0 ? (eventRounds[index + 1] ?? null) : null;
}

export function findHeat(
  schedule: readonly ScheduleItem[],
  eventId: string,
  round: Round,
): Heat | undefined {
  return schedule.find(
    (item): item is Heat =>
      item.kind === 'heat' && item.eventId === eventId && parseHeatName(item.name).round === round,
  );
}
