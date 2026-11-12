import { afterEach, describe, expect, it } from 'vitest';
import { AuthFailure, type AuthUser } from '../../src/app/ports';
import type { Preferences } from '../../src/app/preferences';
import { createSession, joinCodeFromLink, type Session } from '../../src/app/session';
import { createAppStore } from '../../src/app/store';
import { isOfficialSchedule, OFFICIAL_DATA_VERSION } from '../../src/domain/purdue';
import type { Schedule } from '../../src/domain/types';
import {
  fakeAccess,
  fakeAlertOutput,
  fakeAuth,
  fakePreferences,
  fakePush,
  fakeRepository,
  fakeWakeLock,
  fixtureBackup,
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
  /** The competition predates the built-in schedule and partnerships. */
  isOutdated?: boolean;
  push?: ReturnType<typeof fakePush>;
}

function start({
  signedIn = null,
  joinCode = null,
  access = fakeAccess(),
  preferences,
  isOutdated = false,
  push,
}: Options = {}) {
  const auth = fakeAuth({ signedIn });
  const seed = fixtureBackup();
  if (isOutdated) {
    for (const competition of seed.competitions) delete competition.info.officialVersion;
  }
  const backend = fakeRepository(seed);
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
    push: push?.push,
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

  it('create the team, with the Purdue Ballroom Classic and its built-in data', async () => {
    const access = fakeAccess({ teamExists: false });
    const { session, backend } = start({ signedIn: captainUser, access });
    expect(session.phase.value).toBe('not-member');

    await session.actions.createTeam('Purdue Ballroom');

    expect(access.state.captainUids).toEqual(['captain']);
    expect(session.isCaptain.value).toBe(true);
    expect(session.joinCode.value).toBe('fresh-code');
    const methods = backend.writes.map(([method]) => method);
    expect(methods).toEqual([
      'saveSchedule',
      'saveDancers',
      'savePartnerships',
      'saveEntries',
      'saveCompetition',
      'updateTeam',
    ]);
    const [, competitionId, schedule] = backend.writes[0] as [string, string, Schedule];
    expect(competitionId).toBe('new1');
    expect(isOfficialSchedule(schedule.items)).toBe(true);
    expect(backend.writes[4]).toEqual([
      'saveCompetition',
      {
        id: 'new1',
        name: 'Purdue Ballroom Classic',
        date: '2026-11-14',
        status: 'active',
        officialVersion: OFFICIAL_DATA_VERSION,
      },
    ]);
  });

  it('bring an older competition up to the built-in data on a captain’s phone, once', async () => {
    const access = fakeAccess({ captainUids: ['captain'] });
    const { store, backend } = start({ signedIn: captainUser, access, isOutdated: true });
    await settle();

    expect(store.activeCompetition.value?.officialVersion).toBe(OFFICIAL_DATA_VERSION);
    expect(isOfficialSchedule(store.schedule.value)).toBe(true);
    expect(store.couples.value).toHaveLength(21);
    const writes = backend.writes.length;
    await settle();
    expect(backend.writes).toHaveLength(writes);
  });

  it('leave an older competition alone on a member’s phone', async () => {
    const access = fakeAccess();
    await access.access.join('phone', 'team-code', 'anonymous');
    const { store, backend } = start({
      signedIn: anonymousPhone('phone'),
      access,
      isOutdated: true,
    });
    await settle();

    expect(store.loaded.value.competition).toBe(true);
    expect(store.activeCompetition.value?.officialVersion).toBeUndefined();
    expect(backend.writes).toEqual([]);
  });

  it('cannot create a team that already exists', async () => {
    const { session } = start({ signedIn: captainUser });
    await session.actions.createTeam('Mine');
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

describe('notifications', () => {
  const memberPhone = async () => {
    const access = fakeAccess();
    await access.access.join('phone', 'team-code', 'anonymous');
    await access.access.claimDancer('phone', 'chris', null);
    return access;
  };

  it('turn on from a tap and save where to send them', async () => {
    const access = await memberPhone();
    const push = fakePush('off');
    const { session } = start({ signedIn: anonymousPhone('phone'), access, push });
    await settle();
    expect(session.pushStatus.value).toBe('off');

    await session.actions.turnOnNotifications();

    expect(session.pushStatus.value).toBe('on');
    expect(access.state.pushTokens.get('phone')).toBe('push-token');
    expect(session.problem.value).toBeNull();
  });

  it('explain how to undo a refusal', async () => {
    const access = await memberPhone();
    const push = fakePush('off');
    push.control.refuse = true;
    const { session } = start({ signedIn: anonymousPhone('phone'), access, push });
    await settle();

    await session.actions.turnOnNotifications();

    expect(session.pushStatus.value).toBe('blocked');
    expect(session.problem.value).toBe('notifications-refused');
    expect(access.state.pushTokens.size).toBe(0);
  });

  it('re-send the token when the app opens, if already allowed', async () => {
    const access = await memberPhone();
    const push = fakePush('on', 'new-token');
    start({ signedIn: anonymousPhone('phone'), access, push });
    await settle();

    expect(push.control.asked).toBe(1);
    expect(access.state.pushTokens.get('phone')).toBe('new-token');
  });

  it('never ask on their own', async () => {
    const access = await memberPhone();
    const push = fakePush('off');
    start({ signedIn: anonymousPhone('phone'), access, push });
    await settle();
    expect(push.control.asked).toBe(0);
  });
});

describe('joining from a pasted team link', () => {
  it.each([
    ['https://example.github.io/floorcraft/#join=team-code', 'team-code'],
    ['  team-code ', 'team-code'],
    ['https://example.github.io/floorcraft/#join=k7mq%2Dx2bn', 'k7mq-x2bn'],
    ['hello there', null],
    ['', null],
  ])('reads the code in %j', (text, code) => {
    expect(joinCodeFromLink(text)).toBe(code);
  });

  it('joins with the code, as opening the link would', async () => {
    const access = fakeAccess();
    const { session, auth } = start({ access });
    expect(session.phase.value).toBe('signed-out');

    expect(session.actions.joinWithLink('https://x.github.io/app/#join=team-code')).toBe(true);
    await settle();

    expect(auth.user?.isAnonymous).toBe(true);
    expect(session.phase.value).toBe('choose-dancer');
  });

  it('refuses text without a code', () => {
    const { session } = start();
    expect(session.actions.joinWithLink('not a link')).toBe(false);
    expect(session.phase.value).toBe('signed-out');
  });
});

describe('freeing up a name', () => {
  it('lets a captain release a dancer, so their other phone can pick them', async () => {
    const access = fakeAccess({ captainUids: ['captain'] });
    await access.access.join('safari', 'team-code', 'anonymous');
    await access.access.claimDancer('safari', 'chris', null);
    const { session } = start({ signedIn: captainUser, access });
    await settle();
    expect(session.claims.value).toEqual({ chris: 'safari' });

    await session.actions.releaseDancer('chris');
    await settle();

    expect(session.claims.value).toEqual({});
    expect(access.state.members.get('safari')?.dancerId).toBeNull();
    await access.access.join('homeScreen', 'team-code', 'anonymous');
    await expect(access.access.claimDancer('homeScreen', 'chris', null)).resolves.toBeUndefined();
  });
});
