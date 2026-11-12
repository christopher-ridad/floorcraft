import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { AuthUser } from '../../src/app/ports';
import { connectFirebase, EMULATOR_PORTS } from '../../src/infra/firebase/firebaseApp';
import { firebaseAuthService } from '../../src/infra/firebase/firebaseAuthService';

const PROJECT_ID = 'demo-floorcraft';
const { auth } = connectFirebase({
  config: { apiKey: 'demo-api-key', projectId: PROJECT_ID, appId: 'demo-app-id' },
  emulatorHost: 'localhost',
  offlineCache: false,
  appName: 'auth-service-test',
});
const service = firebaseAuthService(auth);

/** Deletes every account in the Auth emulator. */
const clearAccounts = () =>
  fetch(`http://localhost:${EMULATOR_PORTS.auth}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
    method: 'DELETE',
  });

beforeEach(async () => {
  await service.signOut();
  await clearAccounts();
});
afterAll(() => service.signOut());

/** Resolves with the next user reported after the current one. */
function nextUserChange(): Promise<AuthUser | null> {
  return new Promise((resolve) => {
    let isFirst = true;
    const stop = service.onUserChange((user) => {
      if (isFirst) {
        isFirst = false;
        return;
      }
      stop();
      resolve(user);
    });
  });
}

describe('Firebase auth service', () => {
  it('reports no user when signed out', async () => {
    const user = await new Promise((resolve) => {
      const stop = service.onUserChange((current) => {
        stop();
        resolve(current);
      });
    });
    expect(user).toBeNull();
  });

  it('signs a phone in anonymously, for joining with the team link', async () => {
    const reported = nextUserChange();
    const user = await service.signInAnonymously();

    expect(user).toMatchObject({ isAnonymous: true, displayName: null, email: null });
    expect(user.uid).toBeTruthy();
    expect(await reported).toEqual(user);
  });

  it('signs out', async () => {
    await service.signInAnonymously();
    const reported = nextUserChange();
    await service.signOut();
    expect(await reported).toBeNull();
  });
});
