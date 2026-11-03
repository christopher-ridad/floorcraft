import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  readBackup,
  type CompetitionBackup,
  type TeamBackup,
} from '../../app/backup';
import type {
  CompetitionSnapshot,
  HeatSheetRepository,
  TeamInfo,
  TeamSnapshot,
} from '../../app/ports';
import { readJson, type KeyValueStorage } from '../storage/keyValueStorage';

const STORAGE_KEY = 'floorcraft:team';

/** Keeps items with these ids replaced by the new ones, and adds the rest, in order. */
function upsert<Item extends { id: string }>(
  items: readonly Item[],
  updates: readonly Item[],
): Item[] {
  const byId = new Map(updates.map((item) => [item.id, item]));
  const kept = items.map((item) => byId.get(item.id) ?? item);
  const known = new Set(items.map((item) => item.id));
  return [...kept, ...updates.filter((item) => !known.has(item.id))];
}

const emptyCompetition = (info: CompetitionBackup['info']): CompetitionBackup => ({
  info,
  schedule: { items: [], events: [] },
  entries: {},
  floor: { currentItemId: null, currentSetAt: null },
  callbacks: {},
});

const emptyBackup = (): TeamBackup => ({
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  exportedAt: new Date(0).toISOString(),
  team: { name: '', activeCompetitionId: null },
  dancers: [],
  partnerships: [],
  competitions: [],
});

/**
 * The team's data kept on this phone only, in the backup format. Used for tests, and to run the
 * app without a Firebase connection. Everyone counts as a captain.
 */
export function localRepository(
  storage: KeyValueStorage,
  { seed }: { seed?: TeamBackup } = {},
): HeatSheetRepository & { exportBackup(): TeamBackup } {
  let data: TeamBackup = (() => {
    try {
      const stored = readJson(storage, STORAGE_KEY);
      if (stored) return readBackup(stored);
    } catch {
      // Unreadable data: start over rather than fail.
    }
    return seed ?? emptyBackup();
  })();

  const teamListeners = new Set<(snapshot: TeamSnapshot) => void>();
  const competitionListeners = new Map<string, Set<(snapshot: CompetitionSnapshot) => void>>();

  const teamSnapshot = (): TeamSnapshot => ({
    // A team exists once it has a name.
    team: data.team.name
      ? {
          name: data.team.name,
          captainUids: [],
          activeCompetitionId: data.team.activeCompetitionId,
        }
      : null,
    dancers: data.dancers,
    partnerships: data.partnerships,
    competitions: data.competitions.map((competition) => competition.info),
  });
  const competitionSnapshot = (competitionId: string): CompetitionSnapshot => {
    const competition = data.competitions.find((candidate) => candidate.info.id === competitionId);
    const { schedule, entries, floor, callbacks } =
      competition ??
      emptyCompetition({
        id: competitionId,
        name: '',
        date: '',
        status: 'setup',
      });
    return { schedule, entries, floor, callbacks };
  };

  function commit(next: TeamBackup) {
    data = next;
    storage.set(STORAGE_KEY, JSON.stringify(data));
    for (const listener of teamListeners) listener(teamSnapshot());
    for (const [competitionId, listeners] of competitionListeners) {
      for (const listener of listeners) listener(competitionSnapshot(competitionId));
    }
  }

  function updateCompetition(
    competitionId: string,
    change: (competition: CompetitionBackup) => CompetitionBackup,
  ) {
    const exists = data.competitions.some((competition) => competition.info.id === competitionId);
    if (!exists) throw new Error(`No competition ${competitionId}`);
    commit({
      ...data,
      competitions: data.competitions.map((competition) =>
        competition.info.id === competitionId ? change(competition) : competition,
      ),
    });
  }

  return {
    isShared: false,

    watchTeam(onChange) {
      teamListeners.add(onChange);
      onChange(teamSnapshot());
      return () => teamListeners.delete(onChange);
    },

    watchCompetition(competitionId, onChange) {
      const listeners = competitionListeners.get(competitionId) ?? new Set();
      competitionListeners.set(competitionId, listeners);
      listeners.add(onChange);
      onChange(competitionSnapshot(competitionId));
      return () => listeners.delete(onChange);
    },

    async updateTeam(change: Partial<TeamInfo>) {
      const { name = data.team.name, activeCompetitionId = data.team.activeCompetitionId } = change;
      commit({ ...data, team: { name, activeCompetitionId } });
    },

    async saveDancers(dancers) {
      commit({ ...data, dancers: upsert(data.dancers, dancers) });
    },

    async savePartnerships(partnerships) {
      commit({ ...data, partnerships: upsert(data.partnerships, partnerships) });
    },

    async saveCompetition(info) {
      const existing = data.competitions.find((competition) => competition.info.id === info.id);
      const competitions = existing
        ? data.competitions.map((competition) =>
            competition.info.id === info.id ? { ...competition, info } : competition,
          )
        : [...data.competitions, emptyCompetition(info)];
      commit({ ...data, competitions });
    },

    async saveSchedule(competitionId, schedule) {
      updateCompetition(competitionId, (competition) => ({ ...competition, schedule }));
    },

    async saveEntries(competitionId, entries) {
      updateCompetition(competitionId, (competition) => ({
        ...competition,
        entries: { ...competition.entries, ...entries },
      }));
    },

    async saveFloor(competitionId, floor) {
      updateCompetition(competitionId, (competition) => ({ ...competition, floor }));
    },

    async saveCallback(competitionId, key, mark) {
      updateCompetition(competitionId, (competition) => {
        const callbacks = Object.fromEntries(
          Object.entries(competition.callbacks).filter(([markKey]) => markKey !== key),
        );
        return { ...competition, callbacks: mark ? { ...callbacks, [key]: mark } : callbacks };
      });
    },

    async clearLive(competitionId) {
      updateCompetition(competitionId, (competition) => ({
        ...competition,
        floor: { currentItemId: null, currentSetAt: null },
        callbacks: {},
      }));
    },

    exportBackup: () => ({ ...data, exportedAt: new Date().toISOString() }),
  };
}
