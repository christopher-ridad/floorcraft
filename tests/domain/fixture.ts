import { deriveCompetition, type Competition } from '../../src/domain/competition';
import type { CallbackMarks, Couple, ScheduleItem } from '../../src/domain/types';

/**
 * A small competition: three events with first rounds, a semi and finals, and four couples
 * including one entry that matches nothing. Scheduled minutes after midnight: h0 510, h1 517,
 * h2 528, h3 535, h4 540, h5 545, h6 550.
 */
export const schedule: ScheduleItem[] = [
  { kind: 'break', id: 'h0', scheduledTime: '8:30 AM', label: 'Smooth Events' },
  {
    kind: 'heat',
    id: 'h1',
    scheduledTime: '8:37 AM',
    eventNumber: 1,
    name: 'Bronze Amer. Smooth 1st Round (WT)',
  },
  {
    kind: 'heat',
    id: 'h2',
    scheduledTime: '8:48 AM',
    eventNumber: 2,
    name: 'Bronze Amer. Smooth (FV)',
  },
  {
    kind: 'heat',
    id: 'h3',
    scheduledTime: '8:55 AM',
    eventNumber: 1,
    name: 'Bronze Amer. Smooth Semi-Final (WT)',
  },
  {
    kind: 'heat',
    id: 'h4',
    scheduledTime: '9:00 AM',
    eventNumber: 3,
    name: 'Newcomer Intl. Cha Cha 1st Round',
  },
  {
    kind: 'heat',
    id: 'h5',
    scheduledTime: '9:05 AM',
    eventNumber: 1,
    name: 'Bronze Amer. Smooth Final (WT)',
  },
  {
    kind: 'heat',
    id: 'h6',
    scheduledTime: '9:10 AM',
    eventNumber: 3,
    name: 'Newcomer Intl. Cha Cha Final',
  },
];

export const couples: Couple[] = [
  {
    id: 'c1',
    lead: 'Chris',
    follow: 'Brooke',
    entries: ['Bronze A. Smooth (WT)', 'Bronze A. Smooth (FV)'],
    manualMatches: [],
  },
  {
    id: 'c2',
    lead: 'Alex (TBA)',
    follow: 'Sam',
    entries: ['Newcomer I. Cha Cha'],
    manualMatches: [],
  },
  { id: 'c3', lead: 'Sam', follow: 'Jo', entries: ['Bronze A. Smooth (WT)'], manualMatches: [] },
  { id: 'c4', lead: 'Pat', follow: 'TBA', entries: ['Gold Intl. Tango'], manualMatches: [] },
];

export const at = (hours: number, minutes: number) =>
  new Date(2026, 9, 29, hours, minutes).getTime();

export interface Setup {
  currentItemId?: string;
  currentSetAt?: number;
  callbacks?: CallbackMarks;
  couples?: Couple[];
}

export function competitionWith(setup: Setup = {}): Competition {
  return deriveCompetition({
    schedule,
    couples: setup.couples ?? couples,
    live: {
      currentItemId: setup.currentItemId ?? null,
      currentSetAt: setup.currentSetAt ?? null,
      callbacks: setup.callbacks ?? {},
    },
  });
}

export const ids = (items: readonly { id: string }[]) => items.map((item) => item.id);
