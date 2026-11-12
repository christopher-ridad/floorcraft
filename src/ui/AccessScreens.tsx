import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { dancerName } from '../domain/dancers';
import { PURDUE_CLASSIC } from '../domain/purdue';
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

/** Joining with a pasted team link: for a copy of the app with no address bar (on the Home Screen). */
function JoinWithLink() {
  const { session } = useApp();
  const [link, setLink] = useState('');
  const [isInvalid, setInvalid] = useState(false);
  return (
    <form
      class="stack"
      onSubmit={(event) => {
        event.preventDefault();
        setInvalid(!session.actions.joinWithLink(link));
      }}
    >
      <label class="field" for="teamLink">
        Or paste the team link here
        <input
          id="teamLink"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://…#join=…"
          value={link}
          onInput={(event) => {
            setLink(event.currentTarget.value);
            setInvalid(false);
          }}
        />
      </label>
      {isInvalid && (
        <span class="bad">That isn't a team link. Copy the whole link and try again.</span>
      )}
      <button class="btn primary" type="submit" disabled={!link.trim()}>
        Join the team
      </button>
    </form>
  );
}

/** The address of the first-time setup page: the app's address followed by `#setup`. */
const isSetupPage = () => location.hash === '#setup';

function Welcome() {
  if (isSetupPage()) return <SetUpTeam />;
  return (
    <Screen>
      <p class={styles.lead}>
        To join your team, open the team link a teammate sent you. You'll pick your name, and the
        app will tell you when you're up.
      </p>
      <JoinWithLink />
    </Screen>
  );
}

function JoinFailed() {
  return (
    <Screen>
      <h2 class={styles.title}>That team link didn't work</h2>
      <p class={styles.lead}>It may be an old link. Ask a teammate for the current one.</p>
      <JoinWithLink />
    </Screen>
  );
}

function NotOnTeam() {
  const { session } = useApp();
  if (isSetupPage()) return <SetUpTeam />;
  return (
    <Screen>
      <h2 class={styles.title}>You're not on the team yet</h2>
      <p class={styles.lead}>Open the team link a teammate sent you, or paste it here.</p>
      <JoinWithLink />
      <button class="btn ghost" onClick={() => void session.actions.signOut()}>
        Start over
      </button>
    </Screen>
  );
}

/**
 * First-time setup, only at the `#setup` address: creates the team, with this phone as the one
 * that can replace the team link. Fails harmlessly if the team already exists.
 */
function SetUpTeam() {
  const { session } = useApp();
  const [teamName, setTeamName] = useState('');
  const [isBusy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    await session.actions.createTeam(teamName);
    setBusy(false);
  };

  return (
    <Screen>
      <h2 class={styles.title}>Set up the team</h2>
      <p class={styles.lead}>
        Only needed once. The {PURDUE_CLASSIC.name} schedule and everyone's dances come with it;
        then share the team link from Setup.
      </p>
      <label class="field" for="teamName">
        Team name
        <input
          id="teamName"
          type="text"
          value={teamName}
          onInput={(event) => setTeamName(event.currentTarget.value)}
        />
      </label>
      <button
        class="btn primary"
        disabled={!teamName.trim() || isBusy}
        onClick={() => void create()}
      >
        Create the team
      </button>
    </Screen>
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
      {session.pushStatus.value === 'install-first' && (
        <div class="banner">
          On iPhone? To get notifications, first tap <b>Share → Add to Home Screen</b>, open Heat
          Sheet from your Home Screen, paste the team link, and pick your name there instead.
        </div>
      )}
      <p class={styles.lead}>Pick your name so the app can tell you when you're up.</p>
      {!store.loaded.value.team ? (
        <p class="muted">Loading the team…</p>
      ) : !dancers.length ? (
        <p class="muted" role="status">
          {session.canSetUp.value
            ? 'Adding the team’s names…'
            : "Your captain hasn't opened the app yet, so the team's names aren't here. Tap “I'm not dancing” for now; you can pick your name later in Setup."}
        </p>
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
