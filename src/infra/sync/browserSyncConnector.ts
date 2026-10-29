import type { SyncConnector } from '../../app/ports';
import type { KeyValueStorage } from '../storage/keyValueStorage';
import { claudeDocumentStore, connectClaudeDatabase } from './claudeDocumentStore';
import { createDocumentSync } from './documentSync';
import { localDocumentStore } from './localDocumentStore';

/**
 * Shared mode uses the Claude artifact database. To use another backend (Firebase, Supabase, …),
 * implement RawDocumentStore for it and connect it here.
 */
export function browserSyncConnector(storage: KeyValueStorage): SyncConnector {
  return {
    async connectShared() {
      const database = await connectClaudeDatabase();
      return database ? createDocumentSync(claudeDocumentStore(database), 'shared') : null;
    },
    createLocal: () => createDocumentSync(localDocumentStore(storage), 'local'),
  };
}
