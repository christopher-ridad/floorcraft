import type { FirebaseOptions } from 'firebase/app';

/**
 * The team's Firebase project. This config identifies the project; it is not a secret and is
 * meant to ship in the page. Access is controlled by firestore.rules.
 */
export const PRODUCTION_CONFIG: FirebaseOptions = {
  apiKey: 'AIzaSyDn5cgIUYd_XlnoppGmKBROK8SIkYw3txI',
  authDomain: 'floorcraft-4d4e9.firebaseapp.com',
  projectId: 'floorcraft-4d4e9',
  storageBucket: 'floorcraft-4d4e9.firebasestorage.app',
  messagingSenderId: '30746197302',
  appId: '1:30746197302:web:b5f5b56064fc472f9c8797',
};

/** A `demo-` project, which only exists in the local emulators (`npm run emulators`). */
export const EMULATOR_CONFIG: FirebaseOptions = {
  apiKey: 'demo-api-key',
  authDomain: 'demo-floorcraft.firebaseapp.com',
  projectId: 'demo-floorcraft',
  appId: 'demo-app-id',
};

/**
 * Development (`npm run dev`) and test builds use the emulators; set by `.env.development`.
 * Production builds use the real project.
 */
export const USE_EMULATORS = import.meta.env.VITE_FIREBASE_EMULATORS === 'true';

export const FIREBASE_CONFIG = USE_EMULATORS ? EMULATOR_CONFIG : PRODUCTION_CONFIG;

/** The one team this deployment serves. */
export const TEAM_ID = 'purdue';
