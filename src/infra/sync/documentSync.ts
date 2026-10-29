import {
  SyncFailure,
  type CompetitionSync,
  type DocumentName,
  type SyncErrorCode,
} from '../../app/ports';
import { decodeDocument, encodeDocument } from './documentCodec';

/** A JSON document store addressed by path, such as the Claude artifact database. */
export interface RawDocumentStore {
  /** Calls `onData` with the stored data (null when missing), now and on every change. */
  subscribe(
    path: string,
    onData: (data: unknown) => void,
    onError: (error: unknown) => void,
  ): () => void;
  set(path: string, data: object): Promise<void>;
}

/** Where each document lives. These paths are shared with every phone, old versions included. */
export const DOCUMENT_PATHS: Readonly<Record<DocumentName, string>> = {
  schedule: 'comp/schedule',
  entries: 'comp/entries',
  live: 'comp/live',
};

/** Reads a field from an error, which may be an Error or a plain `{ code, message }` object. */
function errorField(error: unknown, field: 'code' | 'message'): string {
  if (typeof error !== 'object' || error === null || !(field in error)) return '';
  return String((error as Record<typeof field, unknown>)[field]);
}
const errorCode = (error: unknown) => errorField(error, 'code');
const errorMessage = (error: unknown) =>
  errorField(error, 'message') || errorCode(error) || String(error);

function readErrorCode(error: unknown): SyncErrorCode {
  const code = errorCode(error);
  return code === 'not_granted' || code === 'capability_disabled' ? 'unavailable' : 'network';
}

function writeErrorCode(error: unknown): SyncErrorCode {
  const code = errorCode(error);
  if (code === 'not_granted' || code === 'revoked') return 'read-only';
  if (code === 'quota_exceeded') return 'quota-exceeded';
  return 'network';
}

/** Adapts a raw document store: stored format in and out, error codes, ordered saves. */
export function createDocumentSync(
  store: RawDocumentStore,
  mode: CompetitionSync['mode'],
): CompetitionSync {
  const pendingWrites: Record<DocumentName, Promise<void>> = {
    schedule: Promise.resolve(),
    entries: Promise.resolve(),
    live: Promise.resolve(),
  };

  return {
    mode,

    subscribe(name, onChange, onError) {
      return store.subscribe(
        DOCUMENT_PATHS[name],
        (data) => onChange(decodeDocument(name, data)),
        (error) => onError(readErrorCode(error)),
      );
    },

    save(name, value) {
      const body = encodeDocument(name, value);
      const write = pendingWrites[name]
        .then(() => store.set(DOCUMENT_PATHS[name], body))
        .catch((error: unknown) => {
          throw new SyncFailure(writeErrorCode(error), errorMessage(error));
        });
      pendingWrites[name] = write.catch(() => undefined);
      return write;
    },
  };
}
