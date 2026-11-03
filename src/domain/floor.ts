import { startOfDay } from './clock';
import type { Competition } from './competition';
import type { LiveState } from './types';

const MS_PER_MINUTE = 60_000;

/** Puts an item on the floor now. The pace is measured from this moment. */
export function markOnFloor(live: LiveState, itemId: string, now: number): LiveState {
  return { ...live, currentItemId: itemId, currentSetAt: now };
}

/** The next item is on the floor. Before the start, that is the first item. */
export function advanceFloor(competition: Competition, now: number): LiveState {
  const next =
    competition.schedule[competition.currentIndex < 0 ? 0 : competition.currentIndex + 1];
  return next ? markOnFloor(competition.live, next.id, now) : competition.live;
}

/**
 * Moves the floor back one item, as a correction: the pace stays as it was instead of
 * restarting the clock, by back-dating when the item went on the floor.
 */
export function moveFloorBack(competition: Competition, now: number): LiveState {
  const { schedule, currentIndex, items, delayMinutes, live } = competition;
  const previous = schedule[currentIndex < 0 ? 0 : currentIndex - 1];
  if (!previous) return live;

  const scheduledMinutes = items.get(previous.id)?.scheduledMinutes ?? null;
  if (scheduledMinutes === null) return markOnFloor(live, previous.id, now);
  const setAt = startOfDay(now) + (scheduledMinutes + delayMinutes) * MS_PER_MINUTE;
  return { ...live, currentItemId: previous.id, currentSetAt: setAt };
}
