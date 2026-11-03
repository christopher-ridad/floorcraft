import { dancerName } from './dancers';
import { matchEntry } from './entries/matchEntry';
import type { PartnershipRow } from './entries/parsePartnershipRows';
import type { EventCatalog } from './schedule/eventCatalog';
import type { Couple, Dancer, IdFactory, Partnership } from './types';

/** Shown for a partner who hasn't been announced. */
export const TO_BE_ANNOUNCED = 'TBA';

const nameKey = (name: string) => dancerName(name).toLowerCase();
const isToBeAnnounced = (name: string) => !name.trim() || nameKey(name) === 'tba';

/** The team's active partnerships with their dancers' names, alphabetical by lead then follow. */
export function resolveCouples(
  dancers: readonly Dancer[],
  partnerships: readonly Partnership[],
): Couple[] {
  const names = new Map(dancers.map((dancer) => [dancer.id, dancer.name]));
  const nameOf = (id: string | null) => (id && names.get(id)) || TO_BE_ANNOUNCED;
  return partnerships
    .filter((partnership) => partnership.active)
    .map((partnership) => ({
      id: partnership.id,
      lead: nameOf(partnership.leadId),
      follow: nameOf(partnership.followId),
    }))
    .sort((a, b) => a.lead.localeCompare(b.lead) || a.follow.localeCompare(b.follow));
}

/**
 * Looks up dancers by name, ignoring case and notes like `(TBA)`, adding any that are new.
 * `TBA` or a blank name is no dancer (null).
 */
export function createDancerDirectory(existing: readonly Dancer[], createId: IdFactory) {
  const dancers = [...existing];
  const byName = new Map(dancers.map((dancer) => [nameKey(dancer.name), dancer]));
  return {
    dancers,
    idFor(name: string): string | null {
      if (isToBeAnnounced(name)) return null;
      const found = byName.get(nameKey(name));
      if (found) return found.id;
      const dancer: Dancer = { id: createId(), name: name.trim(), active: true };
      dancers.push(dancer);
      byName.set(nameKey(name), dancer);
      return dancer.id;
    },
  };
}

export interface UnmatchedEntry {
  lead: string;
  follow: string;
  entry: string;
}

export interface PartnershipImport {
  /** Every dancer, existing and new. */
  dancers: Dancer[];
  /** Every partnership: those in the rows active, all others inactive. */
  partnerships: Partnership[];
  /** This competition's entries for the active partnerships. */
  entries: Record<string, string[]>;
  /** Entries that match no event on the schedule. */
  unmatched: UnmatchedEntry[];
}

/**
 * Turns partnership spreadsheet rows into the team's partnerships and this competition's entries.
 * Dancers and partnerships that already exist keep their ids (so callbacks and history stay
 * attached); partnerships missing from the rows become inactive rather than being deleted.
 */
export function importPartnerships(
  rows: readonly PartnershipRow[],
  team: { dancers: readonly Dancer[]; partnerships: readonly Partnership[] },
  events: EventCatalog,
  createId: IdFactory,
): PartnershipImport {
  const directory = createDancerDirectory(team.dancers, createId);
  const partnerships = team.partnerships.map((partnership) => ({ ...partnership, active: false }));
  const entries: Record<string, string[]> = {};
  const unmatched: UnmatchedEntry[] = [];

  for (const row of rows) {
    const leadId = directory.idFor(row.lead);
    const followId = directory.idFor(row.follow);
    let partnership = partnerships.find(
      (candidate) => candidate.leadId === leadId && candidate.followId === followId,
    );
    if (!partnership) {
      partnership = { id: createId(), leadId, followId, active: true };
      partnerships.push(partnership);
    }
    partnership.active = true;

    const eventIds = (entries[partnership.id] ??= []);
    for (const entry of row.entries) {
      const eventId = matchEntry(entry, events);
      if (eventId === null) unmatched.push({ lead: row.lead, follow: row.follow, entry });
      else if (!eventIds.includes(eventId)) eventIds.push(eventId);
    }
  }

  const activeDancerIds = new Set(
    partnerships
      .filter((partnership) => partnership.active)
      .flatMap((partnership) => [partnership.leadId, partnership.followId]),
  );
  const dancers = directory.dancers.map((dancer) =>
    activeDancerIds.has(dancer.id) ? { ...dancer, active: true } : dancer,
  );
  return { dancers, partnerships, entries, unmatched };
}

/** The partnership between two dancers, found by name, if there is one. */
export function findPartnership(
  team: { dancers: readonly Dancer[]; partnerships: readonly Partnership[] },
  lead: string,
  follow: string,
): Partnership | undefined {
  const idOf = (name: string) =>
    isToBeAnnounced(name)
      ? null
      : (team.dancers.find((dancer) => nameKey(dancer.name) === nameKey(name))?.id ?? undefined);
  const leadId = idOf(lead);
  const followId = idOf(follow);
  if (leadId === undefined || followId === undefined) return undefined;
  return team.partnerships.find(
    (partnership) => partnership.leadId === leadId && partnership.followId === followId,
  );
}
