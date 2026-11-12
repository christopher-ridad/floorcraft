import { EmptyState } from '../components/EmptyState';
import { useApp } from '../context';
import { cx } from '../format';
import styles from './PeopleView.module.css';

export function PeopleView() {
  const { store, view } = useApp();
  const competition = store.competition.value;
  const { dancer: me } = store.preferences.value;

  if (!competition.couples.length) {
    return <EmptyState title="No couples">The team's partnerships aren't loaded.</EmptyState>;
  }

  const names = [...competition.dancers.keys()].sort((a, b) => a.localeCompare(b));
  const viewing = view.viewingDancer.value || me || names[0];

  const chooseMe = (name: string) => {
    store.updatePreferences({ dancer: name });
    view.showToast(`My Schedule now shows ${name}.`);
  };

  return (
    <>
      <div class={cx('card', 'row', styles.alertsFor)}>
        <div>
          <div class={cx('muted', styles.alertsForLabel)}>My Schedule is for</div>
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
    </>
  );
}
