import { FirebaseError } from 'firebase/app';
import {
  onAuthStateChanged,
  signInAnonymously,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { AuthFailure, type AuthService, type AuthUser } from '../../app/ports';

const toAuthUser = (user: User): AuthUser => ({
  uid: user.uid,
  isAnonymous: user.isAnonymous,
  displayName: user.displayName,
  email: user.email,
});

function toAuthFailure(error: unknown): AuthFailure {
  const code = error instanceof FirebaseError ? error.code : '';
  const message = error instanceof Error ? error.message : String(error);
  return new AuthFailure(code === 'auth/network-request-failed' ? 'network' : 'unknown', message);
}

/** Phones sign in without an account; the team link is what lets them in. */
export function firebaseAuthService(auth: Auth): AuthService {
  return {
    onUserChange: (listener) =>
      onAuthStateChanged(auth, (user) => listener(user ? toAuthUser(user) : null)),

    async signInAnonymously() {
      try {
        return toAuthUser((await signInAnonymously(auth)).user);
      } catch (error) {
        throw toAuthFailure(error);
      }
    },

    signOut: () => signOut(auth),
  };
}
