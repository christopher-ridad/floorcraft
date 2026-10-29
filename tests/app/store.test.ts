import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Notice } from '../../src/app/notices';
import { SyncFailure, type CompetitionDocuments } from '../../src/app/ports';
import type { Preferences } from '../../src/app/preferences';
import { createAppStore, EMPTY_LIVE, type AppStore } from '../../src/app/store';
import { at, couples, schedule } from '../domain/fixture';
import {
  fakeAlertOutput,
  fakeConnector,
  fakePreferences,
  fakeWakeLock,
  FakeSync,
  settle,
} from './fakes';

const fixtureDocuments: CompetitionDocuments = { schedule, entries: couples, live: EMPTY_LIVE };

let store: AppStore | undefined;
afterEach(() => {
  store?.dispose();
  vi.useRealTimers();
});

interface Options {
  shared?: Promise<FakeSync | null>;
  preferences?: Partial<Preferences>;
  wakeLockGranted?: boolean;
  now?: number;
}

function setup({
  shared = Promise.resolve(new FakeSync('shared', fixtureDocuments)),
  preferences: initialPreferences,
  wakeLockGranted = true,
  now = at(9, 20),
}: Options = {}) {
  const { connector, local } = fakeConnector(shared);
  const preferences = fakePreferences(initialPreferences);
  const alerts = fakeAlertOutput();
  const wakeLock = fakeWakeLock(wakeLockGranted);
  let nextId = 0;
  store = createAppStore({
    sync: connector,
    preferences: preferences.store,
    clock: { now: () => now },
    alertOutput: alerts.output,
    wakeLock: wakeLock.wakeLock,
    createId: () => `new${++nextId}`,
    connectTimeoutMs: 1000,
  });
  const notices: Notice[] = [];
  store.onNotice((notice) => notices.push(notice));
  return { store, local, preferences, alerts, wakeLock, notices };
}

async function startShared(options: Options = {}) {
  const shared = new FakeSync('shared', fixtureDocuments);
  const context = setup({ ...options, shared: Promise.resolve(shared) });
  await context.store.start();
  return { ...context, shared };
}

describe('connecting', () => {
  it('uses the shared backend and loads every document', async () => {
    const { store } = await startShared();
    expect(store.syncMode.value).toBe('shared');
    expect(store.loaded.value).toEqual({ schedule: true, entries: true, live: true });
    expect(store.competition.value.schedule).toHaveLength(7);
  });

  it('starts as connecting with nothing loaded', () => {
    const { store } = setup({ shared: new Promise(() => {}) });
    expect(store.syncMode.value).toBe('connecting');
    expect(store.loaded.value).toEqual({ schedule: false, entries: false, live: false });
  });

  it('works on this phone only when there is no shared backend', async () => {
    const { store } = setup({ shared: Promise.resolve(null) });
    await store.start();
    expect(store.syncMode.value).toBe('local');
  });

  it('works on this phone only if connecting fails', async () => {
    const { store } = setup({ shared: Promise.reject(new Error('offline')) });
    await store.start();
    expect(store.syncMode.value).toBe('local');
  });

  it('falls back after the timeout, then switches to a late shared connection', async () => {
    vi.useFakeTimers();
    let connect: (sync: FakeSync) => void = () => {};
    const { store } = setup({ shared: new Promise((resolve) => (connect = resolve)) });
    const started = store.start();

    vi.advanceTimersByTime(1000);
    expect(store.syncMode.value).toBe('local');

    connect(new FakeSync('shared', fixtureDocuments));
    await started;
    expect(store.syncMode.value).toBe('shared');
    expect(store.schedule.value).toHaveLength(7);
  });

  it('falls back when the shared sheet cannot be read, and stops listening to it', async () => {
    const { store, shared } = await startShared();
    shared.emitError('live', 'unavailable');

    expect(store.syncMode.value).toBe('local');
    expect(shared.isListening('schedule')).toBe(false);
  });

  it('applies changes from other phones', async () => {
    const { store, shared } = await startShared();
    shared.emit('live', { ...EMPTY_LIVE, currentItemId: 'h3', currentSetAt: at(9, 5) });
    expect(store.competition.value.delayMinutes).toBe(10);
  });
});

describe('saving', () => {
  it('applies a change right away and saves it', async () => {
    const { store, shared } = await startShared();
    store.actions.putOnFloor('h2');

    expect(store.live.value.currentItemId).toBe('h2');
    expect(shared.saved).toEqual([
      ['live', { currentItemId: 'h2', currentSetAt: at(9, 20), callbacks: {} }],
    ]);
  });

  it('reports a failed save with its reason', async () => {
    const { store, shared, notices } = await startShared();
    shared.failSavesWith = new SyncFailure('read-only', 'not_granted');
    store.actions.putOnFloor('h2');
    await settle();

    expect(notices).toEqual([{ kind: 'save-failed', code: 'read-only', detail: 'not_granted' }]);
  });

  it('keeps changes made while connecting in memory only', () => {
    const { store, local } = setup({ shared: new Promise(() => {}) });
    store.actions.addCouple('Kim', 'Lee');
    expect(store.couples.value).toHaveLength(1);
    expect(local.saved).toEqual([]);
  });
});

describe('floor and callback actions', () => {
  it('advances the floor using the clock, and does nothing past the end', async () => {
    const { store, shared } = await startShared({ now: at(8, 31) });
    store.actions.advanceFloor();
    expect(store.live.value).toMatchObject({ currentItemId: 'h0', currentSetAt: at(8, 31) });

    shared.emit('live', { ...EMPTY_LIVE, currentItemId: 'h6', currentSetAt: at(9, 10) });
    shared.saved.length = 0;
    store.actions.advanceFloor();
    expect(shared.saved).toEqual([]);
  });

  it('moves back without changing the pace', async () => {
    const { store, shared } = await startShared();
    shared.emit('live', { ...EMPTY_LIVE, currentItemId: 'h4', currentSetAt: at(9, 10) });
    store.actions.moveFloorBack();
    expect(store.live.value.currentItemId).toBe('h3');
    expect(store.competition.value.delayMinutes).toBe(10);
  });

  it('records callbacks', async () => {
    const { store } = await startShared();
    store.actions.recordCallback({
      coupleId: 'c1',
      eventNumber: 1,
      reachedRound: 4,
      eliminated: false,
    });
    expect(store.live.value.callbacks).toEqual({ c1_1: { reachedRound: 4, eliminated: false } });
    expect(store.competition.value.heatTeams.get('h3')?.dancing.map((c) => c.id)).toEqual(['c1']);
  });
});

describe('schedule actions', () => {
  it('imports a schedule, clearing the floor but keeping callbacks', async () => {
    const { store, shared } = await startShared();
    const callbacks = { c1_1: { reachedRound: 4 as const, eliminated: false } };
    shared.emit('live', { currentItemId: 'h3', currentSetAt: at(9, 5), callbacks });

    const count = store.actions.importSchedule(
      '9:00 AM [1] Bronze Amer. Smooth 1st Round (WT)\n9:10 AM Lunch',
    );
    expect(count).toBe(1);
    expect(store.schedule.value.map((item) => item.id)).toEqual(['new1', 'new2']);
    expect(store.live.value).toEqual({ currentItemId: null, currentSetAt: null, callbacks });
  });

  it('ignores an import with no heats', async () => {
    const { store, shared } = await startShared();
    expect(store.actions.importSchedule('9:10 AM Lunch')).toBe(0);
    expect(shared.saved).toEqual([]);
  });

  it('edits a line as a heat or a break, and rejects a bad time', async () => {
    const { store } = await startShared();
    expect(store.actions.editScheduleItem('h2', 'soon', 'x')).toBe('invalid-time');
    expect(store.actions.editScheduleItem('nope', '9:00 AM', 'x')).toBe('not-found');

    expect(store.actions.editScheduleItem('h2', ' 8:50 am ', '[7] Gold Amer. Smooth')).toBe(
      'saved',
    );
    expect(store.schedule.value[2]).toEqual({
      kind: 'heat',
      id: 'h2',
      scheduledTime: '8:50 AM',
      eventNumber: 7,
      name: 'Gold Amer. Smooth',
    });

    store.actions.editScheduleItem('h2', '8:50 AM', 'Coffee break');
    expect(store.schedule.value[2]).toEqual({
      kind: 'break',
      id: 'h2',
      scheduledTime: '8:50 AM',
      label: 'Coffee break',
    });
  });

  it('inserts a placeholder heat after a heat or a break', async () => {
    const { store } = await startShared();
    expect(store.actions.insertHeatAfter('h4')).toBe('new1');
    expect(store.schedule.value[5]).toEqual({
      kind: 'heat',
      id: 'new1',
      scheduledTime: '9:00 AM',
      eventNumber: 3,
      name: 'New heat',
    });

    store.actions.insertHeatAfter('h0');
    expect(store.schedule.value[1]).toMatchObject({ id: 'new2', eventNumber: 1 });
  });

  it('deletes a line', async () => {
    const { store } = await startShared();
    store.actions.deleteScheduleItem('h0');
    expect(store.schedule.value.map((item) => item.id)).not.toContain('h0');
  });
});

describe('couple and entry actions', () => {
  const couple = (store: AppStore, id: string) => store.couples.value.find((c) => c.id === id);

  it('imports couples, ignoring text with none', async () => {
    const { store } = await startShared();
    expect(store.actions.importEntries('Kim Lee\nLead Follow Level Events')).toBe(0);
    expect(store.couples.value).toHaveLength(4);
    expect(store.actions.importEntries('Kim\tLee\tBronze\tBronze I. Latin (CR)')).toBe(1);
    expect(store.couples.value.map((c) => c.id)).toEqual(['new1']);
  });

  it('adds a couple only with a lead, defaulting the follow to TBA', async () => {
    const { store } = await startShared();
    expect(store.actions.addCouple('  ', 'Lee')).toBeNull();
    expect(store.actions.addCouple(' Kim ', '')).toBe('new1');
    expect(couple(store, 'new1')).toEqual({
      id: 'new1',
      lead: 'Kim',
      follow: 'TBA',
      entries: [],
      manualMatches: [],
    });
  });

  it('renames and deletes couples', async () => {
    const { store } = await startShared();
    store.actions.renameCouple('c1', ' Chris ', ' ');
    expect(couple(store, 'c1')).toMatchObject({ lead: 'Chris', follow: 'TBA' });
    store.actions.deleteCouple('c1');
    expect(couple(store, 'c1')).toBeUndefined();
  });

  it('adds an event once, pinned to it', async () => {
    const { store } = await startShared();
    store.actions.addEntry('c4', 3);
    store.actions.addEntry('c4', 3);
    expect(couple(store, 'c4')).toMatchObject({
      entries: ['Gold Intl. Tango', 'Newcomer Intl. Cha Cha'],
      manualMatches: [{ entry: 'Newcomer Intl. Cha Cha', eventNumber: 3 }],
    });
  });

  it('pins an entry to an event by hand, and removing the entry drops the pin', async () => {
    const { store } = await startShared();
    store.actions.chooseEventForEntry('c4', 0, 2);
    store.actions.chooseEventForEntry('c4', 0, 3);
    expect(couple(store, 'c4')?.manualMatches).toEqual([
      { entry: 'Gold Intl. Tango', eventNumber: 3 },
    ]);
    expect(store.competition.value.unmatchedEntries).toEqual([]);

    store.actions.removeEntry('c4', 0);
    expect(couple(store, 'c4')).toMatchObject({ entries: [], manualMatches: [] });
  });
});

describe('alerts', () => {
  const putOnFloor = (shared: FakeSync, itemId: string) =>
    shared.emit('live', { ...EMPTY_LIVE, currentItemId: itemId, currentSetAt: at(9, 0) });

  it('chime, vibrate and publish a notice, once per alert', async () => {
    const { shared, alerts, notices } = await startShared({
      preferences: { dancer: 'Alex', alertThresholdHeats: 3 },
    });
    putOnFloor(shared, 'h1');
    putOnFloor(shared, 'h1');

    expect(alerts.played).toEqual(['chime 1', 'vibrate 250,100,250']);
    expect(notices).toEqual([
      { kind: 'alert', alert: { type: 'heads-up', heatId: 'h4', heatsAway: 3 } },
    ]);
  });

  it('respect the sound and vibration settings', async () => {
    const { shared, alerts } = await startShared({
      preferences: { dancer: 'Chris', chime: false },
    });
    putOnFloor(shared, 'h0');
    expect(alerts.played).toEqual(['vibrate 300,120,300,120,300']);
  });

  it('start over when this phone alerts for someone else or clears live tracking', async () => {
    const { store, shared, alerts } = await startShared({ preferences: { dancer: 'Chris' } });
    putOnFloor(shared, 'h0');
    store.actions.updatePreferences({ dancer: 'Brooke' });
    store.actions.updatePreferences({ dancer: 'Chris' });
    expect(alerts.played.filter((sound) => sound.startsWith('chime'))).toHaveLength(3);

    store.actions.resetLiveTracking();
    putOnFloor(shared, 'h0');
    expect(alerts.played.filter((sound) => sound.startsWith('chime'))).toHaveLength(4);
  });

  it('can be tested', async () => {
    const { store, alerts } = await startShared();
    store.actions.testAlert();
    expect(alerts.played).toEqual(['chime 2', 'vibrate 300,120,300']);
  });
});

describe('preferences', () => {
  it('are saved on this phone', async () => {
    const { store, preferences } = await startShared();
    store.actions.updatePreferences({ alertThresholdHeats: 5 });
    expect(store.preferences.value.alertThresholdHeats).toBe(5);
    expect(preferences.stored.alertThresholdHeats).toBe(5);
  });

  it('turn keep-awake back off when the browser refuses it', async () => {
    const { store, notices, wakeLock } = await startShared({ wakeLockGranted: false });
    store.actions.updatePreferences({ keepScreenAwake: true });
    await settle();

    expect(wakeLock.calls).toContain('enable');
    expect(store.preferences.value.keepScreenAwake).toBe(false);
    expect(notices).toEqual([{ kind: 'wake-lock-refused' }]);
  });
});
