/**
 * Firestore security rules, tested against the emulator. Run with `npm run test:emulator`, which
 * starts the emulators around the run.
 */
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const TEAM = 'teams/purdue';
const ACTIVE = `${TEAM}/competitions/classic`;
const ARCHIVED = `${TEAM}/competitions/spring`;
const JOIN_CODE = 'tango-42';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-floorcraft',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(() => env?.cleanup());

/** A team with a captain, two members (one linked to Chris), and an active and archived competition. */
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const seed: [string, object][] = [
      [TEAM, { name: 'Purdue', captainUids: ['captain'], activeCompetitionId: 'classic' }],
      [`${TEAM}/private/join`, { code: JOIN_CODE }],
      [`${TEAM}/members/captain`, { dancerId: null, provider: 'google', joinedAt: 1 }],
      [
        `${TEAM}/members/chrisPhone`,
        { dancerId: 'chris', provider: 'anonymous', joinedAt: 1, joinCode: JOIN_CODE },
      ],
      [
        `${TEAM}/members/samPhone`,
        { dancerId: null, provider: 'anonymous', joinedAt: 1, joinCode: JOIN_CODE },
      ],
      [`${TEAM}/claims/chris`, { uid: 'chrisPhone' }],
      [`${TEAM}/dancers/chris`, { name: 'Chris', active: true }],
      [`${TEAM}/dancers/sam`, { name: 'Sam', active: true }],
      [`${TEAM}/partnerships/chris-brooke`, { leadId: 'chris', followId: 'brooke', active: true }],
      [ACTIVE, { name: 'Purdue Ballroom Classic', date: '2026-11-14', status: 'active' }],
      [`${ACTIVE}/schedule/current`, { items: [], events: {} }],
      [`${ACTIVE}/live/floor`, { currentItemId: null, currentSetAt: null, updatedBy: 'captain' }],
      [ARCHIVED, { name: 'Spring Classic', date: '2026-04-11', status: 'archived' }],
    ];
    for (const [path, data] of seed) await setDoc(doc(db, path), data);
  });
});

const google = (uid: string) =>
  env.authenticatedContext(uid, { firebase: { sign_in_provider: 'google.com' } }).firestore();
const anonymous = (uid: string) =>
  env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const captain = () => google('captain');
const chrisPhone = () => anonymous('chrisPhone');
const samPhone = () => anonymous('samPhone');
const stranger = () => anonymous('stranger');
const signedOut = () => env.unauthenticatedContext().firestore();
type Db = ReturnType<RulesTestContext['firestore']>;

const floor = (by: string, competition = ACTIVE) => ({
  path: `${competition}/live/floor`,
  data: { currentItemId: 'h3', currentSetAt: 1, updatedBy: by, updatedAt: serverTimestamp() },
});
const callback = (by: string, competition = ACTIVE) => ({
  path: `${competition}/callbacks/chris-brooke_e1`,
  data: { reachedRound: 4, eliminated: false, updatedBy: by, updatedAt: serverTimestamp() },
});
const write = (db: Db, { path, data }: { path: string; data: object }) =>
  setDoc(doc(db, path), data);

describe('reading', () => {
  it('lets captains and members read team data', async () => {
    await assertSucceeds(getDoc(doc(captain(), TEAM)));
    await assertSucceeds(getDoc(doc(samPhone(), `${TEAM}/dancers/chris`)));
    await assertSucceeds(getDoc(doc(chrisPhone(), `${ACTIVE}/schedule/current`)));
  });

  it('hides everything from anyone who has not joined', async () => {
    await assertFails(getDoc(doc(stranger(), TEAM)));
    await assertFails(getDoc(doc(stranger(), `${TEAM}/dancers/chris`)));
    await assertFails(getDoc(doc(signedOut(), `${ACTIVE}/schedule/current`)));
  });

  it('shares the join code with everyone on the team, and no one else', async () => {
    await assertSucceeds(getDoc(doc(captain(), `${TEAM}/private/join`)));
    await assertSucceeds(getDoc(doc(samPhone(), `${TEAM}/private/join`)));
    await assertFails(getDoc(doc(anonymous('stranger'), `${TEAM}/private/join`)));
  });
});

describe('creating the team', () => {
  it('lets a Google account create a new team as its only captain', async () => {
    await assertSucceeds(
      setDoc(doc(google('newCaptain'), 'teams/new'), { name: 'New', captainUids: ['newCaptain'] }),
    );
  });

  it('lets a phone without an account create it, but not list someone else', async () => {
    await assertSucceeds(
      setDoc(doc(anonymous('anon'), 'teams/new'), { name: 'New', captainUids: ['anon'] }),
    );
    await assertFails(
      setDoc(doc(google('newCaptain'), 'teams/new'), { name: 'New', captainUids: ['someoneElse'] }),
    );
  });

  it('never lets anyone take over an existing team', async () => {
    await assertFails(
      setDoc(doc(google('intruder'), TEAM), { name: 'Mine', captainUids: ['intruder'] }),
    );
  });
});

describe('captains', () => {
  it('edit the team, roster and competitions', async () => {
    await assertSucceeds(updateDoc(doc(captain(), TEAM), { name: 'Purdue Ballroom' }));
    await assertSucceeds(
      setDoc(doc(captain(), `${TEAM}/dancers/jo`), { name: 'Jo', active: true }),
    );
    await assertSucceeds(
      setDoc(doc(captain(), `${ACTIVE}/schedule/current`), { items: [], events: {} }),
    );
    await assertSucceeds(
      setDoc(doc(captain(), `${ACTIVE}/entries/chris-brooke`), { eventIds: ['e1'] }),
    );
  });

  it('add a co-captain but never remove the last captain', async () => {
    await assertSucceeds(updateDoc(doc(captain(), TEAM), { captainUids: ['captain', 'samPhone'] }));
    await assertFails(updateDoc(doc(captain(), TEAM), { captainUids: [] }));
  });

  it('remove a phone from the team', async () => {
    await assertSucceeds(deleteDoc(doc(captain(), `${TEAM}/members/samPhone`)));
  });

  it('add themselves as a member without a join code', async () => {
    await env.withSecurityRulesDisabled((context) =>
      deleteDoc(doc(context.firestore(), `${TEAM}/members/captain`)),
    );
    await assertSucceeds(
      setDoc(doc(captain(), `${TEAM}/members/captain`), {
        dancerId: null,
        provider: 'google',
        joinedAt: 2,
      }),
    );
  });
});

describe('members', () => {
  it('can change setup, since the team link is the only key', async () => {
    await assertSucceeds(updateDoc(doc(samPhone(), TEAM), { name: 'Purdue Ballroom' }));
    await assertSucceeds(
      setDoc(doc(samPhone(), `${TEAM}/dancers/sam`), { name: 'Samuel', active: true }),
    );
    await assertSucceeds(setDoc(doc(samPhone(), `${ACTIVE}/schedule/current`), { items: [] }));
    await assertSucceeds(
      setDoc(doc(samPhone(), `${ACTIVE}/entries/chris-brooke`), { eventIds: [] }),
    );
  });

  it('cannot replace the join code or change who the captains are', async () => {
    await assertFails(setDoc(doc(samPhone(), `${TEAM}/private/join`), { code: 'mine' }));
    await assertFails(updateDoc(doc(samPhone(), TEAM), { captainUids: ['samPhone'] }));
  });

  it('keeps everything from phones that never joined', async () => {
    const stranger = anonymous('stranger');
    await assertFails(updateDoc(doc(stranger, TEAM), { name: 'Hacked' }));
    await assertFails(setDoc(doc(stranger, `${ACTIVE}/schedule/current`), { items: [] }));
    await assertFails(deleteDoc(doc(stranger, `${TEAM}/claims/chris`)));
  });

  it('cannot make themselves captain', async () => {
    await assertFails(updateDoc(doc(samPhone(), TEAM), { captainUids: ['captain', 'samPhone'] }));
  });

  it('cannot remove other phones', async () => {
    await assertFails(deleteDoc(doc(samPhone(), `${TEAM}/members/chrisPhone`)));
  });
});

describe('joining', () => {
  const membership = (code: string) => ({
    dancerId: null,
    provider: 'anonymous',
    joinedAt: 2,
    joinCode: code,
  });

  it('works with the current join code', async () => {
    await assertSucceeds(
      setDoc(doc(stranger(), `${TEAM}/members/stranger`), membership(JOIN_CODE)),
    );
    await assertSucceeds(getDoc(doc(stranger(), TEAM)));
  });

  it('fails with a wrong code, for someone else, or already linked to a dancer', async () => {
    await assertFails(setDoc(doc(stranger(), `${TEAM}/members/stranger`), membership('guess')));
    await assertFails(setDoc(doc(stranger(), `${TEAM}/members/other`), membership(JOIN_CODE)));
    await assertFails(
      setDoc(doc(stranger(), `${TEAM}/members/stranger`), {
        ...membership(JOIN_CODE),
        dancerId: 'chris',
      }),
    );
  });

  it('fails while signed out', async () => {
    await assertFails(setDoc(doc(signedOut(), `${TEAM}/members/x`), membership(JOIN_CODE)));
  });
});

describe('claiming a name', () => {
  const claimAndLink = (db: Db, uid: string, dancerId: string) => {
    const batch = writeBatch(db);
    batch.set(doc(db, `${TEAM}/claims/${dancerId}`), { uid });
    batch.update(doc(db, `${TEAM}/members/${uid}`), { dancerId });
    return batch.commit();
  };

  it('links a phone to an unclaimed dancer', async () => {
    await assertSucceeds(claimAndLink(samPhone(), 'samPhone', 'sam'));
  });

  it('refuses a dancer someone else has claimed', async () => {
    await assertFails(claimAndLink(samPhone(), 'samPhone', 'chris'));
  });

  it('refuses linking to a dancer without holding the claim', async () => {
    await assertFails(updateDoc(doc(samPhone(), `${TEAM}/members/samPhone`), { dancerId: 'sam' }));
  });

  it('refuses claims for dancers who are not on the roster, or for someone else', async () => {
    await assertFails(setDoc(doc(samPhone(), `${TEAM}/claims/ghost`), { uid: 'samPhone' }));
    await assertFails(setDoc(doc(samPhone(), `${TEAM}/claims/sam`), { uid: 'chrisPhone' }));
  });

  it('lets anyone on the team free up a name, unlinking the phone that had it', async () => {
    await assertSucceeds(deleteDoc(doc(samPhone(), `${TEAM}/claims/chris`)));
    await assertSucceeds(
      updateDoc(doc(samPhone(), `${TEAM}/members/chrisPhone`), { dancerId: null }),
    );
    await assertFails(
      updateDoc(doc(samPhone(), `${TEAM}/members/chrisPhone`), { dancerId: 'sam' }),
    );
    await env.withSecurityRulesDisabled((context) =>
      setDoc(doc(context.firestore(), `${TEAM}/claims/chris`), { uid: 'chrisPhone' }),
    );
    await assertSucceeds(deleteDoc(doc(captain(), `${TEAM}/claims/chris`)));
  });

  it('never lets a member change their join code', async () => {
    await assertFails(updateDoc(doc(samPhone(), `${TEAM}/members/samPhone`), { joinCode: 'x' }));
  });
});

describe('live tracking', () => {
  it('lets any member move the floor and record callbacks, signed as themselves', async () => {
    await assertSucceeds(write(samPhone(), floor('samPhone')));
    await assertSucceeds(write(chrisPhone(), callback('chrisPhone')));
    await assertSucceeds(write(captain(), callback('captain')));
    await assertSucceeds(deleteDoc(doc(samPhone(), callback('samPhone').path)));
  });

  it('refuses writes signed as someone else', async () => {
    await assertFails(write(samPhone(), floor('chrisPhone')));
    await assertFails(write(samPhone(), callback('captain')));
  });

  it('refuses changes to a competition that is not active', async () => {
    await assertFails(write(samPhone(), floor('samPhone', ARCHIVED)));
    await assertFails(write(captain(), callback('captain', ARCHIVED)));
  });

  it('refuses anyone who has not joined, or was removed', async () => {
    await assertFails(write(stranger(), floor('stranger')));
    await env.withSecurityRulesDisabled((context) =>
      deleteDoc(doc(context.firestore(), `${TEAM}/members/samPhone`)),
    );
    await assertFails(write(samPhone(), floor('samPhone')));
    await assertFails(getDoc(doc(samPhone(), `${ACTIVE}/live/floor`)));
  });
});
