import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { ALERT_THRESHOLD_CHOICES, type Preferences } from '../../app/preferences';
import { parseEntries } from '../../domain/entries/parseEntries';
import { parseSchedule } from '../../domain/schedule/parseSchedule';
import { DancerPicker } from '../components/DancerPicker';
import { useApp } from '../context';
import { cx, plural } from '../format';
import { CouplesEditor } from './CouplesEditor';
import styles from './SetupView.module.css';

export function SetupView() {
  return (
    <>
      <h2>This phone</h2>
      <PhoneSettings />
      <h2>Sync</h2>
      <SyncStatus />
      <h2>Couples & entries</h2>
      <CouplesEditor />
      <h2>Day-of schedule</h2>
      <ScheduleImport />
      <h2>Partnerships</h2>
      <PartnershipsImport />
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
  const { alertThresholdHeats } = store.preferences.value;
  return (
    <div class="card">
      <DancerPicker id="iAm" label="I am" emptyOption="Not set" />
      <label class={cx('field', styles.spaced)} for="alertThreshold">
        Warn me when my heat is this close
        <select
          id="alertThreshold"
          value={alertThresholdHeats}
          onChange={(event) =>
            store.actions.updatePreferences({
              alertThresholdHeats: Number(event.currentTarget.value),
            })
          }
        >
          {ALERT_THRESHOLD_CHOICES.map((heats) => (
            <option key={heats} value={heats}>
              {plural(heats, 'heat')} away
            </option>
          ))}
        </select>
      </label>
      <PreferenceSwitch name="chime" label="Chime" />
      <PreferenceSwitch name="vibrate" label="Vibrate (Android)" />
      <PreferenceSwitch name="keepScreenAwake" label="Keep screen awake" />
      <div class="row">
        <button
          class="btn small"
          onClick={() => {
            store.actions.testAlert();
            view.showToast("This is what you'll hear when you're on deck.");
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
          This phone is not connected to the shared sheet, so changes stay on this phone only. Sign
          in to Claude from the shared link to sync.
        </div>
      )}
      {mode === 'connecting' && 'Connecting…'}
    </div>
  );
}

interface ImportCardProps {
  id: string;
  label: string;
  help: ComponentChildren;
  placeholder: string;
  button: string;
  /** How many things the text contains, for the live preview. */
  count(text: string): number;
  noun: string;
  /** Imports the text; returns the message to show. */
  submit(text: string): string;
}

/** A paste box that previews what it found and replaces data on submit. */
function ImportCard({
  id,
  label,
  help,
  placeholder,
  button,
  count,
  noun,
  submit,
}: ImportCardProps) {
  const { view } = useApp();
  const [text, setText] = useState('');
  const found = count(text);
  return (
    <div class="card stack">
      <span class={cx('muted', styles.help)}>{help}</span>
      <textarea
        id={id}
        aria-label={label}
        placeholder={placeholder}
        value={text}
        onInput={(event) => setText(event.currentTarget.value)}
      />
      <div class="row">
        <button
          class="btn primary"
          onClick={() => {
            const message = submit(text);
            if (count(text)) setText('');
            view.showToast(message);
          }}
        >
          {button}
        </button>
        <span class={cx('muted', styles.preview)}>{found ? `${found} ${noun} found` : ''}</span>
      </div>
    </div>
  );
}

function ScheduleImport() {
  const { store } = useApp();
  return (
    <ImportCard
      id="scheduleText"
      label="Schedule text"
      help={
        <>
          When the real schedule is posted, copy the heat list (from the PDF or live.o2cm.com) and
          paste it here. One heat per line, like{' '}
          <span class="mono">9:39 AM [4] Newcomer Amer. Waltz 1st Round</span>. Couples are
          re-matched automatically and recall marks are kept.
        </>
      }
      placeholder={
        '8:37 AM [1] Bronze Amer. Smooth 1st Round (WT)\n8:48 AM [2] Bronze Amer. Smooth 1st Round (FV)'
      }
      button="Replace schedule"
      noun="heats"
      count={(text) => parseSchedule(text).filter((item) => item.kind === 'heat').length}
      submit={(text) => {
        const heats = store.actions.importSchedule(text);
        return heats
          ? `Schedule replaced: ${heats} heats.`
          : 'No heats found. Each line needs a time and an event number in brackets.';
      }}
    />
  );
}

function PartnershipsImport() {
  const { store } = useApp();
  return (
    <ImportCard
      id="partnershipsText"
      label="Partnerships text"
      help="Paste rows from the partnerships spreadsheet: lead, follow, level, then events separated by commas. This replaces every couple."
      placeholder={'Chris\tBrooke\tBronze\tBronze I. Standard (WQ), Bronze A. Smooth (WT)'}
      button="Replace couples"
      noun="couples"
      count={(text) => parseEntries(text).length}
      submit={(text) => {
        const couples = store.actions.importEntries(text);
        return couples
          ? `${couples} couples loaded.`
          : 'No couples found. Each line needs a lead, a follow and at least one event.';
      }}
    />
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
          <span class={cx('muted', styles.preview)}>Use before the next competition.</span>
        </>
      )}
    </div>
  );
}
