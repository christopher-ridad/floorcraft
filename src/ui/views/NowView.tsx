import { pendingCallbacks } from '../../domain/callbacks';
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
import { hasTeam, TeamChips } from '../components/CoupleChip';
import { NoSchedule } from '../components/EmptyState';
import { HeatRow } from '../components/HeatRow';
import { PossibleHeatsToggle } from '../components/PossibleHeats';
import { DancerPicker } from '../components/DancerPicker';
import { useApp, useMinuteOfDay } from '../context';
import { coupleName, cx, partnerName, roundLabel } from '../format';
import styles from './NowView.module.css';

const TEAM_UP_NEXT_COUNT = 8;

export function NowView() {
  const { store } = useApp();
  if (!store.schedule.value.length) return <NoSchedule />;
  return (
    <>
      {store.preferences.value.dancer ? <MyNextHeat /> : <WhoAreYou />}
      <OnTheFloor />
      <CallbacksToEnter />
      <TeamUpNext />
    </>
  );
}

function WhoAreYou() {
  return (
    <div class="card">
      <DancerPicker
        id="whoAreYou"
        label="Who are you? Pick your name to get alerts before your heats."
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
  const { dancer, alertThresholdHeats } = store.preferences.value;
  const { currentIndex } = competition;

  const upcoming = upcomingHeatsFor(competition, dancer);
  const isAhead = ({ heat }: UpcomingHeat) => indexOf(competition, heat) > currentIndex;
  const next = upcoming.find(isAhead) ?? (currentIndex >= 0 ? undefined : upcoming[0]);
  const dancingNow =
    currentIndex >= 0
      ? upcoming.find(({ heat }) => indexOf(competition, heat) === currentIndex)
      : undefined;
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

  if (next?.isPossible) {
    const nextSure = upcoming.find((entry) => !entry.isPossible && isAhead(entry));
    const nextAway = away(next.heat);
    return (
      <div class={styles.me} aria-live="polite">
        <div class="muted">{dancer}, waiting on a callback</div>
        <div class={styles.big}>{title(next.heat)}</div>
        <div class={styles.what}>
          If you're called back: {round(next.heat)} with {partner(next)}, heat{' '}
          <span class="mono">{next.heat.eventNumber}</span>
          {nextAway !== null && `, ${nextAway} heats away`}
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
    const isHot = nextAway !== null && nextAway <= alertThresholdHeats;
    const minutesUntil = nextEstimate === null ? 0 : Math.round(nextEstimate - minuteOfDay);
    const headline =
      nextAway === null
        ? `At ${formatClockTime(nextEstimate)}`
        : nextAway === 1
          ? 'On deck'
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

/** What's on the floor, and the buttons that move it. */
function OnTheFloor() {
  const { store } = useApp();
  const competition = store.competition.value;
  const current = competition.schedule[competition.currentIndex];

  if (!current) {
    return (
      <section class={cx(styles.floor, 'lane-other')}>
        <div class={styles.label}>Competition not started</div>
        <div class={styles.name}>Times below are the posted schedule</div>
        <div class="muted">
          When the first heat is called, tap below. Each tap after that moves everyone's estimates.
        </div>
        <div class={cx(styles.controls, styles.single)}>
          <button class="btn primary" onClick={() => store.actions.advanceFloor()}>
            First heat is on the floor
          </button>
        </div>
      </section>
    );
  }

  const info = competition.items.get(current.id);
  const team = competition.heatTeams.get(current.id);
  return (
    <section class={cx(styles.floor, `lane-${info?.heatName?.style ?? 'other'}`)}>
      <div class={styles.label}>
        <span class={styles.dot} />
        On the floor
        {current.kind === 'heat' && (
          <>
            {' '}
            · Heat <span class="mono">{current.eventNumber}</span>
          </>
        )}
      </div>
      <div class={styles.name}>
        {current.kind === 'heat' ? heatTitle(competition, current) : current.label}
      </div>
      {current.kind === 'heat' && info?.heatName && (
        <div class={cx('row', styles.floorDetails)}>
          <span class="round">{roundLabel(info.heatName)}</span>
          {info.heatName.dances && <span class="dances">{info.heatName.dances}</span>}
          <span class={cx('muted', styles.scheduled)}>
            scheduled {formatClockTime(info.scheduledMinutes)}
          </span>
        </div>
      )}
      {team && hasTeam(team) ? (
        <div class={styles.floorChips}>
          <TeamChips team={team} />
        </div>
      ) : (
        current.kind === 'heat' && (
          <div class={cx('muted', styles.nobody)}>No one from the team in this heat.</div>
        )
      )}
      <div class={styles.controls}>
        <button
          class="btn"
          aria-label="Previous heat"
          onClick={() => store.actions.moveFloorBack()}
        >
          Back
        </button>
        <button class="btn primary" onClick={() => store.actions.advanceFloor()}>
          Next heat is up
        </button>
      </div>
    </section>
  );
}

/** Rounds the team has danced whose callback result hasn't been entered. */
function CallbacksToEnter() {
  const { store, view } = useApp();
  const competition = store.competition.value;
  const pending = pendingCallbacks(competition);
  if (!pending.length) return null;

  return (
    <>
      <h2>Callbacks to enter · {pending.length}</h2>
      <div class="card">
        {pending.map((callback) => {
          const record = (reachedRound: typeof callback.reachedRound, eliminated: boolean) => {
            store.actions.recordCallback({
              coupleId: callback.couple.id,
              eventNumber: callback.eventNumber,
              reachedRound,
              eliminated,
            });
            view.showToast(eliminated ? 'Marked not called back.' : 'Callback saved.');
          };
          return (
            <div class={styles.callback} key={`${callback.couple.id}_${callback.eventNumber}`}>
              <div class={styles.question}>
                <b>{coupleName(callback.couple)}</b> · {heatTitle(competition, callback.dancedHeat)}
                <br />
                <span class="muted">
                  Danced the {heatRound(competition, callback.dancedHeat)}. Called back to the{' '}
                  {heatRound(competition, callback.nextHeat)}? (heat at{' '}
                  {formatClockTime(estimatedMinutes(competition, callback.nextHeat.id))})
                </span>
              </div>
              <div class={styles.answers}>
                <button class="btn small yes" onClick={() => record(callback.nextRound, false)}>
                  Called back
                </button>
                <button class="btn small no" onClick={() => record(callback.reachedRound, true)}>
                  Not called back
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
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
