import type { Competition } from '../../domain/competition';
import { formatClockTime } from '../../domain/clock';
import {
  partnerOf,
  teamUpcomingHeats,
  upcomingHeatsFor,
  type UpcomingHeat,
} from '../../domain/dancers';
import { estimatedMinutes, heatsAway } from '../../domain/pace';
import type { Heat } from '../../domain/types';
import { HeatRow } from '../components/HeatRow';
import { DancerPicker } from '../components/DancerPicker';
import { useApp, useMinuteOfDay } from '../context';
import { cx, partnerName, roundLabel } from '../format';
import styles from './NowView.module.css';

const TEAM_UP_NEXT_COUNT = 8;
/** Within this many minutes of your heat, it's time to be on deck. */
const ON_DECK_MINUTES = 15;

export function NowView() {
  const { store } = useApp();
  return (
    <>
      {store.preferences.value.dancer ? <MyNextHeat /> : <WhoAreYou />}
      <TeamUpNext />
    </>
  );
}

function WhoAreYou() {
  return (
    <div class="card">
      <DancerPicker
        id="whoAreYou"
        label="Who are you? Pick your name to see your next heat here."
        emptyOption="Choose your name"
      />
    </div>
  );
}

const indexOf = (competition: Competition, heat: Heat) =>
  competition.items.get(heat.id)?.index ?? -1;

function heatTitle(competition: Competition, heat: Heat) {
  return competition.items.get(heat.id)?.heatName?.baseName ?? heat.name;
}

function heatRound(competition: Competition, heat: Heat) {
  const heatName = competition.items.get(heat.id)?.heatName;
  return heatName ? roundLabel(heatName) : '';
}

/** The dancer's next heat and how far away it is. Later rounds say they need a callback. */
function MyNextHeat() {
  const { store } = useApp();
  const minuteOfDay = useMinuteOfDay();
  const competition = store.competition.value;
  const { dancer } = store.preferences.value;
  const { currentIndex } = competition;

  const upcoming = upcomingHeatsFor(competition, dancer);
  const isAhead = ({ heat }: UpcomingHeat) => indexOf(competition, heat) > currentIndex;
  const next = upcoming.find(isAhead) ?? (currentIndex >= 0 ? undefined : upcoming[0]);
  const onFloor =
    currentIndex >= 0
      ? upcoming.find(({ heat }) => indexOf(competition, heat) === currentIndex)
      : undefined;
  const title = (heat: Heat) => heatTitle(competition, heat);
  const round = (heat: Heat) => heatRound(competition, heat);
  const partner = (entry: UpcomingHeat) => partnerName(partnerOf(entry.couple, dancer));
  const away = (heat: Heat) => heatsAway(competition, heat.id);
  const estimate = (heat: Heat) => estimatedMinutes(competition, heat.id);
  const ifCalledBack = (entry: UpcomingHeat) => (entry.isPossible ? ' · if called back' : '');

  if (onFloor) {
    return (
      <div class={cx(styles.me, styles.hot)}>
        <div class="muted">
          {dancer}, {onFloor.isPossible ? 'if you were called back, you are' : 'you are'}
        </div>
        <div class={styles.big}>On the floor now</div>
        <div class={styles.what}>
          {title(onFloor.heat)} · {round(onFloor.heat)} with {partner(onFloor)}
        </div>
        {next && (
          <div class={cx('muted', styles.followUp)}>
            After this: {title(next.heat)} in {away(next.heat)} heats
            {ifCalledBack(next)}
          </div>
        )}
      </div>
    );
  }

  if (next) {
    const nextAway = away(next.heat);
    const nextEstimate = estimate(next.heat);
    const isOnDeck =
      nextAway !== null && nextEstimate !== null && nextEstimate - minuteOfDay <= ON_DECK_MINUTES;
    const isHot = nextAway === 1 || isOnDeck;
    const minutesUntil = nextEstimate === null ? 0 : Math.round(nextEstimate - minuteOfDay);
    const headline =
      nextAway === null
        ? `At ${formatClockTime(nextEstimate)}`
        : nextAway === 1
          ? 'Up next'
          : isOnDeck
            ? `On deck · ${nextAway} heats away`
            : `${nextAway} heats away`;
    return (
      <div class={cx(styles.me, isHot && styles.hot)} aria-live="polite">
        <div class="muted">{dancer}, your next heat</div>
        <div class={styles.big}>{headline}</div>
        <div class={styles.what}>
          {title(next.heat)} · {round(next.heat)} with {partner(next)}
          {ifCalledBack(next)}
        </div>
        <div class={cx('muted', styles.meta)}>
          Heat <span class="mono">{next.heat.eventNumber}</span> · about{' '}
          <span class="mono">{formatClockTime(nextEstimate)}</span>
          {nextAway !== null && minutesUntil > 0 && ` · in ~${minutesUntil} min`}
        </div>
      </div>
    );
  }

  return (
    <div class={styles.me}>
      <div class="muted">{dancer}</div>
      <div class={styles.big}>No more heats</div>
      <div class={styles.what}>Nothing left on your card. Cheer on the team.</div>
    </div>
  );
}

function TeamUpNext() {
  const { store } = useApp();
  const heats = teamUpcomingHeats(store.competition.value, TEAM_UP_NEXT_COUNT);
  return (
    <>
      <h2>Team up next</h2>
      {heats.length ? (
        <div class="list">
          {heats.map((heat) => (
            <HeatRow key={heat.id} heat={heat} showAway />
          ))}
        </div>
      ) : (
        <div class="card muted">No more team heats today.</div>
      )}
    </>
  );
}
