import type { PreferencesStore } from '../../app/ports';
import { DEFAULT_PREFERENCES, type Preferences } from '../../app/preferences';
import { readJson, type KeyValueStorage } from '../storage/keyValueStorage';

const KEY = 'floorcraft:preferences';
/** The original app's key, with fields me, threshold, sound, vibrate, awake, showMaybe. */
const LEGACY_KEY = 'hs:prefs';

type StoredPreferences = { [Key in keyof Preferences]?: unknown };

function fromLegacy(legacy: Record<string, unknown>): StoredPreferences {
  return {
    dancer: legacy.me,
    alertThresholdHeats: legacy.threshold,
    chime: legacy.sound,
    vibrate: legacy.vibrate,
    keepScreenAwake: legacy.awake,
    showPossibleHeats: legacy.showMaybe,
  };
}

/** Keeps each stored field only if it has the right type. */
function withDefaults(stored: StoredPreferences): Preferences {
  const pick = <Key extends keyof Preferences>(key: Key): Preferences[Key] =>
    typeof stored[key] === typeof DEFAULT_PREFERENCES[key]
      ? (stored[key] as Preferences[Key])
      : DEFAULT_PREFERENCES[key];
  return {
    dancer: pick('dancer'),
    alertThresholdHeats: pick('alertThresholdHeats'),
    chime: pick('chime'),
    vibrate: pick('vibrate'),
    keepScreenAwake: pick('keepScreenAwake'),
    showPossibleHeats: pick('showPossibleHeats'),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export function preferencesStorage(storage: KeyValueStorage): PreferencesStore {
  return {
    load() {
      const stored = readJson(storage, KEY);
      if (isRecord(stored)) return withDefaults(stored);
      const legacy = readJson(storage, LEGACY_KEY);
      return withDefaults(isRecord(legacy) ? fromLegacy(legacy) : {});
    },
    save(preferences) {
      storage.set(KEY, JSON.stringify(preferences));
    },
  };
}
