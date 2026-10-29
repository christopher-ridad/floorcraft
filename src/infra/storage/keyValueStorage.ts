/** String key-value storage. Reads and writes never throw. */
export interface KeyValueStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/**
 * The browser's localStorage. It can be missing or throw (private windows, blocked site data),
 * in which case reads come back empty and writes are dropped.
 */
export function browserStorage(): KeyValueStorage {
  return {
    get(key) {
      try {
        return globalThis.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        globalThis.localStorage.setItem(key, value);
      } catch {
        // Storage is full or unavailable: this phone just won't remember the change.
      }
    },
  };
}

export function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const values = new Map(Object.entries(initial));
  return {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => void values.set(key, value),
  };
}

export function readJson(storage: KeyValueStorage, key: string): unknown {
  const text = storage.get(key);
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
