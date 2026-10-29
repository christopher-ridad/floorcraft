import { readJson, type KeyValueStorage } from '../storage/keyValueStorage';
import { DOCUMENT_PATHS, type RawDocumentStore } from './documentSync';

const KEY_PREFIX = 'floorcraft:';
/** Where the original app kept all three documents, in one value. */
const LEGACY_KEY = 'hs:local';

/** Each version-1 document, rebuilt from the original app's single stored value. */
function readLegacyDocument(storage: KeyValueStorage, path: string): unknown {
  const legacy = readJson(storage, LEGACY_KEY);
  if (typeof legacy !== 'object' || legacy === null) return null;
  const { heats, couples, live } = legacy as Record<string, unknown>;
  if (path === DOCUMENT_PATHS.schedule) return { heats };
  if (path === DOCUMENT_PATHS.entries) return { couples };
  if (path === DOCUMENT_PATHS.live) return live ?? null;
  return null;
}

/** Documents kept on this phone only. Falls back to data saved by the original app. */
export function localDocumentStore(storage: KeyValueStorage): RawDocumentStore {
  return {
    subscribe(path, onData) {
      onData(readJson(storage, KEY_PREFIX + path) ?? readLegacyDocument(storage, path));
      return () => undefined;
    },
    async set(path, data) {
      storage.set(KEY_PREFIX + path, JSON.stringify(data));
    },
  };
}
