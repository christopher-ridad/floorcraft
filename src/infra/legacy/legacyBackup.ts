/**
 * Converts the original app's three shared documents (from the Claude artifact database) into a
 * team backup, for moving to Firebase:
 *
 *   schedule  { heats: [{ id, t, ev, name } | { id, t, label }] }
 *   entries   { couples: [{ id, lead, follow, events: string[], manual: [{ entry, ev }] }] }
 *   live      { currentId, setAt, calls }   (not carried over)
 *
 * Also reads the same documents with \`schemaVersion: 2\` field names (items, scheduledTime,
 * eventNumber, entries, manualMatches), as saved by the refactored build.
 */
import { BACKUP_FORMAT, BACKUP_VERSION, type TeamBackup } from '../../app/backup';
import { buildEventCatalog } from '../../domain/schedule/eventCatalog';
import { identifyEvents, type ScheduleLine } from '../../domain/schedule/identifyEvents';
import { findPartnership, importPartnerships } from '../../domain/team';
import { PURDUE_CLASSIC } from '../../domain/purdue';
import type { IdFactory } from '../../domain/types';

type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const records = (value: unknown): UnknownRecord[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];
const text = (value: unknown) => (typeof value === 'string' ? value : null);
const number = (value: unknown) => (typeof value === 'number' ? value : null);

export interface LegacyDocuments {
  schedule: unknown;
  entries: unknown;
}

export interface LegacyConversion {
  backup: TeamBackup;
  /** Entries that matched no event; listed so they can be added by hand after the move. */
  unmatched: { lead: string; follow: string; entry: string }[];
}

function scheduleLines(document: unknown): ScheduleLine[] {
  const raw = isRecord(document) ? (document.items ?? document.heats) : [];
  return records(raw).flatMap((item): ScheduleLine[] => {
    const id = text(item.id);
    const scheduledTime = text(item.scheduledTime ?? item.t);
    if (!id || scheduledTime === null) return [];
    const eventNumber = number(item.eventNumber ?? item.ev);
    const name = text(item.name);
    if (item.kind !== 'break' && eventNumber !== null && name !== null) {
      return [{ kind: 'heat', id, scheduledTime, eventNumber, name }];
    }
    const label = text(item.label);
    return label === null ? [] : [{ kind: 'break', id, scheduledTime, label }];
  });
}

/** Converts the documents into a backup of the Purdue Ballroom Classic, as the active competition. */
export function backupFromLegacy(
  documents: LegacyDocuments,
  createId: IdFactory,
): LegacyConversion {
  const schedule = identifyEvents(scheduleLines(documents.schedule), [], createId);
  const events = buildEventCatalog(schedule.events);

  const couples = records(isRecord(documents.entries) ? documents.entries.couples : []);
  const rows = couples.flatMap((couple) => {
    const lead = text(couple.lead);
    if (!lead) return [];
    const listed = couple.entries ?? couple.events;
    const entries = (Array.isArray(listed) ? listed : [])
      .map(text)
      .filter((entry): entry is string => !!entry);
    return [{ lead, follow: text(couple.follow) || 'TBA', entries }];
  });
  const roster = importPartnerships(rows, { dancers: [], partnerships: [] }, events, createId);

  // Entries the original app had pinned to an event by hand.
  const unmatched = roster.unmatched.filter((missing) => {
    const couple = couples.find(
      (candidate) =>
        text(candidate.lead) === missing.lead &&
        (text(candidate.follow) || 'TBA') === missing.follow,
    );
    const manual = records(couple?.manualMatches ?? couple?.manual).find(
      (match) => text(match.entry) === missing.entry,
    );
    const eventNumber = number(manual?.eventNumber ?? manual?.ev);
    const event = schedule.events.find((candidate) => candidate.eventNumber === eventNumber);
    if (!event) return true;
    const partnership = findPartnership(roster, missing.lead, missing.follow);
    if (!partnership) return true;
    const eventIds = (roster.entries[partnership.id] ??= []);
    if (!eventIds.includes(event.eventId)) eventIds.push(event.eventId);
    return false;
  });

  const competitionId = createId();
  return {
    unmatched,
    backup: {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      team: { name: '', activeCompetitionId: competitionId },
      dancers: roster.dancers,
      partnerships: roster.partnerships,
      competitions: [
        {
          info: { id: competitionId, ...PURDUE_CLASSIC, status: 'active' },
          schedule,
          entries: roster.entries,
          floor: { currentItemId: null, currentSetAt: null },
          callbacks: {},
        },
      ],
    },
  };
}
