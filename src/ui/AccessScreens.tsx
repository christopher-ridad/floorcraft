import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { dancerName } from '../domain/dancers';
import { useApp } from './context';
import { sessionProblemText } from './format';
import styles from './AccessScreens.module.css';

/** What a phone sees until it's in: signing in, joining, and picking a name. */
export function AccessScreen() {
  const { session } = useApp();
  switch (session.phase.value) {
    case 'signed-out':
      return <Welcome />;
    case 'join-failed':
      return <JoinFailed />;
    case 'not-member':
      return <NotOnTeam />;
    case 'choose-dancer':
      return <ChooseDancer />;
    case 'joining':
      return <Waiting>Joining the team…</Waiting>;
    default:
      return <Waiting>Loading…</Waiting>;
  }
}

function Screen({ children }: { children: ComponentChildren }) {
  const { session } = useApp();
  const problem = session.problem.value;
  return (
    <main class={styles.screen}>
      <div class={styles.panel}>
        <h1 class={styles.brand}>Heat Sheet</h1>
        {children}
        {problem && (
          <div class="banner" role="alert">
            {sessionProblemText(problem)}
          </div>
        )}
      </div>
    </main>
  );
}

function Waiting({ children }: { children: ComponentChildren }) {
  return (
    <Screen>
      <p class={styles.lead} role="status">
        {children}
      </p>
    </Screen>
  );
}

function CaptainSignIn({ label = 'Captain? Sign in with Google' }: { label?: string }) {
  const { session } = useApp();
  return (
    <button class="btn" onClick={() => void session.actions.signInAsCaptain()}>
      {label}
    </button>
  );
}

function Welcome() {
  return (
    <Screen>
      <p class={styles.lead}>
        To join your team, open the link your captain sent you. You'll pick your name, and the app
        will tell you when you're up.
      </p>
      <CaptainSignIn />
    </Screen>
  );
}

function JoinFailed() {
  return (
    <Screen>
      <h2 class={styles.title}>That join link didn't work</h2>
      <p class={styles.lead}>It may be an old link. Ask your captain for the current one.</p>
      <CaptainSignIn />
    </Screen>
  );
}

function NotOnTeam() {
  const { session } = useApp();
  const user = session.user.value;
  return (
    <Screen>
      <h2 class={styles.title}>You're not on the team yet</h2>
      <p class={styles.lead}>
        {user?.email ? `Signed in as ${user.email}. ` : ''}Ask your captain for the team link and
        open it on this phone.
      </p>
      {user && !user.isAnonymous && <CreateTeam />}
      <button class="btn ghost" onClick={() => void session.actions.signOut()}>
        Sign out
      </button>
    </Screen>
  );
}

/** First-time setup: whoever creates the team becomes its captain. */
function CreateTeam() {
  const { session } = useApp();
  const [teamName, setTeamName] = useState('');
  const [competitionName, setCompetitionName] = useState('');
  const [date, setDate] = useState('');
  const [isBusy, setBusy] = useState(false);
  const isComplete = !!(teamName.trim() && competitionName.trim() && date);

  const create = async () => {
    setBusy(true);
    await session.actions.createTeam(teamName, competitionName, date);
    setBusy(false);
  };

  return (
    <details class={`card ${styles.setUp}`}>
      <summary>Setting up the team for the first time?</summary>
      <div class="stack">
        <label class="field" for="teamName">
          Team name
          <input
            id="teamName"
            type="text"
            value={teamName}
            onInput={(event) => setTeamName(event.currentTarget.value)}
          />
        </label>
        <label class="field" for="competitionName">
          First competition
          <input
            id="competitionName"
            type="text"
            placeholder="Purdue Ballroom Classic"
            value={competitionName}
            onInput={(event) => setCompetitionName(event.currentTarget.value)}
          />
        </label>
        <label class="field" for="competitionDate">
          Date
          <input
            id="competitionDate"
            type="date"
            value={date}
            onInput={(event) => setDate(event.currentTarget.value)}
          />
        </label>
        <button class="btn primary" disabled={!isComplete || isBusy} onClick={() => void create()}>
          Create the team
        </button>
        <span class="muted">You'll be its captain. You can add co-captains later.</span>
      </div>
    </details>
  );
}

function ChooseDancer() {
  const { session, store } = useApp();
  const uid = session.user.value?.uid;
  const claims = session.claims.value;
  const dancers = store.team.value.dancers
    .filter((dancer) => dancer.active)
    .sort((a, b) => dancerName(a.name).localeCompare(dancerName(b.name)));

  return (
    <Screen>
      <h2 class={styles.title}>Who are you?</h2>
      <p class={styles.lead}>Pick your name so the app can tell you when you're up.</p>
      {!store.loaded.value.team ? (
        <p class="muted">Loading the team…</p>
      ) : (
        <div class={styles.dancers}>
          {dancers.map((dancer) => {
            const holder = claims[dancer.id];
            const isTaken = !!holder && holder !== uid;
            return (
              <button
                key={dancer.id}
                class={styles.dancer}
                disabled={isTaken}
                onClick={() => void session.actions.chooseDancer(dancer.id)}
              >
                {dancerName(dancer.name)}
                {isTaken && <span>Taken</span>}
                {holder === uid && <span>You</span>}
              </button>
            );
          })}
        </div>
      )}
      <button class="btn ghost" onClick={() => session.actions.skipChoosingDancer()}>
        I'm not dancing
      </button>
    </Screen>
  );
}
