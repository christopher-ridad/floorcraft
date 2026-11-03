import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

export const EMULATOR_PORTS = { auth: 9099, firestore: 8080 } as const;

export interface FirebaseServices {
  auth: Auth;
  firestore: Firestore;
}

export interface FirebaseOptionsWithEmulators {
  config: FirebaseOptions;
  /** Use the local emulators instead of the real project. Always on for `demo-` projects. */
  useEmulators?: boolean;
  /** Where the emulators run. Defaults to the page's host, so phones on the same Wi-Fi work. */
  emulatorHost?: string;
  /** Keep data and queued writes on the device, for poor venue Wi-Fi. Off where IndexedDB isn't available. */
  offlineCache?: boolean;
  /** Distinguishes several app instances in one process (tests). */
  appName?: string;
}

export function connectFirebase({
  config,
  useEmulators = config.projectId?.startsWith('demo-') ?? false,
  emulatorHost = globalThis.location?.hostname || 'localhost',
  offlineCache = typeof indexedDB !== 'undefined',
  appName,
}: FirebaseOptionsWithEmulators): FirebaseServices {
  const app = initializeApp(config, appName);
  const auth = getAuth(app);
  const firestore = initializeFirestore(app, {
    localCache: offlineCache
      ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      : memoryLocalCache(),
  });
  if (useEmulators) {
    connectAuthEmulator(auth, `http://${emulatorHost}:${EMULATOR_PORTS.auth}`, {
      disableWarnings: true,
    });
    connectFirestoreEmulator(firestore, emulatorHost, EMULATOR_PORTS.firestore);
  }
  return { auth, firestore };
}
