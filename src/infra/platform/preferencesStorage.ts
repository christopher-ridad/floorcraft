import { DEFAULT_PREFERENCES, type Preferences } from '../../app/preferences';
import type { PreferencesStore } from '../../app/store';
import { readJson, type KeyValueStorage } from '../storage/keyValueStorage';

const KEY = 'floorcraft:preferences';

/** Keeps each stored field only if it has the right type. */
function withDefaults(stored: Record<string, unknown>): Preferences {
  const pick = <Key extends keyof Preferences>(key: Key): Preferences[Key] =>
    typeof stored[key] === typeof DEFAULT_PREFERENCES[key]
      ? (stored[key] as Preferences[Key])
      : DEFAULT_PREFERENCES[key];
  return { dancer: pick('dancer'), showPossibleHeats: pick('showPossibleHeats') };
}

/** This device's settings, in browser storage. */
export function preferencesStorage(storage: KeyValueStorage): PreferencesStore {
  return {
    load() {
      const stored = readJson(storage, KEY);
      return withDefaults(typeof stored === 'object' && stored !== null ? { ...stored } : {});
    },
    save(preferences) {
      storage.set(KEY, JSON.stringify(preferences));
    },
  };
}
