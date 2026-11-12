import { describe, expect, it } from 'vitest';
import { preferencesStorage } from '../../src/infra/platform/preferencesStorage';
import { memoryStorage } from '../../src/infra/storage/keyValueStorage';

describe('preferences storage', () => {
  it('starts with the defaults', () => {
    expect(preferencesStorage(memoryStorage()).load()).toEqual({ dancer: '' });
  });

  it('saves, and ignores stored fields of the wrong type or no longer used', () => {
    const storage = memoryStorage();
    const preferences = preferencesStorage(storage);

    storage.set(
      'floorcraft:preferences',
      JSON.stringify({ dancer: 7, showPossibleHeats: false, chime: false }),
    );
    expect(preferences.load()).toEqual({ dancer: '' });

    preferences.save({ ...preferences.load(), dancer: 'Jo' });
    expect(preferencesStorage(storage).load().dancer).toBe('Jo');
  });

  it('copes with unreadable stored data', () => {
    const storage = memoryStorage({ 'floorcraft:preferences': '{not json' });
    expect(preferencesStorage(storage).load().dancer).toBe('');
  });
});
