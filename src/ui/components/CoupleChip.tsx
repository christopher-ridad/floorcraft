import type { HeatTeam } from '../../domain/competition';
import { isInCouple } from '../../domain/dancers';
import type { Couple } from '../../domain/types';
import { useApp } from '../context';
import { coupleName, cx } from '../format';

interface CoupleChipProps {
  couple: Couple;
  /** Highlight the chip when this phone's dancer is in the couple. */
  highlightMine?: boolean;
}

export function CoupleChip({ couple, highlightMine = true }: CoupleChipProps) {
  const { dancer } = useApp().store.preferences.value;
  const isMine = highlightMine && !!dancer && isInCouple(couple, dancer);
  return <span class={cx('chip', isMine && 'me')}>{coupleName(couple)}</span>;
}

/** The team's couples in a heat. */
export function TeamChips({ team }: { team: HeatTeam }) {
  return (
    <span class="chips">
      {team.couples.map((couple) => (
        <CoupleChip key={couple.id} couple={couple} />
      ))}
    </span>
  );
}

export const hasTeam = (team: HeatTeam) => team.couples.length > 0;
