import { useEffect, useState } from 'preact/hooks';
import { callbackKey } from '../../domain/callbacks';
import { formatClockTime } from '../../domain/clock';
import type { HeatTeam } from '../../domain/competition';
import { estimatedMinutes } from '../../domain/pace';
import { previousRound } from '../../domain/rounds';
import type { Heat, Round, ScheduleItem } from '../../domain/types';
import { useApp } from '../context';
import { cx, roundLabel } from '../format';
import { CoupleChip } from './CoupleChip';
import styles from './HeatSheet.module.css';

/** The bottom sheet for the schedule item the user tapped. */
export function HeatSheet() {
  const { store, view } = useApp();
  const itemId = view.openItemId.value;
  const item = itemId
    ? store.schedule.value.find((candidate) => candidate.id === itemId)
    : undefined;

  // Close the sheet if its item is deleted (here or on another phone).
  useEffect(() => {
    if (itemId && !item) view.closeItem();
  }, [itemId, item, view]);

  useEffect(() => {
    if (!item) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') view.closeItem();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [item, view]);

  if (!item) return null;
  return (
    <div
      class={styles.scrim}
      onClick={(event) => {
        if (event.target === event.currentTarget) view.closeItem();
      }}
    >
      <div class={styles.sheet} role="dialog" aria-modal="true" aria-label="Heat details">
        <SheetContent key={item.id} item={item} />
      </div>
    </div>
  );
}

function SheetContent({ item }: { item: ScheduleItem }) {
  const { store, view } = useApp();
  const competition = store.competition.value;
  const info = competition.items.get(item.id);
  const team = competition.heatTeams.get(item.id);
  const isNow = info?.index === competition.currentIndex;
  const isAhead = competition.currentIndex >= 0 && (info?.index ?? -1) > competition.currentIndex;

  return (
    <>
      <div class={styles.grab} />
      <div>
        <div class={cx('row', styles.meta)}>
          {item.kind === 'heat' && info?.heatName && (
            <>
              <span class={cx('evno', `lane-${info.heatName.style}`)}>{item.eventNumber}</span>
              <span class="round">{roundLabel(info.heatName)}</span>
            </>
          )}
          <span class="mono muted">
            {formatClockTime(info?.scheduledMinutes ?? null)}
            {isAhead && ` · est ${formatClockTime(estimatedMinutes(competition, item.id))}`}
          </span>
        </div>
        <h3 class={styles.title}>
          {item.kind === 'heat' ? (info?.heatName?.baseName ?? item.name) : item.label}
        </h3>
      </div>
      <button
        class="btn primary"
        disabled={isNow}
        onClick={() => {
          store.actions.putOnFloor(item.id);
          view.closeItem();
        }}
      >
        {isNow ? 'On the floor now' : 'This heat is on the floor now'}
      </button>
      {item.kind === 'heat' && team && <TeamCallbacks heat={item} team={team} />}
      <FixThisLine item={item} />
      <button class="btn ghost" onClick={() => view.closeItem()}>
        Close
      </button>
    </>
  );
}

/** Each team couple in the heat, with buttons to record or undo their callback. */
function TeamCallbacks({ heat, team }: { heat: Heat; team: HeatTeam }) {
  const { store, view } = useApp();
  const competition = store.competition.value;
  const heatName = competition.items.get(heat.id)?.heatName;
  const couples = [
    ...team.dancing.map((couple) => ({ couple, status: 'dancing' as const })),
    ...team.possible.map((couple) => ({ couple, status: 'possible' as const })),
    ...team.eliminated.map((couple) => ({ couple, status: 'eliminated' as const })),
  ];
  if (!heatName || !couples.length) return null;

  const isFirstRound = heatName.round === team.firstRound;
  const earlierRound = previousRound(competition.rounds, heat.eventNumber, heatName.round);
  const record = (coupleId: string, reachedRound: Round, eliminated: boolean) => {
    store.actions.recordCallback({
      coupleId,
      eventNumber: heat.eventNumber,
      reachedRound,
      eliminated,
    });
    view.showToast(eliminated ? 'Marked not called back.' : 'Callback saved.');
  };

  return (
    <div>
      <h2 class={styles.sectionTitle}>Team in this event</h2>
      <div>
        {couples.map(({ couple, status }) => {
          const mark = competition.live.callbacks[callbackKey(couple.id, heat.eventNumber)];
          let actions;
          if (status === 'dancing' && isFirstRound) {
            actions = (
              <span class="muted tag">
                {heatName.isSingleRound ? 'Single round' : 'Dances this round'}
              </span>
            );
          } else if (status === 'dancing') {
            actions = (
              <span class={cx('row', styles.actions)}>
                <span class="tag ok">Called back</span>
                <button
                  class="btn small ghost"
                  onClick={() => record(couple.id, earlierRound, false)}
                >
                  Undo
                </button>
              </span>
            );
          } else if (status === 'eliminated') {
            actions = (
              <span class={cx('row', styles.actions)}>
                <span class="tag muted">Not called back</span>
                <button
                  class="btn small ghost"
                  onClick={() => record(couple.id, mark?.reachedRound ?? earlierRound, false)}
                >
                  Undo
                </button>
              </span>
            );
          } else {
            actions = (
              <span class={cx('row', styles.actions)}>
                <button
                  class="btn small yes"
                  onClick={() => record(couple.id, heatName.round, false)}
                >
                  Called back
                </button>
                <button class="btn small no" onClick={() => record(couple.id, earlierRound, true)}>
                  Not called
                </button>
              </span>
            );
          }
          return (
            <div class={styles.couple} key={couple.id}>
              <CoupleChip couple={couple} status={status} highlightMine={false} />
              {actions}
            </div>
          );
        })}
      </div>
      {!isFirstRound && (
        <p class={cx('muted', styles.hint)}>
          Everyone dances the first round. For this round, mark who got a callback. Dashed names are
          still waiting.
        </p>
      )}
    </div>
  );
}

/** Edit a schedule line's time and text, add a heat after it, or delete it. */
function FixThisLine({ item }: { item: ScheduleItem }) {
  const { store, view } = useApp();
  const [time, setTime] = useState(item.scheduledTime);
  const [text, setText] = useState(
    item.kind === 'heat' ? `[${item.eventNumber}] ${item.name}` : item.label,
  );
  const [isConfirmingDelete, setConfirmingDelete] = useState(false);

  const save = () => {
    const result = store.actions.editScheduleItem(item.id, time, text);
    view.showToast(result === 'invalid-time' ? 'Write the time like 9:39 AM.' : 'Saved.');
  };
  const insertAfter = () => {
    const newId = store.actions.insertHeatAfter(item.id);
    if (!newId) return;
    view.openItem(newId);
    view.showToast('Heat added. Edit its time and name.');
  };

  return (
    <div class={styles.section}>
      <h2>Fix this line</h2>
      <div class="row nowrap">
        <input
          type="text"
          class={styles.time}
          aria-label="Time"
          value={time}
          onInput={(event) => setTime(event.currentTarget.value)}
        />
        <input
          type="text"
          aria-label="Heat"
          value={text}
          onInput={(event) => setText(event.currentTarget.value)}
        />
      </div>
      <div class="row">
        <button class="btn" onClick={save}>
          Save
        </button>
        <button class="btn" onClick={insertAfter}>
          Add a heat after
        </button>
        {isConfirmingDelete ? (
          <button class="btn danger" onClick={() => store.actions.deleteScheduleItem(item.id)}>
            Confirm delete
          </button>
        ) : (
          <button class="btn ghost danger" onClick={() => setConfirmingDelete(true)}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
