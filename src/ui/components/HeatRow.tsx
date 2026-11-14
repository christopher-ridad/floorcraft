import { formatClockTime } from '../../domain/clock';
import { isInCouple, partnerOf } from '../../domain/dancers';
import { estimatedMinutes, heatsAway } from '../../domain/pace';
import type { Heat, ScheduleBreak } from '../../domain/types';
import { useApp } from '../context';
import { cx, partnerName, roundLabel } from '../format';
import { hasTeam, TeamChips } from './CoupleChip';
import styles from './HeatRow.module.css';

/** Estimates this close to the posted time aren't worth showing. */
const MIN_SHOWN_DRIFT_MINUTES = 2;

interface HeatRowProps {
  heat: Heat;
  /** Show "N away" for upcoming heats. */
  showAway?: boolean;
  /** Show the heat from one dancer's point of view: their partner instead of the team's chips. */
  dancer?: string | null;
}

/** One heat in a list. */
export function HeatRow({ heat, showAway = false, dancer = null }: HeatRowProps) {
  const { store } = useApp();
  const competition = store.competition.value;
  const preferences = store.preferences.value;
  const info = competition.items.get(heat.id);
  const team = competition.heatTeams.get(heat.id);
  if (!info?.heatName || !team) return null;

  const { currentIndex } = competition;
  const isNow = info.index === currentIndex;
  const isDone = currentIndex >= 0 && info.index < currentIndex;
  const isMine =
    !!preferences.dancer && team.couples.some((couple) => isInCouple(couple, preferences.dancer));
  const estimate = estimatedMinutes(competition, heat.id);
  const showEstimate =
    currentIndex >= 0 &&
    info.index > currentIndex &&
    estimate !== null &&
    info.scheduledMinutes !== null &&
    Math.abs(estimate - info.scheduledMinutes) >= MIN_SHOWN_DRIFT_MINUTES;
  const away = heatsAway(competition, heat.id);
  const dancersCouple = dancer && team.couples.find((couple) => isInCouple(couple, dancer));

  return (
    <div
      class={cx(
        styles.heat,
        `lane-${info.heatName.style}`,
        isDone && styles.done,
        isNow && styles.now,
        isMine && styles.mine,
      )}
      data-heat-row
      data-now={isNow || undefined}
      data-done={isDone || undefined}
    >
      <span class={styles.when}>
        <span class={styles.time}>{formatClockTime(info.scheduledMinutes)}</span>
        {showEstimate && <span class={styles.estimate}>≈ {formatClockTime(estimate)}</span>}
        {showAway && away !== null && away > 0 && <span class={styles.away}>{away} away</span>}
      </span>
      <span class={styles.body}>
        <span class={styles.title}>
          <span class="evno">{heat.eventNumber}</span>
          <span>{info.heatName.baseName}</span>
        </span>
        <span class={cx('row', styles.details)}>
          <span class="round">{roundLabel(info.heatName)}</span>
          {info.heatName.dances && <span class="dances">{info.heatName.dances}</span>}
          {team.ifCalledBack && <span class={styles.ifCalledBack}>If called back</span>}
        </span>
        {dancer
          ? dancersCouple && (
              <span class={cx('muted', styles.partner)}>
                with {partnerName(partnerOf(dancersCouple, dancer))}
                {dancersCouple.number && (
                  <>
                    {' · '}
                    <span class="mono">#{dancersCouple.number}</span>
                  </>
                )}
              </span>
            )
          : hasTeam(team) && <TeamChips team={team} />}
      </span>
    </div>
  );
}

/** A break or section line in a list. */
export function BreakRow({ item }: { item: ScheduleBreak }) {
  const { store } = useApp();
  const competition = store.competition.value;
  const info = competition.items.get(item.id);
  const isNow = info?.index === competition.currentIndex;
  return (
    <div class={cx(styles.break, isNow && styles.now)} data-now={isNow || undefined}>
      <span class="mono">{formatClockTime(info?.scheduledMinutes ?? null)}</span>
      <span>{item.label}</span>
    </div>
  );
}
