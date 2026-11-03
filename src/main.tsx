/** Composition root: wires the browser adapters into the store and renders the app. */
// Global styles first, so component CSS modules can override them.
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import { render } from 'preact';
import { createAppStore } from './app/store';
import { preferencesStorage } from './infra/platform/preferencesStorage';
import { screenWakeLock } from './infra/platform/screenWakeLock';
import { webAlertOutput } from './infra/platform/webAlertOutput';
import { browserStorage } from './infra/storage/keyValueStorage';
import { browserSyncConnector } from './infra/sync/browserSyncConnector';
import { App } from './ui/App';
import { createViewState } from './ui/viewState';

const storage = browserStorage();
const alertOutput = webAlertOutput();
const store = createAppStore({
  sync: browserSyncConnector(storage),
  preferences: preferencesStorage(storage),
  clock: { now: () => Date.now() },
  alertOutput,
  wakeLock: screenWakeLock(),
});
const view = createViewState(storage);

// Browsers only allow sound after a tap, so every tap unlocks alert chimes.
document.addEventListener('click', () => alertOutput.unlock(), { capture: true });

const root = document.getElementById('app');
if (root) render(<App store={store} view={view} />, root);
void store.start();
