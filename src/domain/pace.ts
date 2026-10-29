import type { Competition } from './competition';

/** Within this many minutes of schedule counts as on time. */
const ON_TIME_TOLERANCE_MINUTES = 3;

/**
 * Estimated start in minutes after midnight: the posted time, shifted by the current delay for
 * items after the one on the floor. Null for an unknown item or one with no readable time.
 */
export function estimatedMinutes(competition: Competition, itemId: string): number | null {
  const info = competition.items.get(itemId);
  if (!info || info.scheduledMinutes === null) return null;
  const isAhead = competition.currentIndex >= 0 && info.index > competition.currentIndex;
  return info.scheduledMinutes + (isAhead ? competition.delayMinutes : 0);
}

/** How many items until this one reaches the floor (0 = on the floor, negative = done). */
export function heatsAway(competition: Competition, itemId: string): number | null {
  const info = competition.items.get(itemId);
  if (!info || competition.currentIndex < 0) return null;
  return info.index - competition.currentIndex;
}

export type PaceStatus =
  | { kind: 'not-started' }
  | { kind: 'on-time' }
  | { kind: 'behind'; minutes: number }
  | { kind: 'ahead'; minutes: number };

export function paceStatus(competition: Competition): PaceStatus {
  if (competition.currentIndex < 0) return { kind: 'not-started' };
  const delay = Math.round(competition.delayMinutes);
  if (Math.abs(delay) < ON_TIME_TOLERANCE_MINUTES) return { kind: 'on-time' };
  return delay > 0 ? { kind: 'behind', minutes: delay } : { kind: 'ahead', minutes: -delay };
}
