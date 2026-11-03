/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'true' to use the local Firebase emulators instead of the real project. */
  readonly VITE_FIREBASE_EMULATORS?: string;
}
