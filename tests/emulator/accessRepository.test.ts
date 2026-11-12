/** Joining the team, against the emulator with the real security rules. */
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, setDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AccessRepository, TeamAccess } from '../../src/app/ports';
import { firestoreAccessRepository } from '../../src/infra/firebase/firestoreAccessRepository';

const TEAM_ID = 'purdue';
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-floorcraft',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(() => env?.cleanup());
beforeEach(() => env.clearFirestore());

function accessFor(uid: string, provider: 'google.com' | 'anonymous'): AccessRepository {
  const firestore = env
    .authenticatedContext(uid, { firebase: { sign_in_provider: provider } })
    .firestore() as unknown as Firestore;
  return firestoreAccessRepository({ firestore, teamId: TEAM_ID, now: () => 1000 });
}
const captain = () => accessFor('captain', 'google.com');
const phone = (uid: string) => accessFor(uid, 'anonymous');

/** Resolves with the first access report that passes `isReady`. */
function accessOf(
  repository: AccessRepository,
  uid: string,
  isReady: (access: TeamAccess) => boolean = () => true,
) {
  return new Promise<TeamAccess>((resolve) => {
    const stop = repository.watchAccess(uid, (access) => {
      if (!isReady(access)) return;
      stop();
      resolve(access);
    });
  });
}

const claimsOf = (repository: AccessRepository) =>
  new Promise<Record<string, string>>((resolve) => {
    const stop = repository.watchClaims((claims) => {
      stop();
      resolve(claims);
    });
  });

async function createTeam() {
  await captain().createTeam('captain', 'Purdue Ballroom', 'code-one');
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `teams/${TEAM_ID}/dancers/chris`), { name: 'Chris', active: true });
    await setDoc(doc(db, `teams/${TEAM_ID}/dancers/sam`), { name: 'Sam', active: true });
  });
}

describe('creating the team', () => {
  it('makes the Google account its captain and first member', async () => {
    await createTeam();
    expect(await accessOf(captain(), 'captain', (access) => access.kind === 'team')).toEqual({
      kind: 'team',
      isCaptain: true,
      membership: { uid: 'captain', dancerId: null, provider: 'google', joinedAt: 1000 },
    });
  });

  it('gives the captain the join code', async () => {
    await createTeam();
    const code = await new Promise((resolve) => captain().watchJoinCode(resolve));
    expect(code).toBe('code-one');
  });

  it('cannot be done twice', async () => {
    await createTeam();
    await expect(
      accessFor('someoneElse', 'google.com').createTeam('someoneElse', 'Mine', 'x'),
    ).rejects.toMatchObject({ name: 'SyncFailure', code: 'read-only' });
  });
});

describe('joining', () => {
  it('shows nothing until a phone joins', async () => {
    await createTeam();
    expect(await accessOf(phone('sam'), 'sam')).toEqual({ kind: 'none' });
  });

  it('needs the current join code', async () => {
    await createTeam();
    await expect(phone('sam').join('sam', 'guess', 'anonymous')).rejects.toMatchObject({
      code: 'read-only',
    });

    await phone('sam').join('sam', 'code-one', 'anonymous');
    expect(await accessOf(phone('sam'), 'sam')).toEqual({
      kind: 'team',
      isCaptain: false,
      membership: { uid: 'sam', dancerId: null, provider: 'anonymous', joinedAt: 1000 },
    });
  });

  it('stops working with an old code once the captain makes a new link', async () => {
    await createTeam();
    await captain().setJoinCode('code-two');
    await expect(phone('sam').join('sam', 'code-one', 'anonymous')).rejects.toMatchObject({
      code: 'read-only',
    });
    await phone('sam').join('sam', 'code-two', 'anonymous');
  });

  it('lets a captain add their own membership without a code', async () => {
    await createTeam();
    await env.withSecurityRulesDisabled((context) =>
      deleteDoc(doc(context.firestore(), `teams/${TEAM_ID}/members/captain`)),
    );
    await captain().joinAsCaptain('captain');
    expect(await accessOf(captain(), 'captain')).toMatchObject({
      membership: { uid: 'captain', provider: 'google' },
    });
  });

  it('reports a phone the captain removes', async () => {
    await createTeam();
    await phone('sam').join('sam', 'code-one', 'anonymous');
    const removed = accessOf(phone('sam'), 'sam', (access) => access.kind === 'none');
    await accessOf(phone('sam'), 'sam', (access) => access.kind === 'team');

    await env.withSecurityRulesDisabled((context) =>
      deleteDoc(doc(context.firestore(), `teams/${TEAM_ID}/members/sam`)),
    );
    expect(await removed).toEqual({ kind: 'none' });
  });
});

describe('picking a name', () => {
  beforeEach(async () => {
    await createTeam();
    await phone('phoneA').join('phoneA', 'code-one', 'anonymous');
    await phone('phoneB').join('phoneB', 'code-one', 'anonymous');
  });

  it('links the phone to the dancer', async () => {
    await phone('phoneA').claimDancer('phoneA', 'chris', null);
    expect(await accessOf(phone('phoneA'), 'phoneA')).toMatchObject({
      membership: { dancerId: 'chris' },
    });
    expect(await claimsOf(phone('phoneB'))).toEqual({ chris: 'phoneA' });
  });

  it('refuses a dancer another phone has', async () => {
    await phone('phoneA').claimDancer('phoneA', 'chris', null);
    await expect(phone('phoneB').claimDancer('phoneB', 'chris', null)).rejects.toMatchObject({
      code: 'read-only',
    });
  });

  it('releases the previous dancer when switching, and ignores re-picking the same one', async () => {
    await phone('phoneA').claimDancer('phoneA', 'chris', null);
    await phone('phoneA').claimDancer('phoneA', 'chris', 'chris');
    await phone('phoneA').claimDancer('phoneA', 'sam', 'chris');

    expect(await claimsOf(phone('phoneA'))).toEqual({ sam: 'phoneA' });
    await phone('phoneB').claimDancer('phoneB', 'chris', null);
  });

  it('lets a captain free up a name for another phone, and no one else', async () => {
    await phone('phoneA').claimDancer('phoneA', 'chris', null);
    await expect(phone('phoneB').releaseDancer('chris', 'phoneA')).rejects.toMatchObject({
      code: 'read-only',
    });

    await captain().releaseDancer('chris', 'phoneA');

    expect(await claimsOf(phone('phoneB'))).toEqual({});
    expect(await accessOf(phone('phoneA'), 'phoneA')).toMatchObject({
      membership: { dancerId: null },
    });
    await phone('phoneB').claimDancer('phoneB', 'chris', null);
  });

  it('records a member who links a Google account', async () => {
    await phone('phoneA').setProvider('phoneA', 'google');
    expect(await accessOf(phone('phoneA'), 'phoneA')).toMatchObject({
      membership: { provider: 'google' },
    });
  });
});
