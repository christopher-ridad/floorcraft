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
import { PossibleHeatsToggle } from '../components/PossibleHeats';
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

/** The dancer's next heat: how far away it is, or what they're waiting on. */
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
  // Only a confirmed heat means you're dancing; a possible one is still waiting on a callback.
  const dancingNow = onFloor && !onFloor.isPossible ? onFloor : undefined;
  const waitingFor = onFloor?.isPossible ? onFloor : next?.isPossible ? next : undefined;
  const title = (heat: Heat) => heatTitle(competition, heat);
  const round = (heat: Heat) => heatRound(competition, heat);
  const partner = (entry: UpcomingHeat) => partnerName(partnerOf(entry.couple, dancer));
  const away = (heat: Heat) => heatsAway(competition, heat.id);
  const estimate = (heat: Heat) => estimatedMinutes(competition, heat.id);

  if (dancingNow) {
    return (
      <div class={cx(styles.me, styles.hot)}>
        <div class="muted">{dancer}, you are</div>
        <div class={styles.big}>On the floor now</div>
        <div class={styles.what}>
          {title(dancingNow.heat)} · {round(dancingNow.heat)} with {partner(dancingNow)}
        </div>
        {next && (
          <div class={cx('muted', styles.followUp)}>
            After this: {title(next.heat)} in {away(next.heat)} heats
            {next.isPossible && ' (if called back)'}
          </div>
        )}
      </div>
    );
  }

  if (waitingFor) {
    const nextSure = upcoming.find((entry) => !entry.isPossible && isAhead(entry));
    const waitingAway = away(waitingFor.heat);
    return (
      <div class={styles.me} aria-live="polite">
        <div class="muted">{dancer}, waiting on a callback</div>
        <div class={styles.big}>{title(waitingFor.heat)}</div>
        <div class={styles.what}>
          {waitingFor === onFloor
            ? `On the floor now, if you were called back: ${round(waitingFor.heat)} with ${partner(waitingFor)}`
            : `If you're called back: ${round(waitingFor.heat)} with ${partner(waitingFor)}, heat `}
          {waitingFor !== onFloor && (
            <>
              <span class="mono">{waitingFor.heat.eventNumber}</span>
              {waitingAway !== null && `, ${waitingAway} heats away`}
            </>
          )}
        </div>
        {nextSure && (
          <div class={cx('muted', styles.followUp)}>
            Next for sure: {title(nextSure.heat)} · {round(nextSure.heat)}
            {away(nextSure.heat) !== null
              ? ` in ${away(nextSure.heat)} heats`
              : ` at ${formatClockTime(estimate(nextSure.heat))}`}
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
  const heats = teamUpcomingHeats(
    store.competition.value,
    TEAM_UP_NEXT_COUNT,
    store.preferences.value.showPossibleHeats,
  );
  return (
    <>
      <div class={cx('row', styles.sectionHeader)}>
        <h2>Team up next</h2>
        <PossibleHeatsToggle label="Possible callbacks" />
      </div>
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
