/**
 * A whole team as one JSON file: for backups, for moving data between stores, and for migrating
 * data from the original app. Captains and sign-in details are not included.
 */
import type {
  CallbackMarks,
  CompetitionInfo,
  Dancer,
  Entries,
  FloorState,
  Partnership,
  Schedule,
} from '../domain/types';

export const BACKUP_FORMAT = 'floorcraft-team-backup';
export const BACKUP_VERSION = 1;

export interface CompetitionBackup {
  info: CompetitionInfo;
  schedule: Schedule;
  entries: Entries;
  floor: FloorState;
  callbacks: CallbackMarks;
}

export interface TeamBackup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  /** ISO timestamp. */
  exportedAt: string;
  team: { name: string; activeCompetitionId: string | null };
  dancers: Dancer[];
  partnerships: Partnership[];
  competitions: CompetitionBackup[];
}

export class InvalidBackup extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBackup';
  }
}

type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function expect(condition: unknown, problem: string): asserts condition {
  if (!condition) throw new InvalidBackup(problem);
}

/**
 * Checks that parsed JSON is a team backup this version understands. Checks the shape of the
 * file and of each record's identifying fields, not every value.
 */
export function readBackup(json: unknown): TeamBackup {
  expect(isRecord(json) && json.format === BACKUP_FORMAT, 'This is not a team backup file.');
  expect(
    json.version === BACKUP_VERSION,
    `Backup version ${String(json.version)} isn't supported.`,
  );
  expect(isRecord(json.team) && typeof json.team.name === 'string', 'The backup has no team.');
  for (const field of ['dancers', 'partnerships', 'competitions'] as const) {
    expect(Array.isArray(json[field]), `The backup has no ${field} list.`);
  }
  const lists = json as unknown as Pick<TeamBackup, 'dancers' | 'partnerships' | 'competitions'>;
  expect(
    lists.dancers.every((dancer) => isRecord(dancer) && typeof dancer.id === 'string'),
    'A dancer in the backup has no id.',
  );
  expect(
    lists.partnerships.every(
      (partnership) => isRecord(partnership) && typeof partnership.id === 'string',
    ),
    'A partnership in the backup has no id.',
  );
  expect(
    lists.competitions.every(
      (competition) =>
        isRecord(competition) &&
        isRecord(competition.info) &&
        typeof competition.info.id === 'string' &&
        isRecord(competition.schedule) &&
        Array.isArray(competition.schedule.items) &&
        Array.isArray(competition.schedule.events),
    ),
    'A competition in the backup is incomplete.',
  );
  return json as unknown as TeamBackup;
}
