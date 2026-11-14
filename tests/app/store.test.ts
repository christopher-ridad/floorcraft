import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppStore } from '../../src/app/store';
import { preferencesStorage } from '../../src/infra/platform/preferencesStorage';
import { memoryStorage } from '../../src/infra/storage/keyValueStorage';

const onTheDay = (hours: number, minutes: number) =>
  new Date(2026, 10, 14, hours, minutes).getTime();

afterEach(() => vi.useRealTimers());

function start(now: number) {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const storage = memoryStorage();
  const store = createAppStore({
    preferences: preferencesStorage(storage),
    clock: { now: () => Date.now() },
  });
  const stop = store.start();
  return { store, storage, stop };
}

describe('the store', () => {
  it('builds the schedule and team from the built-in data', () => {
    const { store, stop } = start(onTheDay(7, 0));
    expect(store.competition.value.couples).toHaveLength(20);
    expect(store.competition.value.currentIndex).toBe(-1);
    stop();
  });

  it('moves "now" along the schedule as time passes', () => {
    const { store, stop } = start(onTheDay(8, 17));
    const current = () => store.competition.value.schedule[store.competition.value.currentIndex];
    expect(current()).toMatchObject({ scheduledTime: '8:07 AM' });

    vi.advanceTimersByTime(60_000);
    expect(current()).toMatchObject({ scheduledTime: '8:18 AM' });
    stop();
  });

  it('remembers who this device follows', () => {
    const { store, storage, stop } = start(onTheDay(7, 0));
    store.updatePreferences({ dancer: 'Chris' });
    expect(store.preferences.value.dancer).toBe('Chris');
    expect(preferencesStorage(storage).load().dancer).toBe('Chris');
    stop();
  });
});
