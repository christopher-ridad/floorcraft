import { FirebaseError } from 'firebase/app';
import {
  getRedirectResult,
  GoogleAuthProvider,
  linkWithPopup,
  linkWithRedirect,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { AuthFailure, type AuthErrorCode, type AuthService, type AuthUser } from '../../app/ports';

/** Popups are blocked in some browsers and in-app web views; those fall back to a full redirect. */
const NEEDS_REDIRECT = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
]);

const toAuthUser = (user: User): AuthUser => ({
  uid: user.uid,
  isAnonymous: user.isAnonymous,
  displayName: user.displayName,
  email: user.email,
});

function toAuthFailure(error: unknown): AuthFailure {
  const code = error instanceof FirebaseError ? error.code : '';
  const known: Record<string, AuthErrorCode> = {
    'auth/popup-closed-by-user': 'cancelled',
    'auth/cancelled-popup-request': 'cancelled',
    'auth/user-cancelled': 'cancelled',
    'auth/credential-already-in-use': 'account-in-use',
    'auth/email-already-in-use': 'account-in-use',
    'auth/network-request-failed': 'network',
  };
  const message = error instanceof Error ? error.message : String(error);
  return new AuthFailure(known[code] ?? 'unknown', message);
}

async function popupOrRedirect(popup: () => Promise<unknown>, redirect: () => Promise<void>) {
  try {
    await popup();
  } catch (error) {
    if (error instanceof FirebaseError && NEEDS_REDIRECT.has(error.code)) await redirect();
    else throw toAuthFailure(error);
  }
}

export function firebaseAuthService(auth: Auth): AuthService {
  const google = new GoogleAuthProvider();
  google.setCustomParameters({ prompt: 'select_account' });
  // Finishes a redirect sign-in after the page reloads; the user then arrives via onUserChange.
  void getRedirectResult(auth).catch(() => undefined);

  return {
    onUserChange: (listener) =>
      onAuthStateChanged(auth, (user) => listener(user ? toAuthUser(user) : null)),

    signInWithGoogle: () =>
      popupOrRedirect(
        () => signInWithPopup(auth, google),
        () => signInWithRedirect(auth, google),
      ),

    async signInAnonymously() {
      try {
        return toAuthUser((await signInAnonymously(auth)).user);
      } catch (error) {
        throw toAuthFailure(error);
      }
    },

    async linkWithGoogle() {
      const user = auth.currentUser;
      if (!user) throw new AuthFailure('unknown', 'Not signed in.');
      await popupOrRedirect(
        () => linkWithPopup(user, google),
        () => linkWithRedirect(user, google),
      );
    },

    signOut: () => signOut(auth),
  };
}
