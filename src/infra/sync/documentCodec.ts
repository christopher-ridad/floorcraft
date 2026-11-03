/**
 * The stored document format, and reading every older format.
 *
 * Version 1 (the original app, no `schemaVersion`):
 *   schedule  { heats: [{ id, t, ev, name } | { id, t, label }] }
 *   entries   { couples: [{ id, lead, follow, events, manual: [{ entry, ev }] }] }
 *   live      { currentId, setAt, calls: { [coupleId_ev]: { reach, cut? } } }
 * Version 2 stores the domain types as they are, plus `schemaVersion`.
 *
 * Decoding is forgiving: malformed items are dropped rather than failing the whole document,
 * since one bad edit from an old client shouldn't blank everyone's heat sheet.
 */
import type { CompetitionDocuments, DocumentName } from '../../app/ports';
import type {
  CallbackMark,
  Couple,
  LiveState,
  ManualMatch,
  Round,
  ScheduleItem,
} from '../../domain/types';

export const SCHEMA_VERSION = 2;

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const isRound = (value: unknown): value is Round =>
  value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
const compact = <T>(values: (T | null)[]): T[] => values.filter((value) => value !== null);

function decodeScheduleItem(raw: unknown): ScheduleItem | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  const scheduledTime = asString(raw.scheduledTime ?? raw.t);
  if (!id || scheduledTime === null) return null;

  const eventNumber = asNumber(raw.eventNumber ?? raw.ev);
  const name = asString(raw.name);
  if (raw.kind !== 'break' && eventNumber !== null && name !== null) {
    return { kind: 'heat', id, scheduledTime, eventNumber, name };
  }
  const label = asString(raw.label);
  return label === null ? null : { kind: 'break', id, scheduledTime, label };
}

function decodeManualMatch(raw: unknown): ManualMatch | null {
  if (!isRecord(raw)) return null;
  const entry = asString(raw.entry);
  const eventNumber = asNumber(raw.eventNumber ?? raw.ev);
  return entry === null || eventNumber === null ? null : { entry, eventNumber };
}

function decodeCouple(raw: unknown): Couple | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  const lead = asString(raw.lead);
  if (!id || lead === null) return null;
  return {
    id,
    lead,
    follow: asString(raw.follow) || 'TBA',
    entries: compact(asArray(raw.entries ?? raw.events).map(asString)),
    manualMatches: compact(asArray(raw.manualMatches ?? raw.manual).map(decodeManualMatch)),
  };
}

function decodeCallbackMark(raw: unknown): CallbackMark | null {
  if (!isRecord(raw)) return null;
  const reachedRound = raw.reachedRound ?? raw.reach;
  if (!isRound(reachedRound)) return null;
  const eliminated =
    typeof raw.eliminated === 'boolean'
      ? raw.eliminated
      : raw.cut !== undefined && raw.cut !== null;
  return { reachedRound, eliminated };
}

function decodeLive(raw: UnknownRecord): LiveState {
  const marks = raw.callbacks ?? raw.calls;
  const callbacks: Record<string, CallbackMark> = {};
  if (isRecord(marks)) {
    for (const [key, value] of Object.entries(marks)) {
      const mark = decodeCallbackMark(value);
      if (mark) callbacks[key] = mark;
    }
  }
  return {
    currentItemId: asString(raw.currentItemId ?? raw.currentId),
    currentSetAt: asNumber(raw.currentSetAt ?? raw.setAt),
    callbacks,
  };
}

interface Codec<Value> {
  decode(raw: UnknownRecord): Value;
  encode(value: Value): UnknownRecord;
}

const codecs: { [Name in DocumentName]: Codec<CompetitionDocuments[Name]> } = {
  schedule: {
    decode: (raw) => compact(asArray(raw.items ?? raw.heats).map(decodeScheduleItem)),
    encode: (items) => ({ items }),
  },
  entries: {
    decode: (raw) => compact(asArray(raw.couples).map(decodeCouple)),
    encode: (couples) => ({ couples }),
  },
  live: {
    decode: decodeLive,
    encode: ({ currentItemId, currentSetAt, callbacks }) => ({
      currentItemId,
      currentSetAt,
      callbacks,
    }),
  },
};

/** Reads a stored document in any version. A missing document reads as empty. */
export function decodeDocument<Name extends DocumentName>(
  name: Name,
  raw: unknown,
): CompetitionDocuments[Name] {
  return codecs[name].decode(isRecord(raw) ? raw : {});
}

/** The current stored form of a document: plain JSON with `schemaVersion`. */
export function encodeDocument<Name extends DocumentName>(
  name: Name,
  value: CompetitionDocuments[Name],
): UnknownRecord {
  const encoded = { schemaVersion: SCHEMA_VERSION, ...codecs[name].encode(value) };
  return JSON.parse(JSON.stringify(encoded)) as UnknownRecord;
}
