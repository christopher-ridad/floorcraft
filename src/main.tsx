/** Composition root: wires the browser adapters into the store and renders the app. */
// Global styles first, so component CSS modules can override them.
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import { render } from 'preact';
import { BACKUP_FORMAT, BACKUP_VERSION } from './app/backup';
import { createAppStore } from './app/store';
import { localRepository } from './infra/local/localRepository';
import { preferencesStorage } from './infra/platform/preferencesStorage';
import { screenWakeLock } from './infra/platform/screenWakeLock';
import { webAlertOutput } from './infra/platform/webAlertOutput';
import { browserStorage } from './infra/storage/keyValueStorage';
import { App } from './ui/App';
import { createViewState } from './ui/viewState';

const storage = browserStorage();
// This phone only, until sign-in and Firebase are wired in (milestone 3).
const repository = localRepository(storage, {
  seed: {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date(0).toISOString(),
    team: { name: 'Purdue Ballroom', activeCompetitionId: 'purdue-classic-2026' },
    dancers: [],
    partnerships: [],
    competitions: [
      {
        info: {
          id: 'purdue-classic-2026',
          name: 'Purdue Ballroom Classic',
          date: '2026-11-14',
          status: 'active',
        },
        schedule: { items: [], events: [] },
        entries: {},
        floor: { currentItemId: null, currentSetAt: null },
        callbacks: {},
      },
    ],
  },
});
const alertOutput = webAlertOutput();
const store = createAppStore({
  repository,
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
store.start();
