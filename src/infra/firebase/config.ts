/**
 * The Firebase project's web config. It identifies the project; it is not a secret and is meant
 * to ship in the page. Access is controlled by firestore.rules.
 *
 * Until the real project exists this is a `demo-` project, which only works with the local
 * emulators (`npm run emulators`).
 */
export const FIREBASE_CONFIG = {
  apiKey: 'demo-api-key',
  authDomain: 'demo-floorcraft.firebaseapp.com',
  projectId: 'demo-floorcraft',
  appId: 'demo-app-id',
};

/** The one team this deployment serves. */
export const TEAM_ID = 'purdue';
