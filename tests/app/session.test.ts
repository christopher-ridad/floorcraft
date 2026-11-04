import { afterEach, describe, expect, it } from 'vitest';
import { AuthFailure, type AuthUser } from '../../src/app/ports';
import type { Preferences } from '../../src/app/preferences';
import { createSession, type Session } from '../../src/app/session';
import { createAppStore } from '../../src/app/store';
import {
  fakeAccess,
  fakeAlertOutput,
  fakeAuth,
  fakePreferences,
  fakeRepository,
  fakeWakeLock,
  settle,
} from './fakes';

const anonymousPhone = (uid: string): AuthUser => ({
  uid,
  isAnonymous: true,
  displayName: null,
  email: null,
});
const captainUser: AuthUser = {
  uid: 'captain',
  isAnonymous: false,
  displayName: 'Casey',
  email: 'casey@example.com',
};

let session: Session | undefined;
afterEach(() => session?.dispose());

interface Options {
  signedIn?: AuthUser | null;
  joinCode?: string | null;
  access?: ReturnType<typeof fakeAccess>;
  preferences?: Partial<Preferences>;
}

function start({
  signedIn = null,
  joinCode = null,
  access = fakeAccess(),
  preferences,
}: Options = {}) {
  const auth = fakeAuth({ signedIn });
  const backend = fakeRepository();
  const store = createAppStore({
    repository: backend.repository,
    preferences: fakePreferences(preferences).store,
    clock: { now: () => 0 },
    alertOutput: fakeAlertOutput().output,
    wakeLock: fakeWakeLock(true).wakeLock,
    createId: (() => {
      let next = 0;
      return () => `new${++next}`;
    })(),
  });
  let joinCodeUsed = 0;
  session = createSession({
    auth: auth.auth,
    access: access.access,
    store,
    joinCode,
    onJoinCodeUsed: () => joinCodeUsed++,
    createJoinCode: () => 'fresh-code',
  });
  session.start();
  return { session, auth, access, store, backend, joinCodeUsed: () => joinCodeUsed };
}

describe('arriving', () => {
  it('asks a signed-out visitor without a link to use one, or sign in as captain', () => {
    const { session } = start();
    expect(session.phase.value).toBe('signed-out');
  });

  it('joins with the team link: signs in, joins, clears the link, then asks who you are', async () => {
    const { session, access, store, joinCodeUsed } = start({ joinCode: 'team-code' });
    await settle();

    expect(session.user.value?.isAnonymous).toBe(true);
    expect(access.state.members.has('phone-1')).toBe(true);
    expect(joinCodeUsed()).toBe(1);
    expect(session.phase.value).toBe('choose-dancer');
    expect(store.loaded.value.team).toBe(true);
  });

  it('says so when a join link no longer works', async () => {
    const { session } = start({ joinCode: 'old-code' });
    await settle();
    expect(session.phase.value).toBe('join-failed');
  });

  it('ignores the link for a phone that already joined', async () => {
    const access = fakeAccess();
    await access.access.join('returning', 'team-code', 'anonymous');
    const { session, joinCodeUsed } = start({
      signedIn: anonymousPhone('returning'),
      joinCode: 'team-code',
      access,
    });

    expect(joinCodeUsed()).toBe(1);
    expect(session.phase.value).toBe('choose-dancer');
  });

  it('joins with a typed-in team code or a pasted link', async () => {
    const { session, access } = start();
    session.actions.joinWithCode('  team-code ');
    await settle();
    expect(access.state.members.has('phone-1')).toBe(true);
    expect(session.phase.value).toBe('choose-dancer');

    const second = start({ signedIn: anonymousPhone('pasted') });
    second.session.actions.joinWithCode('https://example.com/floorcraft/#join=team-code');
    await settle();
    expect(second.access.state.members.has('pasted')).toBe(true);
  });

  it('says so when a typed-in code is wrong', async () => {
    const { session } = start();
    session.actions.joinWithCode('nope');
    await settle();
    expect(session.phase.value).toBe('join-failed');
  });

  it('tells a signed-in user who is not on the team', () => {
    const { session, store } = start({ signedIn: anonymousPhone('stranger') });
    expect(session.phase.value).toBe('not-member');
    expect(store.loaded.value.team).toBe(false);
  });
});

describe('picking a name', () => {
  async function joined(options: Options = {}) {
    const started = start({ joinCode: 'team-code', ...options });
    await settle();
    return started;
  }

  it('links the phone to the dancer and sets alerts for them', async () => {
    const { session, store } = await joined();
    await session.actions.chooseDancer('chris');

    expect(session.membership.value?.dancerId).toBe('chris');
    expect(store.preferences.value.dancer).toBe('Chris');
    expect(session.phase.value).toBe('ready');
  });

  it('refuses a dancer another phone has claimed', async () => {
    const access = fakeAccess();
    await access.access.join('other', 'team-code', 'anonymous');
    await access.access.claimDancer('other', 'chris', null);
    const { session } = await joined({ access });

    expect(session.claims.value).toEqual({ chris: 'other' });
    await session.actions.chooseDancer('chris');
    expect(session.problem.value).toBe('dancer-taken');
    expect(session.phase.value).toBe('choose-dancer');
  });

  it('can be skipped, and changed later', async () => {
    const { session } = await joined();
    session.actions.skipChoosingDancer();
    expect(session.phase.value).toBe('ready');

    session.actions.changeDancer();
    expect(session.phase.value).toBe('choose-dancer');
    await session.actions.chooseDancer('sam');
    expect(session.phase.value).toBe('ready');
  });

  it('remembers on this phone that it was skipped', async () => {
    const { session } = await joined({ preferences: { skipDancerClaim: true } });
    expect(session.phase.value).toBe('ready');
  });

  it('sets alerts for the claimed dancer when this phone has none yet', async () => {
    const access = fakeAccess();
    await access.access.join('returning', 'team-code', 'anonymous');
    await access.access.claimDancer('returning', 'jo', null);
    const { store } = start({ signedIn: anonymousPhone('returning'), access });
    expect(store.preferences.value.dancer).toBe('Jo');
  });
});

describe('captains', () => {
  it('sign in with Google', async () => {
    const access = fakeAccess({ captainUids: ['google-user'] });
    const { session } = start({ access });
    await session.actions.signInAsCaptain();
    await settle();

    expect(session.isCaptain.value).toBe(true);
    expect(session.membership.value).toMatchObject({ uid: 'google-user', provider: 'google' });
    expect(session.joinCode.value).toBe('team-code');
  });

  it('see why Google sign-in failed', async () => {
    const { session, auth } = start();
    auth.control.failSignIn = new AuthFailure('cancelled');
    await session.actions.signInAsCaptain();
    expect(session.problem.value).toBe('sign-in-failed');
  });

  it('create the team and its first competition', async () => {
    const access = fakeAccess({ teamExists: false });
    const { session, backend } = start({ signedIn: captainUser, access });
    expect(session.phase.value).toBe('not-member');

    await session.actions.createTeam('Purdue Ballroom', 'Purdue Ballroom Classic', '2026-11-14');

    expect(access.state.captainUids).toEqual(['captain']);
    expect(session.isCaptain.value).toBe(true);
    expect(session.joinCode.value).toBe('fresh-code');
    // A new team has no earlier competition to archive.
    expect(backend.writes.map(([method]) => method)).toEqual(['saveCompetition', 'updateTeam']);
    expect(backend.writes[0]).toEqual([
      'saveCompetition',
      { id: 'new1', name: 'Purdue Ballroom Classic', date: '2026-11-14', status: 'active' },
    ]);
  });

  it('cannot create a team that already exists', async () => {
    const { session } = start({ signedIn: captainUser });
    await session.actions.createTeam('Mine', 'Comp', '2026-11-14');
    expect(session.problem.value).toBe('team-exists');
    expect(session.phase.value).toBe('not-member');
  });

  it('make a new join link', async () => {
    const access = fakeAccess({ captainUids: ['captain'] });
    const { session } = start({ signedIn: captainUser, access });
    await session.actions.replaceJoinCode();
    expect(session.joinCode.value).toBe('fresh-code');
  });
});

describe('leaving', () => {
  it('shows a removed phone that it is no longer on the team, and clears the data', async () => {
    const { session, access, store } = start({ joinCode: 'team-code' });
    await settle();
    access.removeMember('phone-1');

    expect(session.phase.value).toBe('not-member');
    expect(store.loaded.value.team).toBe(false);
    expect(store.team.value.dancers).toEqual([]);
  });

  it('signs out', async () => {
    const { session, store } = start({ joinCode: 'team-code' });
    await settle();
    await session.actions.signOut();

    expect(session.phase.value).toBe('signed-out');
    expect(store.loaded.value.team).toBe(false);
  });

  it('keeps a member’s identity by linking Google', async () => {
    const { session, access } = start({ joinCode: 'team-code' });
    await settle();
    await session.actions.linkWithGoogle();
    expect(access.state.members.get('phone-1')?.provider).toBe('google');
  });

  it('explains when that Google account is already in use', async () => {
    const { session, auth } = start({ joinCode: 'team-code' });
    await settle();
    auth.control.failSignIn = new AuthFailure('account-in-use');
    await session.actions.linkWithGoogle();
    expect(session.problem.value).toBe('account-in-use');
  });
});
