import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { InvalidBackup, readBackup } from '../../src/app/backup';
import type { CompetitionSnapshot, TeamSnapshot } from '../../src/app/ports';
import { officialSchedule } from '../../src/domain/purdue';
import { preferencesStorage } from '../../src/infra/platform/preferencesStorage';
import { backupFromLegacy } from '../../src/infra/legacy/legacyBackup';
import { localRepository } from '../../src/infra/local/localRepository';
import { memoryStorage } from '../../src/infra/storage/keyValueStorage';
import { fixtureBackup, COMPETITION_ID } from '../app/fakes';

const legacyDocument = (name: string): unknown =>
  JSON.parse(
    readFileSync(new URL(`../fixtures/legacy-artifact/${name}.json`, import.meta.url), 'utf8'),
  );
const sequentialIds = () => {
  let next = 0;
  return () => `id${++next}`;
};

describe('local repository', () => {
  function watch(repository: ReturnType<typeof localRepository>) {
    const seen: { team?: TeamSnapshot; competition?: CompetitionSnapshot } = {};
    repository.watchTeam(
      (team) => (seen.team = team),
      () => {},
    );
    repository.watchCompetition(
      COMPETITION_ID,
      (competition) => (seen.competition = competition),
      () => {},
    );
    return seen;
  }

  it('reports the team and a competition straight away', () => {
    const seen = watch(localRepository(memoryStorage(), { seed: fixtureBackup() }));
    expect(seen.team?.team).toEqual({
      name: 'Purdue',
      captainUids: [],
      activeCompetitionId: COMPETITION_ID,
    });
    expect(seen.team?.partnerships).toHaveLength(4);
    expect(seen.competition?.schedule.items).toHaveLength(7);
  });

  it('has no team until one is named', () => {
    const seen = watch(localRepository(memoryStorage()));
    expect(seen.team?.team).toBeNull();
  });

  it('applies each kind of write and tells the watchers', async () => {
    const repository = localRepository(memoryStorage(), { seed: fixtureBackup() });
    const seen = watch(repository);

    await repository.saveDancers([{ id: 'chris', name: 'Christopher', active: true }]);
    await repository.savePartnerships([
      { id: 'new', leadId: 'chris', followId: null, active: true },
    ]);
    await repository.saveEntries(COMPETITION_ID, { new: ['e1'] });
    await repository.saveFloor(COMPETITION_ID, { currentItemId: 'h2', currentSetAt: 5 });
    await repository.saveCallback(COMPETITION_ID, 'c1_e1', { reachedRound: 4, eliminated: false });

    expect(seen.team?.dancers.find((dancer) => dancer.id === 'chris')?.name).toBe('Christopher');
    expect(seen.team?.partnerships).toHaveLength(5);
    expect(seen.competition?.entries).toMatchObject({ c1: ['e1', 'e2'], new: ['e1'] });
    expect(seen.competition?.floor).toEqual({ currentItemId: 'h2', currentSetAt: 5 });
    expect(seen.competition?.callbacks).toEqual({ c1_e1: { reachedRound: 4, eliminated: false } });

    await repository.saveCallback(COMPETITION_ID, 'c1_e1', null);
    expect(seen.competition?.callbacks).toEqual({});
    await repository.saveCallback(COMPETITION_ID, 'c1_e1', { reachedRound: 4, eliminated: false });
    await repository.clearLive(COMPETITION_ID);
    expect(seen.competition?.floor).toEqual({ currentItemId: null, currentSetAt: null });
    expect(seen.competition?.callbacks).toEqual({});
  });

  it('keeps the data on this phone across restarts, in the backup format', async () => {
    const storage = memoryStorage();
    await localRepository(storage, { seed: fixtureBackup() }).saveFloor(COMPETITION_ID, {
      currentItemId: 'h3',
      currentSetAt: 1,
    });
    const reopened = localRepository(storage);
    expect(watch(reopened).competition?.floor.currentItemId).toBe('h3');
    expect(() => readBackup(reopened.exportBackup())).not.toThrow();
  });
});

describe('backups', () => {
  it('accept a valid backup', () => {
    expect(readBackup(JSON.parse(JSON.stringify(fixtureBackup())))).toMatchObject({
      team: { name: 'Purdue' },
    });
  });

  it.each([
    [{}, 'This is not a team backup file.'],
    [{ ...fixtureBackup(), version: 9 }, "Backup version 9 isn't supported."],
    [{ ...fixtureBackup(), dancers: [{ name: 'No id' }] }, 'A dancer in the backup has no id.'],
    [
      { ...fixtureBackup(), competitions: [{ info: { id: 'x' } }] },
      'A competition in the backup is incomplete.',
    ],
  ])('reject a damaged file (%#)', (json, message) => {
    expect(() => readBackup(json)).toThrow(new InvalidBackup(message));
  });
});

describe('moving the original app’s data', () => {
  const { backup, unmatched } = backupFromLegacy(
    { schedule: legacyDocument('schedule'), entries: legacyDocument('entries') },
    sequentialIds(),
  );
  const [competition] = backup.competitions;

  it('converts the Purdue artifact data into a valid backup', () => {
    expect(() => readBackup(JSON.parse(JSON.stringify(backup)))).not.toThrow();
    expect(competition?.info).toMatchObject({
      name: 'Purdue Ballroom Classic',
      date: '2026-11-14',
      status: 'active',
    });
    expect(backup.team.activeCompetitionId).toBe(competition?.info.id);
  });

  it('keeps every heat, break and event', () => {
    const heats = competition?.schedule.items.filter((item) => item.kind === 'heat') ?? [];
    expect(heats).toHaveLength(139);
    expect(competition?.schedule.items).toHaveLength(147);
    expect(new Set(heats.map((heat) => heat.kind === 'heat' && heat.eventNumber)).size).toBe(
      competition?.schedule.events.length,
    );
    // Heat ids carry over, so nothing else needs remapping.
    expect(competition?.schedule.items[1]?.id).toBe('h2_2hdp');
  });

  it('creates every partnership with all its entries matched', () => {
    expect(backup.partnerships).toHaveLength(20);
    expect(unmatched).toEqual([]);
    const original = legacyDocument('entries') as { couples: { events: string[] }[] };
    const originalCount = original.couples.reduce(
      (count, couple) => count + couple.events.length,
      0,
    );
    expect(Object.values(competition?.entries ?? {}).flat()).toHaveLength(originalCount);
  });

  it('keeps every entry attached when the official schedule replaces the old one', () => {
    const old = competition?.schedule.events ?? [];
    const official = officialSchedule({ previousEvents: old, createId: sequentialIds() });
    const officialIds = new Set(official.events.map((event) => event.eventId));
    const entries = Object.values(competition?.entries ?? {}).flat();
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.filter((eventId) => !officialIds.has(eventId))).toEqual([]);

    // Renumbered events follow by name.
    const numberNow = (oldNumber: number) => {
      const eventId = old.find((event) => event.eventNumber === oldNumber)?.eventId;
      return official.events.find((event) => event.eventId === eventId)?.eventNumber;
    };
    expect(numberNow(10)).toBe(9); // Novice Amer. Smooth
    expect(numberNow(15)).toBe(17); // Silver Intl. Standard (WQ)
    expect(numberNow(45)).toBe(43); // Novice Intl. Latin
    // Events that aren't run this year are dropped, not given to another event.
    expect(numberNow(11)).toBeUndefined(); // Championship Amer. Smooth
  });

  it('starts with no floor position or callbacks', () => {
    expect(competition?.floor).toEqual({ currentItemId: null, currentSetAt: null });
    expect(competition?.callbacks).toEqual({});
  });

  it('applies entries the original app pinned to an event by hand', () => {
    const result = backupFromLegacy(
      {
        schedule: { heats: [{ id: 'h1', t: '9:00 AM', ev: 4, name: 'Gold Amer. Rhythm (CR)' }] },
        entries: {
          couples: [
            {
              id: 'c',
              lead: 'Kim',
              follow: 'Lee',
              events: ['Gold Rhythm Mix'],
              manual: [{ entry: 'Gold Rhythm Mix', ev: 4 }],
            },
          ],
        },
      },
      sequentialIds(),
    );
    expect(result.unmatched).toEqual([]);
    const eventId = result.backup.competitions[0]?.schedule.events[0]?.eventId;
    expect(Object.values(result.backup.competitions[0]?.entries ?? {})).toEqual([[eventId]]);
  });
});

describe('preferences storage', () => {
  it('reads the original app’s settings', () => {
    const storage = memoryStorage({
      'hs:prefs': JSON.stringify({
        me: 'Chris',
        threshold: 5,
        sound: false,
        vibrate: true,
        awake: true,
        showMaybe: false,
      }),
    });
    expect(preferencesStorage(storage).load()).toEqual({
      dancer: 'Chris',
      chime: false,
      vibrate: true,
      keepScreenAwake: true,
      showPossibleHeats: false,
      skipDancerClaim: false,
    });
  });

  it('saves in the new format and ignores fields with the wrong type', () => {
    const storage = memoryStorage();
    const preferences = preferencesStorage(storage);
    expect(preferences.load().chime).toBe(true);

    storage.set('floorcraft:preferences', JSON.stringify({ dancer: 7, chime: false }));
    expect(preferences.load()).toMatchObject({ dancer: '', chime: false });

    preferences.save({ ...preferences.load(), dancer: 'Jo' });
    expect(preferencesStorage(storage).load().dancer).toBe('Jo');
  });
});
