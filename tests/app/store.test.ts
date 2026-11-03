import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { readBackup } from '../../src/app/backup';
import type { Notice } from '../../src/app/notices';
import { SyncFailure } from '../../src/app/ports';
import type { Preferences } from '../../src/app/preferences';
import { createAppStore, type AppStore } from '../../src/app/store';
import type { CallbackMarks, FloorState } from '../../src/domain/types';
import { backupFromLegacy } from '../../src/infra/legacy/legacyBackup';
import { at } from '../domain/fixture';
import {
  COMPETITION_ID,
  fakeAlertOutput,
  fakePreferences,
  fakeRepository,
  fakeWakeLock,
  fixtureBackup,
  settle,
} from './fakes';

let store: AppStore | undefined;
afterEach(() => store?.dispose());

interface Options {
  preferences?: Partial<Preferences>;
  wakeLockGranted?: boolean;
  now?: number;
  floor?: FloorState;
  callbacks?: CallbackMarks;
}

function start({
  preferences: initialPreferences,
  wakeLockGranted = true,
  now = at(9, 20),
  floor,
  callbacks,
}: Options = {}) {
  const backend = fakeRepository(fixtureBackup({ floor, callbacks }));
  const preferences = fakePreferences(initialPreferences);
  const alerts = fakeAlertOutput();
  const wakeLock = fakeWakeLock(wakeLockGranted);
  let nextId = 0;
  store = createAppStore({
    repository: backend.repository,
    preferences: preferences.store,
    clock: { now: () => now },
    alertOutput: alerts.output,
    wakeLock: wakeLock.wakeLock,
    createId: () => `new${++nextId}`,
  });
  const notices: Notice[] = [];
  store.onNotice((notice) => notices.push(notice));
  store.start();
  return { store, backend, preferences, alerts, wakeLock, notices };
}

const onFloor = (itemId: string, setAt = at(9, 0)): FloorState => ({
  currentItemId: itemId,
  currentSetAt: setAt,
});
const writesOf = (backend: ReturnType<typeof fakeRepository>, method: string) =>
  backend.writes.filter(([name]) => name === method).map(([, ...args]) => args);

describe('loading', () => {
  it('loads the team and the active competition', () => {
    const { store } = start();
    expect(store.syncMode.value).toBe('shared');
    expect(store.loaded.value).toEqual({ team: true, competition: true });
    expect(store.activeCompetition.value?.name).toBe('Classic');
    expect(store.couples.value.map((couple) => couple.id)).toEqual(['c2', 'c1', 'c4', 'c3']);
    expect(store.competition.value.schedule).toHaveLength(7);
  });

  it('starts as connecting with nothing loaded', () => {
    const unstarted = createAppStore({
      repository: fakeRepository().repository,
      preferences: fakePreferences().store,
      clock: { now: () => 0 },
      alertOutput: fakeAlertOutput().output,
      wakeLock: fakeWakeLock(true).wakeLock,
    });
    expect(unstarted.syncMode.value).toBe('connecting');
    expect(unstarted.loaded.value).toEqual({ team: false, competition: false });
  });

  it('follows the active competition when it changes', async () => {
    const { store, backend } = start();
    await backend.otherPhone.saveCompetition({
      id: 'spring',
      name: 'Spring',
      date: '2027-04-10',
      status: 'setup',
    });
    await backend.otherPhone.updateTeam({ activeCompetitionId: 'spring' });

    expect(store.activeCompetition.value?.name).toBe('Spring');
    expect(store.competition.value.schedule).toEqual([]);
  });

  it('applies changes from other phones', async () => {
    const { store, backend } = start();
    await backend.otherPhone.saveFloor(COMPETITION_ID, onFloor('h3', at(9, 5)));
    expect(store.competition.value.delayMinutes).toBe(10);
  });

  it('reports when the data cannot be read', () => {
    const { store, backend } = start();
    backend.failReadsWith('unavailable');
    expect(store.syncError.value).toBe('unavailable');
  });
});

describe('connection', () => {
  it('counts this phone’s changes until the server confirms them', async () => {
    const { store } = start();
    store.actions.putOnFloor('h2');
    store.actions.putOnFloor('h3');
    expect(store.pendingWrites.value).toBe(2);
    await settle();
    expect(store.pendingWrites.value).toBe(0);
  });

  it('follows the phone going offline and back online', () => {
    let listener: (online: boolean) => void = () => {};
    const unstarted = createAppStore({
      repository: fakeRepository().repository,
      preferences: fakePreferences().store,
      clock: { now: () => 0 },
      alertOutput: fakeAlertOutput().output,
      wakeLock: fakeWakeLock(true).wakeLock,
      connectivity: { isOnline: () => false, onChange: (next) => ((listener = next), () => {}) },
    });
    store = unstarted;
    unstarted.start();
    expect(unstarted.isOnline.value).toBe(false);
    listener(true);
    expect(unstarted.isOnline.value).toBe(true);
  });
});

describe('saving', () => {
  it('writes only the floor position when the floor moves', () => {
    const { store, backend } = start();
    store.actions.putOnFloor('h2');

    expect(store.live.value.currentItemId).toBe('h2');
    expect(backend.writes).toEqual([['saveFloor', COMPETITION_ID, onFloor('h2', at(9, 20))]]);
  });

  it('reports a failed save with its reason', async () => {
    const { store, backend, notices } = start();
    backend.failWith = new SyncFailure('read-only', 'permission-denied');
    store.actions.putOnFloor('h2');
    await settle();

    expect(notices).toEqual([
      { kind: 'save-failed', code: 'read-only', detail: 'permission-denied' },
    ]);
  });
});

describe('floor and callback actions', () => {
  it('advances the floor using the clock, and does nothing past the end', async () => {
    const { store, backend } = start({ now: at(8, 31) });
    store.actions.advanceFloor();
    expect(store.live.value).toMatchObject(onFloor('h0', at(8, 31)));

    await backend.otherPhone.saveFloor(COMPETITION_ID, onFloor('h6', at(9, 10)));
    backend.writes.length = 0;
    store.actions.advanceFloor();
    expect(backend.writes).toEqual([]);
  });

  it('moves back without changing the pace', () => {
    const { store } = start({ floor: onFloor('h4', at(9, 10)) });
    store.actions.moveFloorBack();
    expect(store.live.value.currentItemId).toBe('h3');
    expect(store.competition.value.delayMinutes).toBe(10);
  });

  it('saves each callback as its own mark, and clears it when undone', () => {
    const { store, backend } = start();
    store.actions.recordCallback({
      coupleId: 'c1',
      eventId: 'e1',
      reachedRound: 4,
      eliminated: false,
    });
    expect(writesOf(backend, 'saveCallback')).toEqual([
      [COMPETITION_ID, 'c1_e1', { reachedRound: 4, eliminated: false }],
    ]);
    expect(store.competition.value.heatTeams.get('h3')?.dancing.map((c) => c.id)).toEqual(['c1']);

    store.actions.recordCallback({
      coupleId: 'c1',
      eventId: 'e1',
      reachedRound: 1,
      eliminated: false,
    });
    expect(writesOf(backend, 'saveCallback')[1]).toEqual([COMPETITION_ID, 'c1_e1', null]);
    expect(store.live.value.callbacks).toEqual({});
  });

  it('clears live tracking', () => {
    const { store } = start({
      floor: onFloor('h3'),
      callbacks: { c1_e1: { reachedRound: 4, eliminated: false } },
    });
    store.actions.resetLiveTracking();
    expect(store.live.value).toEqual({ currentItemId: null, currentSetAt: null, callbacks: {} });
  });
});

describe('schedule actions', () => {
  it('imports a schedule, clearing the floor and keeping callbacks on matching events', () => {
    const callbacks = { c1_e1: { reachedRound: 4 as const, eliminated: false } };
    const { store } = start({ floor: onFloor('h3'), callbacks });

    const count = store.actions.importSchedule(
      ['9:00 AM [5] Bronze Amer. Smooth 1st Round (WT)', '9:10 AM Lunch'].join('\n'),
    );

    expect(count).toBe(1);
    expect(store.schedule.value.map((item) => item.id)).toEqual(['new1', 'new2']);
    // Renumbered from 1 to 5, but still the same event: entries and the callback stay attached.
    expect(store.schedule.value[0]).toMatchObject({ eventId: 'e1', eventNumber: 5 });
    expect(store.competition.value.coupleEvents.get('c1')).toEqual(['e1']);
    expect(store.live.value).toEqual({ currentItemId: null, currentSetAt: null, callbacks });
  });

  it('ignores an import with no heats', () => {
    const { store, backend } = start();
    expect(store.actions.importSchedule('9:10 AM Lunch')).toBe(0);
    expect(backend.writes).toEqual([]);
  });

  it('edits a line as a heat or a break, and rejects a bad time', () => {
    const { store } = start();
    expect(store.actions.editScheduleItem('h2', 'soon', 'x')).toBe('invalid-time');
    expect(store.actions.editScheduleItem('nope', '9:00 AM', 'x')).toBe('not-found');

    expect(store.actions.editScheduleItem('h2', ' 8:50 am ', '[7] Gold Amer. Smooth')).toBe(
      'saved',
    );
    expect(store.schedule.value[2]).toMatchObject({
      kind: 'heat',
      id: 'h2',
      scheduledTime: '8:50 AM',
      eventNumber: 7,
      name: 'Gold Amer. Smooth',
    });
    expect(store.competition.value.events.get('e2')).toBeUndefined();

    store.actions.editScheduleItem('h2', '8:50 AM', 'Coffee break');
    expect(store.schedule.value[2]).toEqual({
      kind: 'break',
      id: 'h2',
      scheduledTime: '8:50 AM',
      label: 'Coffee break',
    });
  });

  it('keeps an event’s id when its heat name is corrected', () => {
    const { store } = start();
    store.actions.editScheduleItem('h2', '8:48 AM', '[2] Bronze Amer. Smooth (FT)');
    expect(store.schedule.value[2]).toMatchObject({
      eventId: 'e2',
      name: 'Bronze Amer. Smooth (FT)',
    });
  });

  it('inserts a placeholder heat after a heat or a break', () => {
    const { store } = start();
    expect(store.actions.insertHeatAfter('h4')).toBe('new1');
    expect(store.schedule.value[5]).toEqual({
      kind: 'heat',
      id: 'new1',
      scheduledTime: '9:00 AM',
      eventId: 'e3',
      eventNumber: 3,
      name: 'New heat',
    });

    store.actions.insertHeatAfter('h0');
    expect(store.schedule.value[1]).toMatchObject({ id: 'new2', eventNumber: 1 });
  });

  it('deletes a line', () => {
    const { store } = start();
    store.actions.deleteScheduleItem('h0');
    expect(store.schedule.value.map((item) => item.id)).not.toContain('h0');
  });
});

describe('couple and entry actions', () => {
  const couple = (store: AppStore, id: string) => store.couples.value.find((c) => c.id === id);

  it('imports couples from the spreadsheet, keeping existing partnerships', () => {
    const { store } = start();
    expect(store.actions.importEntries('Kim Lee\nLead Follow Level Events')).toEqual({
      couples: 0,
      unmatched: [],
    });
    expect(store.couples.value).toHaveLength(4);

    const result = store.actions.importEntries(
      ['Chris\tBrooke\tBronze\tBronze A. Smooth (FV)', 'Kim\tLee\tGold\tGold Intl. Tango'].join(
        '\n',
      ),
    );
    expect(result).toEqual({
      couples: 2,
      unmatched: [{ lead: 'Kim', follow: 'Lee', entry: 'Gold Intl. Tango' }],
    });
    expect(store.couples.value.map((c) => `${c.lead} & ${c.follow}`)).toEqual([
      'Chris & Brooke',
      'Kim & Lee',
    ]);
    expect(store.competition.value.coupleEvents.get('c1')).toEqual(['e2']);
    expect(store.competition.value.entries['c3']).toEqual([]);
  });

  it('adds a couple only with a lead, defaulting the follow to TBA', () => {
    const { store } = start();
    expect(store.actions.addCouple('  ', 'Lee')).toBeNull();
    expect(store.actions.addCouple(' Kim ', '')).toBe('new1');
    expect(couple(store, 'new1')).toEqual({ id: 'new1', lead: 'Kim', follow: 'TBA' });
  });

  it('renames a couple by pointing it at dancers, adding new ones', () => {
    const { store } = start();
    store.actions.renameCouple('c1', ' chris ', 'Morgan');
    expect(couple(store, 'c1')).toEqual({ id: 'c1', lead: 'Chris', follow: 'Morgan' });
    expect(store.team.value.dancers.map((dancer) => dancer.name)).toContain('Morgan');
  });

  it('removes a couple from the team and the competition, keeping it for history', () => {
    const { store } = start();
    store.actions.deleteCouple('c1');
    expect(couple(store, 'c1')).toBeUndefined();
    expect(store.team.value.partnerships.find((p) => p.id === 'c1')?.active).toBe(false);
    expect(store.competition.value.entries['c1']).toEqual([]);
  });

  it('adds an event once and removes it', () => {
    const { store } = start();
    store.actions.addEntry('c4', 'e3');
    store.actions.addEntry('c4', 'e3');
    store.actions.addEntry('c4', 'not-an-event');
    expect(store.competition.value.entries['c4']).toEqual(['gone', 'e3']);

    store.actions.removeEntry('c4', 'gone');
    expect(store.competition.value.entries['c4']).toEqual(['e3']);
    expect(store.competition.value.missingEntries).toEqual([]);
  });
});

describe('backups', () => {
  const migratedPurdue = () => {
    const legacy = (name: string): unknown =>
      JSON.parse(
        readFileSync(new URL(`../fixtures/legacy-artifact/${name}.json`, import.meta.url), 'utf8'),
      );
    let next = 0;
    return backupFromLegacy(
      { schedule: legacy('schedule'), entries: legacy('entries') },
      { name: 'Purdue Ballroom Classic', date: '2026-11-14', status: 'active' },
      () => `purdue${++next}`,
    ).backup;
  };

  it('exports the team and the active competition as a valid backup', () => {
    const { store } = start({
      floor: onFloor('h3'),
      callbacks: { c1_e1: { reachedRound: 4, eliminated: false } },
    });
    const backup = readBackup(JSON.parse(JSON.stringify(store.actions.exportBackup())));

    expect(backup.team).toEqual({ name: 'Purdue', activeCompetitionId: COMPETITION_ID });
    expect(backup.partnerships).toHaveLength(4);
    expect(backup.competitions).toHaveLength(1);
    expect(backup.competitions[0]).toMatchObject({
      info: { id: COMPETITION_ID },
      floor: onFloor('h3'),
      callbacks: { c1_e1: { reachedRound: 4, eliminated: false } },
    });
  });

  it('imports the migrated Purdue data and makes it the active competition', () => {
    const { store } = start();
    const purdue = migratedPurdue();
    store.actions.importBackup(purdue);

    expect(store.activeCompetition.value).toMatchObject({
      name: 'Purdue Ballroom Classic',
      date: '2026-11-14',
      status: 'active',
    });
    expect(store.team.value.competitions.find((info) => info.id === COMPETITION_ID)?.status).toBe(
      'archived',
    );
    expect(store.schedule.value).toHaveLength(147);
    expect(store.couples.value.length).toBe(4 + 20);
    expect(store.competition.value.missingEntries).toEqual([]);
  });

  it('restores the floor position and callbacks of the competition it makes active', () => {
    const { store, backend } = start();
    const backup = store.actions.exportBackup();
    const competition = backup.competitions[0];
    if (!competition) throw new Error('no competition');
    store.actions.resetLiveTracking();
    backend.writes.length = 0;

    store.actions.importBackup({
      ...backup,
      competitions: [
        {
          ...competition,
          floor: onFloor('h4'),
          callbacks: { c3_e1: { reachedRound: 1, eliminated: true } },
        },
      ],
    });
    expect(store.live.value).toEqual({
      ...onFloor('h4'),
      callbacks: { c3_e1: { reachedRound: 1, eliminated: true } },
    });
  });
});

describe('alerts', () => {
  const moveFloor = (backend: ReturnType<typeof fakeRepository>, itemId: string) =>
    backend.otherPhone.saveFloor(COMPETITION_ID, onFloor(itemId));

  it('chime, vibrate and publish a notice, once per alert', async () => {
    const { backend, alerts, notices } = start({
      preferences: { dancer: 'Alex', alertThresholdHeats: 3 },
    });
    await moveFloor(backend, 'h1');
    await moveFloor(backend, 'h1');

    expect(alerts.played).toEqual(['chime 1', 'vibrate 250,100,250']);
    expect(notices).toEqual([
      { kind: 'alert', alert: { type: 'heads-up', heatId: 'h4', heatsAway: 3 } },
    ]);
  });

  it('respect the sound and vibration settings', async () => {
    const { backend, alerts } = start({ preferences: { dancer: 'Chris', chime: false } });
    await moveFloor(backend, 'h0');
    expect(alerts.played).toEqual(['vibrate 300,120,300,120,300']);
  });

  it('start over when this phone alerts for someone else or clears live tracking', async () => {
    const { store, backend, alerts } = start({ preferences: { dancer: 'Chris' } });
    const chimes = () => alerts.played.filter((sound) => sound.startsWith('chime')).length;
    await moveFloor(backend, 'h0');
    store.actions.updatePreferences({ dancer: 'Brooke' });
    store.actions.updatePreferences({ dancer: 'Chris' });
    expect(chimes()).toBe(3);

    store.actions.resetLiveTracking();
    await moveFloor(backend, 'h0');
    expect(chimes()).toBe(4);
  });

  it('can be tested', () => {
    const { store, alerts } = start();
    store.actions.testAlert();
    expect(alerts.played).toEqual(['chime 2', 'vibrate 300,120,300']);
  });
});

describe('preferences', () => {
  it('are saved on this phone', () => {
    const { store, preferences } = start();
    store.actions.updatePreferences({ alertThresholdHeats: 5 });
    expect(store.preferences.value.alertThresholdHeats).toBe(5);
    expect(preferences.stored.alertThresholdHeats).toBe(5);
  });

  it('turn keep-awake back off when the browser refuses it', async () => {
    const { store, notices, wakeLock } = start({ wakeLockGranted: false });
    store.actions.updatePreferences({ keepScreenAwake: true });
    await settle();

    expect(wakeLock.calls).toContain('enable');
    expect(store.preferences.value.keepScreenAwake).toBe(false);
    expect(notices).toEqual([{ kind: 'wake-lock-refused' }]);
  });
});
