import { useApp } from '../context';
import { cx } from '../format';
import styles from './PossibleHeats.module.css';

/** Switch for showing heats a couple only dances if called back. */
export function PossibleHeatsToggle({ label }: { label: string }) {
  const { store } = useApp();
  const { showPossibleHeats } = store.preferences.value;
  return (
    <button
      class={styles.toggle}
      role="switch"
      aria-checked={showPossibleHeats}
      onClick={() => store.actions.updatePreferences({ showPossibleHeats: !showPossibleHeats })}
    >
      <span class={styles.knob} />
      {label}
    </button>
  );
}

/** Explains solid versus hatched heats, with the switch to hide possible ones. */
export function PossibleHeatsLegend() {
  const { showPossibleHeats } = useApp().store.preferences.value;
  return (
    <div class={styles.legend}>
      <span class={styles.keys}>
        <span class={styles.key}>
          <i class={cx(styles.swatch, styles.sure)} />
          Dancing for sure
        </span>
        {showPossibleHeats && (
          <span class={styles.key}>
            <i class={cx(styles.swatch, styles.maybe)} />
            Only if called back
          </span>
        )}
      </span>
      <PossibleHeatsToggle label="Show possible callbacks" />
    </div>
  );
}
