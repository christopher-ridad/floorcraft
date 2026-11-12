import { useMemo, useState } from 'preact/hooks';
import type { Preferences } from '../../app/preferences';
import { ON_DECK_MINUTES } from '../../domain/alerts';
import { isOfficialSchedule, PURDUE_CLASSIC } from '../../domain/purdue';
import { DancerPicker } from '../components/DancerPicker';
import { NotificationsCard } from '../components/NotificationsCard';
import { useApp } from '../context';
import { cx, plural } from '../format';
import { AccountCard, BackupCard, NamesInUseCard, TeamAccessCard } from './AccountCards';
import { CouplesEditor } from './CouplesEditor';
import styles from './SetupView.module.css';

export function SetupView() {
  const { session } = useApp();
  return (
    <>
      <h2>This phone</h2>
      <PhoneSettings />
      <h2>Notifications</h2>
      <NotificationsCard />
      <h2>Account</h2>
      <AccountCard />
      {session.isCaptain.value && <CaptainSetup />}
    </>
  );
}

/** Setting up the team and the competition. Only captains see this (and the rules enforce it). */
function CaptainSetup() {
  return (
    <>
      <h2>Team link</h2>
      <TeamAccessCard />
      <h2>Names in use</h2>
      <NamesInUseCard />
      <h2>Sync</h2>
      <SyncStatus />
      <h2>Couples & entries</h2>
      <CouplesEditor />
      <h2>Schedule</h2>
      <OfficialScheduleCard />
      <h2>Backup</h2>
      <BackupCard />
      <h2>Reset</h2>
      <ResetLiveTracking />
    </>
  );
}

type SwitchPreference = 'chime' | 'vibrate' | 'keepScreenAwake';

function PreferenceSwitch({ name, label }: { name: SwitchPreference; label: string }) {
  const { store } = useApp();
  const isOn: Preferences[SwitchPreference] = store.preferences.value[name];
  return (
    <div class={styles.setting}>
      <span>{label}</span>
      <button
        class="btn small"
        aria-pressed={isOn}
        onClick={() => store.actions.updatePreferences({ [name]: !isOn })}
      >
        {isOn ? 'On' : 'Off'}
      </button>
    </div>
  );
}

function PhoneSettings() {
  const { store, view } = useApp();
  return (
    <div class="card">
      <DancerPicker id="iAm" label="I am" emptyOption="Not set" />
      <p class={cx('muted', styles.spaced)}>
        You're told to get on deck when your heat is about {ON_DECK_MINUTES} minutes away, and again
        when you're up next.
      </p>
      <PreferenceSwitch name="chime" label="Chime" />
      <PreferenceSwitch name="vibrate" label="Vibrate (Android)" />
      <PreferenceSwitch name="keepScreenAwake" label="Keep screen awake" />
      <div class="row">
        <button
          class="btn small"
          onClick={() => {
            store.actions.testAlert();
            view.showToast("This is what you'll hear when it's time to get on deck.");
          }}
        >
          Test the alert
        </button>
        <span class={cx('muted', styles.note)}>Alerts sound while this page is open.</span>
      </div>
    </div>
  );
}

function SyncStatus() {
  const mode = useApp().store.syncMode.value;
  return (
    <div class="card">
      {mode === 'shared' && (
        <>
          <b class="ok">Shared with the team.</b>{' '}
          <span class="muted">
            Every change here shows up on everyone's phone within a few seconds.
          </span>
        </>
      )}
      {mode === 'local' && (
        <div class="banner">
          This copy isn't connected to the team's database, so changes stay on this phone only.
        </div>
      )}
      {mode === 'connecting' && 'Connecting…'}
    </div>
  );
}

/** Whether the schedule is the official one, and loading it if not. */
function OfficialScheduleCard() {
  const { store, view } = useApp();
  const [isConfirming, setConfirming] = useState(false);
  const items = store.schedule.value;
  const isOfficial = useMemo(() => isOfficialSchedule(items), [items]);

  const load = () => {
    const { heats, droppedEntries } = store.actions.loadOfficialSchedule();
    setConfirming(false);
    view.showToast(
      droppedEntries
        ? `Official schedule loaded: ${heats} heats. ${plural(droppedEntries, 'entry', 'entries')} for events not on it; see Couples & entries.`
        : `Official schedule loaded: ${heats} heats.`,
    );
  };

  if (isOfficial) {
    return (
      <div class="card">
        <b class="ok">This is the official schedule.</b>{' '}
        <span class="muted">
          If the day changes, fix a heat's time or name from the Schedule tab.
        </span>
      </div>
    );
  }

  return (
    <div class="card stack">
      <span class={cx('muted', styles.help)}>
        {items.length
          ? "This isn't the official schedule: it's an older one, or it has day-of edits."
          : 'No schedule is loaded yet.'}{' '}
        Loading the official {PURDUE_CLASSIC.name} schedule keeps couples' entries and recall marks
        with their events.
      </span>
      {isConfirming ? (
        <div class="row">
          <span class="bad">Replace every line, including any edits, and clear the floor?</span>
          <button class="btn small primary" onClick={load}>
            Load it
          </button>
          <button class="btn small" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div>
          <button class="btn primary" onClick={() => (items.length ? setConfirming(true) : load())}>
            Load the official schedule
          </button>
        </div>
      )}
    </div>
  );
}

function ResetLiveTracking() {
  const { store } = useApp();
  const [isConfirming, setConfirming] = useState(false);
  return (
    <div class="card row">
      {isConfirming ? (
        <>
          <span class="bad">Clear the floor position and all recall marks?</span>
          <button
            class="btn small danger"
            onClick={() => {
              store.actions.resetLiveTracking();
              setConfirming(false);
            }}
          >
            Clear
          </button>
          <button class="btn small" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </>
      ) : (
        <>
          <button class="btn danger" onClick={() => setConfirming(true)}>
            Clear live tracking
          </button>
          <span class={cx('muted', styles.preview)}>Use after a practice run.</span>
        </>
      )}
    </div>
  );
}
