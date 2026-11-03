import { useState } from 'preact/hooks';
import { InvalidBackup, readBackup, type TeamBackup } from '../../app/backup';
import { dancerName } from '../../domain/dancers';
import { useApp } from '../context';
import { cx, plural, sessionProblemText } from '../format';
import styles from './SetupView.module.css';

/** The team link for a join code, on whatever address this copy of the app is served from. */
export const joinLink = (code: string) =>
  `${location.origin}${location.pathname}#join=${encodeURIComponent(code)}`;

/** Who this phone is signed in as, and who it belongs to on the team. */
export function AccountCard() {
  const { session, store } = useApp();
  const user = session.user.value;
  const membership = session.membership.value;
  const problem = session.problem.value;
  const [isConfirmingSignOut, setConfirmingSignOut] = useState(false);
  const dancer = store.team.value.dancers.find(
    (candidate) => candidate.id === membership?.dancerId,
  );
  if (!user) return null;

  return (
    <div class="card stack">
      <div class={styles.setting}>
        <span>
          {dancer ? (
            <b>{dancerName(dancer.name)}</b>
          ) : (
            <span class="muted">Not linked to a dancer</span>
          )}
          <br />
          <span class={cx('muted', styles.note)}>
            {user.isAnonymous
              ? 'Joined with the team link on this phone'
              : `Signed in as ${user.email ?? 'a Google account'}`}
            {session.isCaptain.value && ' · Captain'}
          </span>
        </span>
        <button class="btn small" onClick={() => session.actions.changeDancer()}>
          {dancer ? 'Change' : 'Pick my name'}
        </button>
      </div>
      {user.isAnonymous && (
        <div class="row">
          <button class="btn small" onClick={() => void session.actions.linkWithGoogle()}>
            Keep me signed in on any device
          </button>
          <span class={cx('muted', styles.note)}>Links a Google account to this phone's spot.</span>
        </div>
      )}
      {problem && <div class="banner">{sessionProblemText(problem)}</div>}
      {isConfirmingSignOut ? (
        <div class="row">
          <span class="bad">
            {user.isAnonymous ? "You'll need the team link to get back in. Sign out?" : 'Sign out?'}
          </span>
          <button class="btn small danger" onClick={() => void session.actions.signOut()}>
            Sign out
          </button>
          <button class="btn small" onClick={() => setConfirmingSignOut(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div>
          <button class="btn small ghost" onClick={() => setConfirmingSignOut(true)}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/** The link teammates open to join. Captains only. */
export function TeamAccessCard() {
  const { session, view } = useApp();
  const code = session.joinCode.value;
  const [isConfirmingNewLink, setConfirmingNewLink] = useState(false);
  if (!code) return <div class="card muted">Loading the team link…</div>;
  const link = joinLink(code);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      view.showToast('Team link copied.');
    } catch {
      view.showToast('Copy the link from the box above.');
    }
  };

  return (
    <div class="card stack">
      <span class={cx('muted', styles.help)}>
        Send this link to the team. Opening it adds that phone to the team; they pick their name and
        can then move the floor and record callbacks.
      </span>
      <input
        type="text"
        readOnly
        aria-label="Team link"
        value={link}
        onFocus={(event) => event.currentTarget.select()}
      />
      <div class="row">
        <button class="btn primary small" onClick={() => void copy()}>
          Copy link
        </button>
        {isConfirmingNewLink ? (
          <>
            <span class="bad">
              The old link will stop working. Phones that already joined stay.
            </span>
            <button
              class="btn small danger"
              onClick={() => {
                void session.actions.replaceJoinCode();
                setConfirmingNewLink(false);
                view.showToast('New team link made.');
              }}
            >
              Make new link
            </button>
            <button class="btn small" onClick={() => setConfirmingNewLink(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button class="btn small ghost" onClick={() => setConfirmingNewLink(true)}>
            Make a new link
          </button>
        )}
      </div>
    </div>
  );
}

/** Downloading a backup of the team, and restoring one (how data moves into a new team). */
export function BackupCard() {
  const { store, view } = useApp();
  const [pending, setPending] = useState<TeamBackup | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const download = () => {
    const backup = store.actions.exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `heat-sheet-backup-${backup.exportedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const choose = async (file: File | undefined) => {
    setProblem(null);
    setPending(null);
    if (!file) return;
    try {
      setPending(readBackup(JSON.parse(await file.text())));
    } catch (error) {
      setProblem(error instanceof InvalidBackup ? error.message : 'That file isn’t a backup.');
    }
  };

  const active = pending?.competitions.find(
    ({ info }) => info.id === pending.team.activeCompetitionId,
  );

  return (
    <div class="card stack">
      <div class="row">
        <button class="btn small" onClick={download}>
          Download a backup
        </button>
        <span class={cx('muted', styles.note)}>The team and this competition, as one file.</span>
      </div>
      <label class="field" for="backupFile">
        Restore from a backup
        <input
          id="backupFile"
          type="file"
          accept="application/json,.json"
          onChange={(event) => void choose(event.currentTarget.files?.[0])}
        />
      </label>
      {problem && <div class="banner">{problem}</div>}
      {pending && (
        <div class="stack">
          <span>
            Adds {plural(pending.dancers.length, 'dancer')},{' '}
            {plural(pending.partnerships.length, 'partnership')} and{' '}
            {plural(pending.competitions.length, 'competition')}
            {active && (
              <>
                , and makes <b>{active.info.name}</b> the competition everyone sees
              </>
            )}
            . Anything with the same id is replaced.
          </span>
          <div class="row">
            <button
              class="btn small primary"
              onClick={() => {
                store.actions.importBackup(pending);
                setPending(null);
                view.showToast('Backup restored.');
              }}
            >
              Restore
            </button>
            <button class="btn small" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
