/**
 * The Firestore repository against the emulator, with the real security rules: the captain sets
 * up, members track live, and what the rules forbid comes back as a SyncFailure.
 */
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  CompetitionSnapshot,
  HeatSheetRepository,
  SyncErrorCode,
  TeamSnapshot,
} from '../../src/app/ports';
import { firestoreRepository } from '../../src/infra/firebase/firestoreRepository';
import { backupFromLegacy } from '../../src/infra/legacy/legacyBackup';
import { events, schedule } from '../domain/fixture';

const TEAM_ID = 'purdue';
const COMPETITION = 'classic';
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-floorcraft',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(() => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `teams/${TEAM_ID}`), {
      name: 'Purdue',
      captainUids: ['captain'],
      activeCompetitionId: COMPETITION,
    });
    await setDoc(doc(db, `teams/${TEAM_ID}/members/sam`), {
      dancerId: null,
      provider: 'anonymous',
      joinedAt: 1,
    });
  });
});

function repositoryFor(uid: string): HeatSheetRepository {
  const provider = uid === 'captain' ? 'google.com' : 'anonymous';
  const firestore = env
    .authenticatedContext(uid, { firebase: { sign_in_provider: provider } })
    .firestore() as unknown as Firestore;
  return firestoreRepository({ firestore, teamId: TEAM_ID, currentUid: () => uid });
}

/** Resolves with the first snapshot that passes `isReady`. */
function nextTeam(repository: HeatSheetRepository, isReady: (snapshot: TeamSnapshot) => boolean) {
  return new Promise<TeamSnapshot>((resolve, reject) => {
    const stop = repository.watchTeam(
      (snapshot) => {
        if (!isReady(snapshot)) return;
        stop();
        resolve(snapshot);
      },
      (code) => reject(new Error(code)),
    );
  });
}

function nextCompetition(
  repository: HeatSheetRepository,
  isReady: (snapshot: CompetitionSnapshot) => boolean,
) {
  return new Promise<CompetitionSnapshot>((resolve, reject) => {
    const stop = repository.watchCompetition(
      COMPETITION,
      (snapshot) => {
        if (!isReady(snapshot)) return;
        stop();
        resolve(snapshot);
      },
      (code) => reject(new Error(code)),
    );
  });
}

async function setUpCompetition(captain: HeatSheetRepository) {
  await captain.saveDancers([
    { id: 'chris', name: 'Chris', active: true },
    { id: 'brooke', name: 'Brooke', active: true },
  ]);
  await captain.savePartnerships([{ id: 'c1', leadId: 'chris', followId: 'brooke', active: true }]);
  await captain.saveCompetition({
    id: COMPETITION,
    name: 'Purdue Ballroom Classic',
    date: '2026-11-14',
    status: 'active',
  });
  await captain.saveSchedule(COMPETITION, { items: schedule, events });
  await captain.saveEntries(COMPETITION, { c1: ['e1', 'e2'] });
}

describe('Firestore repository', () => {
  it('lets the captain set up a competition that every member then sees', async () => {
    await setUpCompetition(repositoryFor('captain'));
    const member = repositoryFor('sam');

    const team = await nextTeam(member, (snapshot) => snapshot.partnerships.length === 1);
    expect(team.team).toEqual({
      name: 'Purdue',
      captainUids: ['captain'],
      activeCompetitionId: COMPETITION,
    });
    expect(team.dancers.map((dancer) => dancer.name).sort()).toEqual(['Brooke', 'Chris']);
    expect(team.competitions).toEqual([
      { id: COMPETITION, name: 'Purdue Ballroom Classic', date: '2026-11-14', status: 'active' },
    ]);

    const competition = await nextCompetition(
      member,
      (snapshot) => !!snapshot.schedule.items.length,
    );
    expect(competition.schedule).toEqual({ items: schedule, events });
    expect(competition.entries).toEqual({ c1: ['e1', 'e2'] });
  });

  it('lets members move the floor and record callbacks, signed as themselves', async () => {
    await setUpCompetition(repositoryFor('captain'));
    const member = repositoryFor('sam');

    await member.saveFloor(COMPETITION, { currentItemId: 'h3', currentSetAt: 123 });
    await member.saveCallback(COMPETITION, 'c1_e1', { reachedRound: 4, eliminated: false });
    const competition = await nextCompetition(member, (snapshot) => !!snapshot.floor.currentItemId);
    expect(competition.floor).toEqual({ currentItemId: 'h3', currentSetAt: 123 });
    expect(competition.callbacks).toEqual({ c1_e1: { reachedRound: 4, eliminated: false } });

    let stored: unknown;
    await env.withSecurityRulesDisabled(async (context) => {
      const path = `teams/${TEAM_ID}/competitions/${COMPETITION}/live/floor`;
      stored = (await getDoc(doc(context.firestore(), path))).data();
    });
    expect(stored).toMatchObject({ updatedBy: 'sam' });
  });

  it('removes a callback mark and clears live tracking', async () => {
    await setUpCompetition(repositoryFor('captain'));
    const member = repositoryFor('sam');
    await member.saveCallback(COMPETITION, 'c1_e1', { reachedRound: 4, eliminated: false });
    await member.saveCallback(COMPETITION, 'c1_e2', { reachedRound: 5, eliminated: true });
    await member.saveCallback(COMPETITION, 'c1_e1', null);
    expect((await nextCompetition(member, () => true)).callbacks).toEqual({
      c1_e2: { reachedRound: 5, eliminated: true },
    });

    await member.saveFloor(COMPETITION, { currentItemId: 'h3', currentSetAt: 1 });
    await member.clearLive(COMPETITION);
    const cleared = await nextCompetition(member, () => true);
    expect(cleared.callbacks).toEqual({});
    expect(cleared.floor).toEqual({ currentItemId: null, currentSetAt: null });
  });

  it('refuses setup changes from members, as read-only', async () => {
    await setUpCompetition(repositoryFor('captain'));
    const member = repositoryFor('sam');
    await expect(member.saveSchedule(COMPETITION, { items: [], events: [] })).rejects.toMatchObject(
      {
        name: 'SyncFailure',
        code: 'read-only',
      },
    );
    await expect(
      member.saveDancers([{ id: 'sam', name: 'Sam', active: true }]),
    ).rejects.toMatchObject({ code: 'read-only' });
  });

  it('reports that the data is unavailable to someone who has not joined', async () => {
    const stranger = repositoryFor('stranger');
    const code = await new Promise<SyncErrorCode>((resolve) =>
      stranger.watchTeam(() => {}, resolve),
    );
    expect(code).toBe('unavailable');
  });

  it('stores the whole migrated Purdue competition', async () => {
    const read = (name: string): unknown =>
      JSON.parse(
        readFileSync(new URL(`../fixtures/legacy-artifact/${name}.json`, import.meta.url), 'utf8'),
      );
    const { backup } = backupFromLegacy(
      { schedule: read('schedule'), entries: read('entries') },
      { name: 'Purdue Ballroom Classic', date: '2026-11-14', status: 'active' },
      () => crypto.randomUUID(),
    );
    const [migrated] = backup.competitions;
    if (!migrated) throw new Error('no competition');
    const captain = repositoryFor('captain');

    await captain.saveDancers(backup.dancers);
    await captain.savePartnerships(backup.partnerships);
    await captain.saveCompetition({ ...migrated.info, id: COMPETITION });
    await captain.saveSchedule(COMPETITION, migrated.schedule);
    await captain.saveEntries(COMPETITION, migrated.entries);

    const team = await nextTeam(captain, (snapshot) => snapshot.partnerships.length === 20);
    expect(team.dancers).toHaveLength(backup.dancers.length);
    const competition = await nextCompetition(
      captain,
      (snapshot) => !!snapshot.schedule.items.length,
    );
    expect(competition.schedule).toEqual(migrated.schedule);
    expect(competition.entries).toEqual(migrated.entries);
  });
});
