import { useEffect, useRef } from 'preact/hooks';
import { isInCouple } from '../../domain/dancers';
import { NoSchedule } from '../components/EmptyState';
import { BreakRow, HeatRow } from '../components/HeatRow';
import { PossibleHeatsLegend } from '../components/PossibleHeats';
import { useApp } from '../context';
import type { ScheduleFilter } from '../viewState';
import styles from './ScheduleView.module.css';

const FILTERS: readonly [ScheduleFilter, string][] = [
  ['team', 'Team Schedule'],
  ['mine', 'My Schedule'],
  ['all', 'Entire Schedule'],
];

/** Scrolls the heat on the floor (or the first one not yet danced) into the middle of the view. */
function scrollToNow(list: HTMLElement | null) {
  const target =
    list?.querySelector('[data-now]') ?? list?.querySelector('[data-heat-row]:not([data-done])');
  target?.scrollIntoView({ block: 'center' });
}

export function ScheduleView() {
  const { store, view } = useApp();
  const list = useRef<HTMLDivElement>(null);
  const filter = view.scheduleFilter.value;
  const competition = store.competition.value;
  const { dancer } = store.preferences.value;

  // Opening the tab or changing the filter jumps to where the competition is.
  useEffect(() => scrollToNow(list.current), [filter]);

  if (!competition.schedule.length) return <NoSchedule />;

  const header = (
    <div class="row nowrap">
      <div class={styles.filters} role="group" aria-label="Filter heats">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            aria-pressed={filter === value}
            onClick={() => view.setScheduleFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <button class="btn small" onClick={() => scrollToNow(list.current)}>
        Now
      </button>
    </div>
  );

  if (filter === 'mine' && !dancer) {
    return (
      <>
        {header}
        <div class="card muted">Pick your name on the People tab to see My Schedule.</div>
      </>
    );
  }

  const rows = competition.schedule.flatMap((item) => {
    if (item.kind === 'break')
      return filter === 'mine' ? [] : [<BreakRow key={item.id} item={item} />];
    const team = competition.heatTeams.get(item.id);
    const couples = team ? [...team.dancing, ...team.possible] : [];
    if (filter === 'team' && !couples.length) return [];
    if (filter === 'mine' && !couples.some((couple) => isInCouple(couple, dancer))) return [];
    return [
      <HeatRow key={item.id} heat={item} showAway dancer={filter === 'mine' ? dancer : null} />,
    ];
  });

  return (
    <>
      {header}
      <PossibleHeatsLegend />
      <div class="list" ref={list}>
        {rows.length ? rows : <div class="empty">No heats match.</div>}
      </div>
      <p class={`muted ${styles.hint}`}>
        Tap a heat to mark it on the floor, record callbacks, or fix its time.
      </p>
    </>
  );
}
