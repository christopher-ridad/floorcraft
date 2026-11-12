import type { Competition } from './competition';
import { upcomingHeatsFor } from './dancers';
import { estimatedMinutes, heatsAway } from './pace';

/**
 * The team rule: when your next heat is this many minutes away (by the live estimate) or
 * closer, you go on deck. The same on every phone; there's no setting for it.
 */
export const ON_DECK_MINUTES = 15;

/** `on-deck`: about 15 minutes to go, time to be on deck. `up-next`: the very next heat. */
export type AlertType = 'on-deck' | 'up-next';

export interface Alert {
  type: AlertType;
  heatId: string;
  heatsAway: number;
  /** Estimated minutes until the heat starts, rounded, never negative. */
  minutesAway: number;
}

export interface AlertTarget {
  /** The dancer this phone alerts for. Empty for no alerts. */
  dancer: string;
  /** The time now, in minutes after midnight. */
  nowMinutes: number;
}

/** Identifies an alert so each one is only given once. */
export const alertKey = ({ type, heatId }: Pick<Alert, 'type' | 'heatId'>) => `${heatId}:${type}`;

/** True when a heat estimated to start at `estimate` is close enough to be on deck. */
export const isOnDeckTime = (estimate: number | null, nowMinutes: number) =>
  estimate !== null && estimate - nowMinutes <= ON_DECK_MINUTES;

/**
 * The alert to give now for the dancer's next confirmed heat, if any. Heats that depend on a
 * callback never alert. Being up next alerts even after the on-deck alert; the on-deck alert is
 * skipped once the dancer has been told they're up next.
 */
export function nextAlert(
  competition: Competition,
  { dancer, nowMinutes }: AlertTarget,
  alreadyGiven: ReadonlySet<string>,
): Alert | null {
  if (!dancer || competition.currentIndex < 0) return null;

  const next = upcomingHeatsFor(competition, dancer).find(
    ({ heat, isPossible }) =>
      !isPossible && (competition.items.get(heat.id)?.index ?? -1) > competition.currentIndex,
  );
  if (!next) return null;

  const heatId = next.heat.id;
  const away = heatsAway(competition, heatId) ?? Infinity;
  const estimate = estimatedMinutes(competition, heatId);
  const minutesAway = estimate === null ? 0 : Math.max(0, Math.round(estimate - nowMinutes));
  const upNext = alertKey({ type: 'up-next', heatId });
  const onDeck = alertKey({ type: 'on-deck', heatId });

  if (away === 1 && !alreadyGiven.has(upNext)) {
    return { type: 'up-next', heatId, heatsAway: away, minutesAway };
  }
  if (
    isOnDeckTime(estimate, nowMinutes) &&
    !alreadyGiven.has(onDeck) &&
    !alreadyGiven.has(upNext)
  ) {
    return { type: 'on-deck', heatId, heatsAway: away, minutesAway };
  }
  return null;
}
