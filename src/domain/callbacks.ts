import type { CallbackMark, Round } from './types';

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
