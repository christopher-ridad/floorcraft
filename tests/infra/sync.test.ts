import { describe, expect, it } from 'vitest';
import { SyncFailure, type SyncErrorCode } from '../../src/app/ports';
import { preferencesStorage } from '../../src/infra/platform/preferencesStorage';
import { memoryStorage } from '../../src/infra/storage/keyValueStorage';
import { createDocumentSync, type RawDocumentStore } from '../../src/infra/sync/documentSync';
import { localDocumentStore } from '../../src/infra/sync/localDocumentStore';

/** A raw store whose writes finish only when the test says so. */
function controllableStore() {
  const writes: { path: string; data: object; finish(error?: unknown): void }[] = [];
  let emitError: (error: unknown) => void = () => {};
  const store: RawDocumentStore = {
    subscribe(_path, onData, onError) {
      onData(null);
      emitError = onError;
      return () => undefined;
    },
    set: (path, data) =>
      new Promise((resolve, reject) => {
        writes.push({ path, data, finish: (error) => (error ? reject(error) : resolve()) });
      }),
  };
  return { store, writes, emitError: (error: unknown) => emitError(error) };
}

const live = (currentItemId: string) => ({ currentItemId, currentSetAt: null, callbacks: {} });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('document sync', () => {
  it('writes each document to its shared path in the current format', async () => {
    const { store, writes } = controllableStore();
    void createDocumentSync(store, 'shared').save('entries', []);
    await flush();
    expect(writes.map(({ path, data }) => [path, data])).toEqual([
      ['comp/entries', { schemaVersion: 2, couples: [] }],
    ]);
  });

  it('saves to one document in order, even after a failure', async () => {
    const { store, writes } = controllableStore();
    const sync = createDocumentSync(store, 'shared');
    const first = sync.save('live', live('a'));
    const second = sync.save('live', live('b'));
    await flush();
    expect(writes).toHaveLength(1);

    writes[0]?.finish({ code: 'network_error' });
    await expect(first).rejects.toBeInstanceOf(SyncFailure);
    await flush();
    expect(writes).toHaveLength(2);
    writes[1]?.finish();
    await expect(second).resolves.toBeUndefined();
  });

  it.each([
    ['not_granted', 'read-only'],
    ['revoked', 'read-only'],
    ['quota_exceeded', 'quota-exceeded'],
    ['timeout', 'network'],
  ])('reports a %s write error as %s', async (code, expected) => {
    const { store, writes } = controllableStore();
    const save = createDocumentSync(store, 'shared').save('schedule', []);
    await flush();
    writes[0]?.finish({ code, message: `failed: ${code}` });
    await expect(save).rejects.toMatchObject({ code: expected, message: `failed: ${code}` });
  });

  it.each([
    ['not_granted', 'unavailable'],
    ['capability_disabled', 'unavailable'],
    ['timeout', 'network'],
  ])('reports a %s read error as %s', (code, expected) => {
    const { store, emitError } = controllableStore();
    const errors: SyncErrorCode[] = [];
    createDocumentSync(store, 'shared').subscribe(
      'live',
      () => {},
      (error) => errors.push(error),
    );
    emitError({ code });
    expect(errors).toEqual([expected]);
  });
});

describe('this-phone-only storage', () => {
  const read = (sync: ReturnType<typeof createDocumentSync>) => {
    const values: unknown[] = [];
    for (const name of ['schedule', 'entries', 'live'] as const) {
      sync.subscribe(
        name,
        (value) => values.push(value),
        () => {},
      );
    }
    return values;
  };

  it('reads data saved by the original app', () => {
    const storage = memoryStorage({
      'hs:local': JSON.stringify({
        heats: [{ id: 'b1', t: '8:30 AM', label: 'Smooth Events' }],
        couples: [{ id: 'c1', lead: 'Kim', follow: 'Lee', events: [], manual: [] }],
        live: { currentId: 'b1', setAt: 5, calls: {} },
      }),
    });
    expect(read(createDocumentSync(localDocumentStore(storage), 'local'))).toEqual([
      [{ kind: 'break', id: 'b1', scheduledTime: '8:30 AM', label: 'Smooth Events' }],
      [{ id: 'c1', lead: 'Kim', follow: 'Lee', entries: [], manualMatches: [] }],
      { currentItemId: 'b1', currentSetAt: 5, callbacks: {} },
    ]);
  });

  it('prefers data saved in the new format', async () => {
    const storage = memoryStorage({ 'hs:local': JSON.stringify({ heats: [], couples: [] }) });
    const sync = createDocumentSync(localDocumentStore(storage), 'local');
    await sync.save('live', live('h9'));

    expect(storage.get('floorcraft:comp/live')).toBe(
      JSON.stringify({ schemaVersion: 2, currentItemId: 'h9', currentSetAt: null, callbacks: {} }),
    );
    expect(read(sync)[2]).toEqual(live('h9'));
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
      alertThresholdHeats: 5,
      chime: false,
      vibrate: true,
      keepScreenAwake: true,
      showPossibleHeats: false,
    });
  });

  it('saves in the new format and ignores fields with the wrong type', () => {
    const storage = memoryStorage();
    const preferences = preferencesStorage(storage);
    expect(preferences.load().alertThresholdHeats).toBe(3);

    storage.set('floorcraft:preferences', JSON.stringify({ dancer: 7, chime: false }));
    expect(preferences.load()).toMatchObject({ dancer: '', chime: false });

    preferences.save({ ...preferences.load(), dancer: 'Jo' });
    expect(preferencesStorage(storage).load().dancer).toBe('Jo');
  });
});
