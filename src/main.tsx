/** Entry point: wires browser storage and the clock into the app and renders it. */
// Global styles first, so component CSS modules can override them.
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import { render } from 'preact';
import { createAppStore } from './app/store';
import { preferencesStorage } from './infra/platform/preferencesStorage';
import { browserStorage } from './infra/storage/keyValueStorage';
import { App } from './ui/App';
import { createViewState } from './ui/viewState';

const storage = browserStorage();
const store = createAppStore({
  preferences: preferencesStorage(storage),
  clock: { now: () => Date.now() },
});
const view = createViewState(storage);

const root = document.getElementById('app');
if (root) render(<App store={store} view={view} />, root);
store.start();
// Coming back to the page (e.g. unlocking the phone) catches up right away.
document.addEventListener('visibilitychange', () => store.refresh());
