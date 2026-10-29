import { callbackKey, callbackStatus } from './callbacks';
import { minutesSinceMidnight, parseClockTime } from './clock';
import { dancerName } from './dancers';
import { matchEntry } from './entries/matchEntry';
import { roundsByEvent, type RoundsByEvent } from './rounds';
import { buildEventCatalog, type EventCatalog } from './schedule/eventCatalog';
import { parseHeatName, type HeatName } from './schedule/heatName';
import type { Couple, LiveState, Round, ScheduleItem } from './types';

/** A delay this large means the floor was set on another day, so it is ignored. */
const MAX_PLAUSIBLE_DELAY_MINUTES = 600;

export interface CompetitionState {
  schedule: readonly ScheduleItem[];
  couples: readonly Couple[];
  live: LiveState;
}

export interface EntryMatch {
  entry: string;
  /** The matched event, or null when the entry matches nothing on the schedule. */
  eventNumber: number | null;
  isManual: boolean;
}

export interface UnmatchedEntry {
  couple: Couple;
  entry: string;
}

export interface ItemInfo {
  index: number;
  scheduledMinutes: number | null;
  /** Parsed name for heats; null for breaks. */
  heatName: HeatName | null;
}

/** The team's couples in one heat, by callback status. */
export interface HeatTeam {
  dancing: Couple[];
  possible: Couple[];
  eliminated: Couple[];
  firstRound: Round;
}

export interface DancerSummary {
  confirmedHeats: number;
  possibleHeats: number;
}

/** Everything the app shows, derived from the stored state. */
export interface Competition extends CompetitionState {
  events: EventCatalog;
  rounds: RoundsByEvent;
  /** Each couple's entries with the event they matched, keyed by couple id. */
  entryMatches: ReadonlyMap<string, readonly EntryMatch[]>;
  unmatchedEntries: readonly UnmatchedEntry[];
  /** Position and parsed details of each schedule item, keyed by item id. */
  items: ReadonlyMap<string, ItemInfo>;
  /** Team couples in each heat, keyed by heat id. */
  heatTeams: ReadonlyMap<string, HeatTeam>;
  /** Index of the item on the floor, or -1 before the competition starts. */
  currentIndex: number;
  /** How far behind (positive) or ahead (negative) of schedule the floor is, in minutes. */
  delayMinutes: number;
  /** Each team dancer's heat counts, keyed by display name. */
  dancers: ReadonlyMap<string, DancerSummary>;
}

export function deriveCompetition(state: CompetitionState): Competition {
  const { schedule, couples, live } = state;
  const events = buildEventCatalog(schedule);
  const rounds = roundsByEvent(schedule);
  const { entryMatches, unmatchedEntries } = matchAllEntries(couples, events);
  const items = describeItems(schedule);

  const heatTeams = new Map<string, HeatTeam>();
  for (const item of schedule) {
    if (item.kind !== 'heat') continue;
    const round = items.get(item.id)?.heatName?.round ?? 5;
    const first = rounds.get(item.eventNumber)?.[0] ?? round;
    const team: HeatTeam = { dancing: [], possible: [], eliminated: [], firstRound: first };
    for (const couple of couples) {
      const isEntered = entryMatches
        .get(couple.id)
        ?.some((match) => match.eventNumber === item.eventNumber);
      if (!isEntered) continue;
      const mark = live.callbacks[callbackKey(couple.id, item.eventNumber)];
      const status = callbackStatus(mark, round, first);
      team[status].push(couple);
    }
    heatTeams.set(item.id, team);
  }

  const currentIndex = live.currentItemId
    ? schedule.findIndex((item) => item.id === live.currentItemId)
    : -1;
  const current = schedule[currentIndex];
  const delayMinutes = current
    ? computeDelay(items.get(current.id)?.scheduledMinutes ?? null, live.currentSetAt)
    : 0;

  return {
    ...state,
    events,
    rounds,
    entryMatches,
    unmatchedEntries,
    items,
    heatTeams,
    currentIndex,
    delayMinutes,
    dancers: summarizeDancers(couples, heatTeams),
  };
}

function matchAllEntries(couples: readonly Couple[], events: EventCatalog) {
  const entryMatches = new Map<string, EntryMatch[]>();
  const unmatchedEntries: UnmatchedEntry[] = [];
  for (const couple of couples) {
    const matches = couple.entries.map((entry): EntryMatch => {
      const manual = couple.manualMatches.find((match) => match.entry === entry);
      const eventNumber = manual ? manual.eventNumber : matchEntry(entry, events);
      const isScheduled = eventNumber !== null && events.has(eventNumber);
      if (!isScheduled) unmatchedEntries.push({ couple, entry });
      return { entry, eventNumber: isScheduled ? eventNumber : null, isManual: !!manual };
    });
    entryMatches.set(couple.id, matches);
  }
  return { entryMatches, unmatchedEntries };
}

function describeItems(schedule: readonly ScheduleItem[]): Map<string, ItemInfo> {
  const items = new Map<string, ItemInfo>();
  schedule.forEach((item, index) => {
    items.set(item.id, {
      index,
      scheduledMinutes: parseClockTime(item.scheduledTime),
      heatName: item.kind === 'heat' ? parseHeatName(item.name) : null,
    });
  });
  return items;
}

function computeDelay(scheduledMinutes: number | null, setAt: number | null): number {
  if (scheduledMinutes === null || !setAt) return 0;
  const delay = minutesSinceMidnight(new Date(setAt)) - scheduledMinutes;
  return Math.abs(delay) > MAX_PLAUSIBLE_DELAY_MINUTES ? 0 : delay;
}

function summarizeDancers(
  couples: readonly Couple[],
  heatTeams: ReadonlyMap<string, HeatTeam>,
): Map<string, DancerSummary> {
  const dancers = new Map<string, DancerSummary>();
  for (const couple of couples) {
    for (const name of [couple.lead, couple.follow]) {
      const dancer = dancerName(name);
      if (dancer && dancer !== 'TBA' && !dancers.has(dancer)) {
        dancers.set(dancer, { confirmedHeats: 0, possibleHeats: 0 });
      }
    }
  }
  const count = (couplesInHeat: Couple[], field: keyof DancerSummary) => {
    for (const couple of couplesInHeat) {
      for (const name of [couple.lead, couple.follow]) {
        const summary = dancers.get(dancerName(name));
        if (summary) summary[field]++;
      }
    }
  };
  for (const team of heatTeams.values()) {
    count(team.dancing, 'confirmedHeats');
    count(team.possible, 'possibleHeats');
  }
  return dancers;
}
