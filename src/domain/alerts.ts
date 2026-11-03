import type { Competition } from './competition';
import { upcomingHeatsFor } from './dancers';
import { heatsAway } from './pace';

export type AlertType = 'heads-up' | 'on-deck';

export interface Alert {
  type: AlertType;
  heatId: string;
  heatsAway: number;
}

export interface AlertPreferences {
  /** The dancer this phone alerts for. Empty for no alerts. */
  dancer: string;
  /** Give a heads-up when the next heat is this many heats away or closer. */
  thresholdHeats: number;
}

/** Identifies an alert so each one is only given once. */
export const alertKey = ({ type, heatId }: Pick<Alert, 'type' | 'heatId'>) => `${heatId}:${type}`;

/**
 * The alert to give now for the dancer's next confirmed heat, if any. Heats that depend on a
 * callback never alert. Being on deck alerts even after a heads-up; a heads-up is skipped once
 * the dancer has been told they are on deck.
 */
export function nextAlert(
  competition: Competition,
  { dancer, thresholdHeats }: AlertPreferences,
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
  const onDeck = alertKey({ type: 'on-deck', heatId });
  const headsUp = alertKey({ type: 'heads-up', heatId });

  if (away === 1 && !alreadyGiven.has(onDeck)) return { type: 'on-deck', heatId, heatsAway: away };
  if (away <= thresholdHeats && !alreadyGiven.has(headsUp) && !alreadyGiven.has(onDeck)) {
    return { type: 'heads-up', heatId, heatsAway: away };
  }
  return null;
}
