/** Puts the migrated Purdue team into the Firebase emulators for browser tests. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, writeBatch } from 'firebase/firestore';
import { backupFromLegacy } from '../src/infra/legacy/legacyBackup';

export const PROJECT_ID = 'demo-floorcraft';
export const TEAM_ID = 'purdue';
export const JOIN_CODE = 'smoke-test-code';

const legacy = (name: string): unknown =>
  JSON.parse(readFileSync(resolve('tests/fixtures/legacy-artifact', `${name}.json`), 'utf8'));

let env: RulesTestEnvironment | undefined;

/** Clears the emulators and loads the team: captain `captain-uid`, everyone else joins by link. */
export async function seedTeam() {
  env ??= await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
  await env.clearFirestore();
  await fetch(`http://localhost:9099/emulator/v1/projects/${PROJECT_ID}/accounts`, {
    method: 'DELETE',
  });

  const { backup } = backupFromLegacy(
    { schedule: legacy('schedule'), entries: legacy('entries') },
    () => crypto.randomUUID(),
  );
  const competition = backup.competitions[0];
  if (!competition) throw new Error('No competition in the migrated data');
  const team = `teams/${TEAM_ID}`;
  const path = `${team}/competitions/${competition.info.id}`;

  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, team), {
      name: 'Purdue Ballroom',
      captainUids: ['captain-uid'],
      activeCompetitionId: competition.info.id,
    });
    await setDoc(doc(db, `${team}/private/join`), { code: JOIN_CODE });
    const batch = writeBatch(db);
    for (const { id, ...dancer } of backup.dancers)
      batch.set(doc(db, `${team}/dancers/${id}`), dancer);
    for (const { id, ...partnership } of backup.partnerships) {
      batch.set(doc(db, `${team}/partnerships/${id}`), partnership);
    }
    const { name, date, status } = competition.info;
    batch.set(doc(db, path), { name, date, status });
    batch.set(doc(db, `${path}/schedule/current`), competition.schedule);
    for (const [partnershipId, eventIds] of Object.entries(competition.entries)) {
      batch.set(doc(db, `${path}/entries/${partnershipId}`), { eventIds });
    }
    await batch.commit();
  });
}

export async function closeSeed() {
  await env?.cleanup();
  env = undefined;
}
