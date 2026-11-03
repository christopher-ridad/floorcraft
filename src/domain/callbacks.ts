import type { Competition } from './competition';
import { findHeat, firstRound, nextRound, type RoundsByEvent } from './rounds';
import type { CallbackMark, CallbackMarks, Couple, Heat, Round } from './types';

export const callbackKey = (coupleId: string, eventNumber: number) => `${coupleId}_${eventNumber}`;

/** Where a couple stands for one round, matching the keys of `HeatTeam`. */
export type CallbackStatus = 'dancing' | 'possible' | 'eliminated';

/**
 * Everyone dances the first round. A later round counts only once a callback to it is recorded;
 * until then it is possible, unless the couple was already not called back.
 */
export function callbackStatus(
  mark: CallbackMark | undefined,
  round: Round,
  eventFirstRound: Round,
): CallbackStatus {
  if (round <= (mark?.reachedRound ?? eventFirstRound)) return 'dancing';
  return mark?.eliminated ? 'eliminated' : 'possible';
}

export interface CallbackUpdate {
  coupleId: string;
  eventNumber: number;
  reachedRound: Round;
  eliminated: boolean;
}

/** Records a callback result. Going back to the first round with no elimination clears the mark. */
export function recordCallback(
  callbacks: CallbackMarks,
  rounds: RoundsByEvent,
  { coupleId, eventNumber, reachedRound, eliminated }: CallbackUpdate,
): CallbackMarks {
  const key = callbackKey(coupleId, eventNumber);
  const first = firstRound(rounds, eventNumber);
  if (!eliminated && first !== undefined && reachedRound <= first) {
    return Object.fromEntries(Object.entries(callbacks).filter(([markKey]) => markKey !== key));
  }
  return { ...callbacks, [key]: { reachedRound, eliminated } };
}

/** A callback result the team still needs to enter. */
export interface PendingCallback {
  couple: Couple;
  eventNumber: number;
  /** The heat the couple has danced. */
  dancedHeat: Heat;
  /** The heat they dance next if called back. */
  nextHeat: Heat;
  reachedRound: Round;
  nextRound: Round;
}

/**
 * Callbacks to enter: for each couple still in an event, once the heat of their latest round
 * is behind the floor and the event has a later round. Ordered by when that later round is.
 */
export function pendingCallbacks(competition: Competition): PendingCallback[] {
  const { schedule, couples, live, rounds, entryMatches, items, currentIndex } = competition;
  if (currentIndex < 0) return [];

  const pending: PendingCallback[] = [];
  for (const couple of couples) {
    for (const { eventNumber } of entryMatches.get(couple.id) ?? []) {
      if (eventNumber === null) continue;
      const mark = live.callbacks[callbackKey(couple.id, eventNumber)];
      if (mark?.eliminated) continue;

      const reached = mark?.reachedRound ?? firstRound(rounds, eventNumber);
      if (reached === undefined) continue;
      const next = nextRound(rounds, eventNumber, reached);
      if (next === null) continue;

      const dancedHeat = findHeat(schedule, eventNumber, reached);
      const nextHeat = findHeat(schedule, eventNumber, next);
      if (!dancedHeat || !nextHeat) continue;
      if ((items.get(dancedHeat.id)?.index ?? Infinity) >= currentIndex) continue;
      if (pending.some((p) => p.couple.id === couple.id && p.eventNumber === eventNumber)) continue;

      pending.push({
        couple,
        eventNumber,
        dancedHeat,
        nextHeat,
        reachedRound: reached,
        nextRound: next,
      });
    }
  }
  const indexOf = (heat: Heat) => items.get(heat.id)?.index ?? Infinity;
  return pending.sort((a, b) => indexOf(a.nextHeat) - indexOf(b.nextHeat));
}
