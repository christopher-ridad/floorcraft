import type { Competition } from './competition';
import { findHeat, firstRound, nextRound, type RoundsByEvent } from './rounds';
import type { CallbackMark, CallbackMarks, Couple, Heat, Round } from './types';

export const callbackKey = (coupleId: string, eventId: string) => `${coupleId}_${eventId}`;

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
  eventId: string;
  reachedRound: Round;
  eliminated: boolean;
}

/**
 * The mark to store for a callback result, under `callbackKey(coupleId, eventId)`. Going back to
 * the first round with no elimination needs no mark at all (null): that's the starting state.
 */
export function callbackMarkFor(
  rounds: RoundsByEvent,
  { eventId, reachedRound, eliminated }: CallbackUpdate,
): CallbackMark | null {
  const first = firstRound(rounds, eventId);
  if (!eliminated && first !== undefined && reachedRound <= first) return null;
  return { reachedRound, eliminated };
}

/** Records a callback result in a set of marks. */
export function recordCallback(
  callbacks: CallbackMarks,
  rounds: RoundsByEvent,
  update: CallbackUpdate,
): CallbackMarks {
  const key = callbackKey(update.coupleId, update.eventId);
  const mark = callbackMarkFor(rounds, update);
  if (mark) return { ...callbacks, [key]: mark };
  return Object.fromEntries(Object.entries(callbacks).filter(([markKey]) => markKey !== key));
}

/** A callback result the team still needs to enter. */
export interface PendingCallback {
  couple: Couple;
  eventId: string;
  /** The heat the couple has danced. */
  dancedHeat: Heat;
  /** The heat they dance next if called back. */
  nextHeat: Heat;
  reachedRound: Round;
  nextRound: Round;
  /** The next round is on the floor or already over, and nobody entered the result. */
  isOverdue: boolean;
}

/**
 * Callbacks to enter: for each couple still in an event, once the heat of their latest round
 * is behind the floor and the event has a later round. Overdue ones (the later round has
 * started) come first; then they're ordered by when that later round is.
 */
export function pendingCallbacks(competition: Competition): PendingCallback[] {
  const { schedule, couples, live, rounds, coupleEvents, items, currentIndex } = competition;
  if (currentIndex < 0) return [];

  const pending: PendingCallback[] = [];
  for (const couple of couples) {
    for (const eventId of coupleEvents.get(couple.id) ?? []) {
      const mark = live.callbacks[callbackKey(couple.id, eventId)];
      if (mark?.eliminated) continue;

      const reached = mark?.reachedRound ?? firstRound(rounds, eventId);
      if (reached === undefined) continue;
      const next = nextRound(rounds, eventId, reached);
      if (next === null) continue;

      const dancedHeat = findHeat(schedule, eventId, reached);
      const nextHeat = findHeat(schedule, eventId, next);
      if (!dancedHeat || !nextHeat) continue;
      if ((items.get(dancedHeat.id)?.index ?? Infinity) >= currentIndex) continue;
      if (pending.some((p) => p.couple.id === couple.id && p.eventId === eventId)) continue;

      pending.push({
        couple,
        eventId,
        dancedHeat,
        nextHeat,
        reachedRound: reached,
        nextRound: next,
        isOverdue: (items.get(nextHeat.id)?.index ?? Infinity) <= currentIndex,
      });
    }
  }
  const indexOf = (heat: Heat) => items.get(heat.id)?.index ?? Infinity;
  return pending.sort(
    (a, b) =>
      Number(b.isOverdue) - Number(a.isOverdue) || indexOf(a.nextHeat) - indexOf(b.nextHeat),
  );
}
