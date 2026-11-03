import { isInCouple } from '../../domain/dancers';
import type { Heat } from '../../domain/types';
import { EmptyState } from '../components/EmptyState';
import { HeatRow } from '../components/HeatRow';
import { PossibleHeatsLegend } from '../components/PossibleHeats';
import { useApp } from '../context';
import { cx } from '../format';
import styles from './PeopleView.module.css';

export function PeopleView() {
  const { store, view } = useApp();
  const competition = store.competition.value;
  const { dancer: me } = store.preferences.value;

  if (!competition.couples.length) {
    return (
      <EmptyState title="No couples yet" linkToSetup>
        Paste the partnerships list in Setup.
      </EmptyState>
    );
  }

  const names = [...competition.dancers.keys()].sort((a, b) => a.localeCompare(b));
  const viewing = view.viewingDancer.value || me || names[0];

  const chooseMe = (name: string) => {
    store.actions.updatePreferences({ dancer: name });
    view.showToast(`Alerts set for ${name}.`);
  };

  return (
    <>
      <div class={cx('card', 'row', styles.alertsFor)}>
        <div>
          <div class={cx('muted', styles.alertsForLabel)}>Alerts are for</div>
          <b class={styles.alertsForName}>{me || 'No one yet'}</b>
        </div>
        {viewing && viewing !== me && (
          <button class="btn small primary" onClick={() => chooseMe(viewing)}>
            I'm {viewing}
          </button>
        )}
      </div>
      <div class={styles.people}>
        {names.map((name) => {
          const summary = competition.dancers.get(name);
          return (
            <button
              key={name}
              class={styles.person}
              aria-pressed={name === viewing}
              onClick={() => (view.viewingDancer.value = name)}
            >
              <b>
                {name}
                {name === me && ' · you'}
              </b>
              <span>
                {summary?.confirmedHeats ?? 0} for sure
                {!!summary?.possibleHeats && ` · ${summary.possibleHeats} maybe`}
              </span>
            </button>
          );
        })}
      </div>
      {viewing && <DancerDay dancer={viewing} />}
    </>
  );
}

/** Every heat one dancer is in or might be in. */
function DancerDay({ dancer }: { dancer: string }) {
  const { store } = useApp();
  const competition = store.competition.value;
  const heats: { heat: Heat; isPossible: boolean }[] = [];
  for (const item of competition.schedule) {
    if (item.kind !== 'heat') continue;
    const team = competition.heatTeams.get(item.id);
    if (!team) continue;
    if (team.dancing.some((couple) => isInCouple(couple, dancer))) {
      heats.push({ heat: item, isPossible: false });
    } else if (team.possible.some((couple) => isInCouple(couple, dancer))) {
      heats.push({ heat: item, isPossible: true });
    }
  }
  const possibleCount = heats.filter((entry) => entry.isPossible).length;

  return (
    <>
      <h2>
        {dancer}'s day · {heats.length - possibleCount} for sure
        {!!possibleCount && `, ${possibleCount} if called back`}
      </h2>
      {heats.length ? (
        <>
          <PossibleHeatsLegend />
          <div class="list">
            {heats.map(({ heat }) => (
              <HeatRow key={heat.id} heat={heat} showAway dancer={dancer} />
            ))}
          </div>
        </>
      ) : (
        <div class="card muted">No heats found for {dancer}. Check their entries in Setup.</div>
      )}
    </>
  );
}
