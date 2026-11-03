import { callbackKey, callbackStatus } from './callbacks';
import { localDate, minutesSinceMidnight, parseClockTime } from './clock';
import { dancerName } from './dancers';
import { roundsByEvent, type RoundsByEvent } from './rounds';
import { buildEventCatalog, type EventCatalog } from './schedule/eventCatalog';
import { parseHeatName, type HeatName } from './schedule/heatName';
import type { Couple, Entries, EventDetails, LiveState, Round, ScheduleItem } from './types';

/**
 * Without the competition's date, a delay this large means the floor was set on another day, so
 * it is ignored.
 */
const MAX_PLAUSIBLE_DELAY_MINUTES = 600;

export interface CompetitionState {
  schedule: readonly ScheduleItem[];
  events: readonly EventDetails[];
  couples: readonly Couple[];
  entries: Entries;
  live: LiveState;
  /** The competition's date, `YYYY-MM-DD`. A floor position set on another day is ignored. */
  date?: string;
}

/** An entry for an event that is no longer on the schedule. */
export interface MissingEntry {
  couple: Couple;
  eventId: string;
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
export interface Competition extends Omit<CompetitionState, 'events'> {
  /** The schedule's events, keyed by `eventId`. */
  events: EventCatalog;
  rounds: RoundsByEvent;
  /** Each couple's events that are on the schedule, keyed by couple id. */
  coupleEvents: ReadonlyMap<string, readonly string[]>;
  missingEntries: readonly MissingEntry[];
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
  const events = buildEventCatalog(state.events);
  const rounds = roundsByEvent(schedule);
  const { coupleEvents, missingEntries } = checkEntries(couples, state.entries, events);
  const items = describeItems(schedule);

  const heatTeams = new Map<string, HeatTeam>();
  for (const item of schedule) {
    if (item.kind !== 'heat') continue;
    const round = items.get(item.id)?.heatName?.round ?? 5;
    const first = rounds.get(item.eventId)?.[0] ?? round;
    const team: HeatTeam = { dancing: [], possible: [], eliminated: [], firstRound: first };
    for (const couple of couples) {
      if (!coupleEvents.get(couple.id)?.includes(item.eventId)) continue;
      const mark = live.callbacks[callbackKey(couple.id, item.eventId)];
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
    ? computeDelay(items.get(current.id)?.scheduledMinutes ?? null, live.currentSetAt, state.date)
    : 0;

  return {
    ...state,
    events,
    rounds,
    coupleEvents,
    missingEntries,
    items,
    heatTeams,
    currentIndex,
    delayMinutes,
    dancers: summarizeDancers(couples, heatTeams),
  };
}

function checkEntries(couples: readonly Couple[], entries: Entries, events: EventCatalog) {
  const coupleEvents = new Map<string, string[]>();
  const missingEntries: MissingEntry[] = [];
  for (const couple of couples) {
    const eventIds = entries[couple.id] ?? [];
    coupleEvents.set(
      couple.id,
      eventIds.filter((eventId) => events.has(eventId)),
    );
    for (const eventId of eventIds) {
      if (!events.has(eventId)) missingEntries.push({ couple, eventId });
    }
  }
  return { coupleEvents, missingEntries };
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

/** How late (positive) or early the floor is, from when the current item went on the floor. */
function computeDelay(
  scheduledMinutes: number | null,
  setAt: number | null,
  date: string | undefined,
): number {
  if (scheduledMinutes === null || !setAt) return 0;
  // Set on a different day (e.g. someone tried the app the night before): not today's pace.
  if (date && localDate(setAt) !== date) return 0;
  const delay = minutesSinceMidnight(new Date(setAt)) - scheduledMinutes;
  return !date && Math.abs(delay) > MAX_PLAUSIBLE_DELAY_MINUTES ? 0 : delay;
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
