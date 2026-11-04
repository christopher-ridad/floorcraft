/** Composition root: wires Firebase and the browser adapters into the app and renders it. */
// Global styles first, so component CSS modules can override them.
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import { render } from 'preact';
import { createSession } from './app/session';
import { createAppStore } from './app/store';
import { FIREBASE_CONFIG, TEAM_ID, USE_EMULATORS } from './infra/firebase/config';
import { connectFirebase } from './infra/firebase/firebaseApp';
import { firebaseAuthService } from './infra/firebase/firebaseAuthService';
import { firestoreAccessRepository } from './infra/firebase/firestoreAccessRepository';
import { firestoreRepository } from './infra/firebase/firestoreRepository';
import { browserConnectivity } from './infra/platform/browserConnectivity';
import { browserInstallSupport } from './infra/platform/browserInstallSupport';
import { preferencesStorage } from './infra/platform/preferencesStorage';
import { screenWakeLock } from './infra/platform/screenWakeLock';
import { noAppUpdates, serviceWorkerUpdates } from './infra/platform/serviceWorkerUpdates';
import { webAlertOutput } from './infra/platform/webAlertOutput';
import { browserStorage } from './infra/storage/keyValueStorage';
import { App } from './ui/App';
import { createViewState } from './ui/viewState';

/** Team links look like `…/#join=<code>`. */
const JOIN_LINK = /^#join=(.+)$/;

const { auth, firestore } = connectFirebase({
  config: FIREBASE_CONFIG,
  useEmulators: USE_EMULATORS,
});
const storage = browserStorage();
const alertOutput = webAlertOutput();

const store = createAppStore({
  repository: firestoreRepository({
    firestore,
    teamId: TEAM_ID,
    currentUid: () => auth.currentUser?.uid ?? null,
  }),
  preferences: preferencesStorage(storage),
  clock: { now: () => Date.now() },
  alertOutput,
  wakeLock: screenWakeLock(),
  connectivity: browserConnectivity(),
});

const device = {
  install: browserInstallSupport(),
  // The dev server serves source files; only builds get the service worker.
  updates: import.meta.env.DEV ? noAppUpdates : serviceWorkerUpdates(),
};
const view = createViewState(storage);
const clearJoinLink = () => history.replaceState(null, '', location.pathname + location.search);

const linkedCode = JOIN_LINK.exec(location.hash)?.[1];
const joinCode = linkedCode ? decodeURIComponent(linkedCode) : null;
// In iPhone Safari, joining wouldn't carry over to the installed app (it has its own storage),
// so the person installs first and enters the code in the app.
const installFirst = !!joinCode && device.install.platform === 'ios' && !device.install.isInstalled;
if (installFirst) {
  view.installFirstCode.value = joinCode;
  clearJoinLink();
}

const session = createSession({
  auth: firebaseAuthService(auth),
  access: firestoreAccessRepository({ firestore, teamId: TEAM_ID }),
  store,
  joinCode: installFirst ? null : joinCode,
  // The code shouldn't stay in the address bar, where it could be shared by accident.
  onJoinCodeUsed: clearJoinLink,
});

// Browsers only allow sound after a tap, so every tap unlocks alert chimes.
document.addEventListener('click', () => alertOutput.unlock(), { capture: true });

const root = document.getElementById('app');
if (root) render(<App store={store} session={session} view={view} device={device} />, root);
session.start();
