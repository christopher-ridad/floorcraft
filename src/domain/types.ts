/** Core team and competition data. Everything here is plain, serializable data. */

export type DanceStyle = 'smooth' | 'standard' | 'rhythm' | 'latin' | 'other';

/** Round of an event, from first round (1) to final (5). Single-round events count as finals. */
export type Round = 1 | 2 | 3 | 4 | 5;

// ---- The team: carries over from one competition to the next ----

export interface Dancer {
  id: string;
  /** As written on the partnerships sheet; may carry a note, e.g. `Liam (TBA)`. */
  name: string;
  active: boolean;
}

export interface Partnership {
  id: string;
  leadId: string | null;
  /** Null while the partner is to be announced. */
  followId: string | null;
  active: boolean;
}

/** A partnership with its dancers' names, as the competition views use it. */
export interface Couple {
  /** The partnership's id. */
  id: string;
  lead: string;
  follow: string;
}

// ---- A competition ----

export type CompetitionStatus = 'setup' | 'active' | 'archived';

export interface CompetitionInfo {
  id: string;
  name: string;
  /** Local date, `YYYY-MM-DD`. */
  date: string;
  status: CompetitionStatus;
  /** The version of the built-in schedule and partnerships last applied; absent if never. */
  officialVersion?: number;
}

/**
 * One event on the schedule, however many rounds it has. `eventId` stays the same when the
 * schedule is replaced or edited, even if the event is renumbered.
 */
export interface EventDetails {
  eventId: string;
  eventNumber: number;
  /** The event name without its round, e.g. `Bronze Amer. Smooth (WT)`. */
  name: string;
  /** Leading level word, lowercase (e.g. `bronze`), or empty if none was recognized. */
  level: string;
  style: DanceStyle;
  /** Dance letters as written, e.g. `WT`. Empty when none are listed. */
  dances: string;
}

/** A heat of an event, e.g. `9:39 AM [4] Newcomer Amer. Waltz 1st Round`. */
export interface Heat {
  kind: 'heat';
  id: string;
  /** Posted time as written, e.g. `9:39 AM`. */
  scheduledTime: string;
  eventId: string;
  eventNumber: number;
  name: string;
}

/** A schedule line with no event number: a section title, break, or awards. */
export interface ScheduleBreak {
  kind: 'break';
  id: string;
  scheduledTime: string;
  label: string;
}

export type ScheduleItem = Heat | ScheduleBreak;

export interface Schedule {
  items: ScheduleItem[];
  events: EventDetails[];
}

/** The events each couple is entered in: couple (partnership) id → event ids. */
export type Entries = Readonly<Record<string, readonly string[]>>;

/** Where the floor is. */
export interface FloorState {
  /** The schedule item on the floor, or null before the competition starts. */
  currentItemId: string | null;
  /** When the current item was put on the floor (epoch ms). Drives the pace estimate. */
  currentSetAt: number | null;
}

export type IdFactory = () => string;

export const randomId: IdFactory = () => crypto.randomUUID();
