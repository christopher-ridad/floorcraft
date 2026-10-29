import type { HeatTeam } from '../../domain/competition';
import { isInCouple } from '../../domain/dancers';
import type { CallbackStatus } from '../../domain/callbacks';
import type { Couple } from '../../domain/types';
import { useApp } from '../context';
import { coupleName, cx } from '../format';

interface CoupleChipProps {
  couple: Couple;
  status?: CallbackStatus;
  /** Highlight the chip when this phone's dancer is in the couple. */
  highlightMine?: boolean;
}

export function CoupleChip({ couple, status = 'dancing', highlightMine = true }: CoupleChipProps) {
  const { dancer } = useApp().store.preferences.value;
  const isMine = highlightMine && !!dancer && isInCouple(couple, dancer);
  const isPossible = status === 'possible';
  return (
    <span
      class={cx('chip', isMine && 'me', isPossible && 'maybe', status === 'eliminated' && 'out')}
      title={isPossible ? 'Waiting on a callback' : undefined}
    >
      {coupleName(couple)}
      {isPossible && ' ?'}
    </span>
  );
}

/** The team's couples in a heat: confirmed ones, plus possible ones when shown. */
export function TeamChips({ team }: { team: HeatTeam }) {
  const { showPossibleHeats } = useApp().store.preferences.value;
  return (
    <span class="chips">
      {team.dancing.map((couple) => (
        <CoupleChip key={couple.id} couple={couple} />
      ))}
      {showPossibleHeats &&
        team.possible.map((couple) => (
          <CoupleChip key={couple.id} couple={couple} status="possible" />
        ))}
    </span>
  );
}

export const hasTeam = (team: HeatTeam) => team.dancing.length + team.possible.length > 0;
