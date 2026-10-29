import type { RawDocumentStore } from './documentSync';

/** The parts of the Claude artifact database (`window.claude.use('db')`) the app uses. */
export interface ClaudeDatabase {
  doc(path: string): {
    onSnapshot(
      onNext: (snapshot: { exists: boolean; data(): unknown }) => void,
      onError?: (error: unknown) => void,
    ): unknown;
    set(data: object): Promise<void>;
  };
}

interface ClaudeRuntime {
  use?(capability: 'db'): Promise<ClaudeDatabase | null | undefined>;
}

/** The shared database when the page runs as a Claude artifact with it enabled, else null. */
export async function connectClaudeDatabase(): Promise<ClaudeDatabase | null> {
  const runtime = (globalThis as { claude?: ClaudeRuntime }).claude;
  try {
    return (await runtime?.use?.('db')) ?? null;
  } catch {
    return null;
  }
}

export function claudeDocumentStore(database: ClaudeDatabase): RawDocumentStore {
  return {
    subscribe(path, onData, onError) {
      const unsubscribe = database
        .doc(path)
        .onSnapshot((snapshot) => onData(snapshot.exists ? snapshot.data() : null), onError);
      return typeof unsubscribe === 'function' ? () => void unsubscribe() : () => undefined;
    },
    set: (path, data) => database.doc(path).set(data),
  };
}
