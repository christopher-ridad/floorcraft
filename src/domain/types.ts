/** Core competition data. Everything here is plain, serializable data. */

export type DanceStyle = 'smooth' | 'standard' | 'rhythm' | 'latin' | 'other';

/** Round of an event, from first round (1) to final (5). Single-round events count as finals. */
export type Round = 1 | 2 | 3 | 4 | 5;

/** A heat of a numbered event, e.g. `9:39 AM [4] Newcomer Amer. Waltz 1st Round`. */
export interface Heat {
  kind: 'heat';
  id: string;
  /** Posted time as written, e.g. `9:39 AM`. */
  scheduledTime: string;
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

/** An entry the team pinned to an event by hand instead of the automatic match. */
export interface ManualMatch {
  entry: string;
  eventNumber: number;
}

export interface Couple {
  id: string;
  lead: string;
  follow: string;
  /** Event names as written on the partnerships sheet, e.g. `Silver I. Standard (TF)`. */
  entries: string[];
  manualMatches: ManualMatch[];
}

/** How far a couple has got in one event. */
export interface CallbackMark {
  /** The latest round the couple is confirmed to dance. */
  reachedRound: Round;
  /** True once the couple was not called back after `reachedRound`. */
  eliminated: boolean;
}

/** Callback marks keyed by `callbackKey(coupleId, eventNumber)`. */
export type CallbackMarks = Readonly<Record<string, CallbackMark>>;

export interface LiveState {
  /** The schedule item on the floor, or null before the competition starts. */
  currentItemId: string | null;
  /** When the current item was put on the floor (epoch ms). Drives the pace estimate. */
  currentSetAt: number | null;
  callbacks: CallbackMarks;
}

export type IdFactory = () => string;

export const randomId: IdFactory = () => crypto.randomUUID();
