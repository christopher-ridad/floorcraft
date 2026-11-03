import { deriveCompetition, type Competition } from '../../src/domain/competition';
import type {
  CallbackMarks,
  Couple,
  Entries,
  EventDetails,
  ScheduleItem,
} from '../../src/domain/types';

/**
 * A small competition: three events (e1 with a first round, semi and final; e2 single-round;
 * e3 with a first round and final) and four couples, one entered in an event that's no longer
 * on the schedule. Scheduled minutes after midnight: h0 510, h1 517, h2 528, h3 535, h4 540,
 * h5 545, h6 550.
 */
export const events: EventDetails[] = [
  {
    eventId: 'e1',
    eventNumber: 1,
    name: 'Bronze Amer. Smooth (WT)',
    level: 'bronze',
    style: 'smooth',
    dances: 'WT',
    confirmed: false,
  },
  {
    eventId: 'e2',
    eventNumber: 2,
    name: 'Bronze Amer. Smooth (FV)',
    level: 'bronze',
    style: 'smooth',
    dances: 'FV',
    confirmed: false,
  },
  {
    eventId: 'e3',
    eventNumber: 3,
    name: 'Newcomer Intl. Cha Cha',
    level: 'newcomer',
    style: 'latin',
    dances: '',
    confirmed: false,
  },
];

const heat = (
  id: string,
  scheduledTime: string,
  eventId: string,
  eventNumber: number,
  name: string,
) => ({ kind: 'heat', id, scheduledTime, eventId, eventNumber, name }) as const;

export const schedule: ScheduleItem[] = [
  { kind: 'break', id: 'h0', scheduledTime: '8:30 AM', label: 'Smooth Events' },
  heat('h1', '8:37 AM', 'e1', 1, 'Bronze Amer. Smooth 1st Round (WT)'),
  heat('h2', '8:48 AM', 'e2', 2, 'Bronze Amer. Smooth (FV)'),
  heat('h3', '8:55 AM', 'e1', 1, 'Bronze Amer. Smooth Semi-Final (WT)'),
  heat('h4', '9:00 AM', 'e3', 3, 'Newcomer Intl. Cha Cha 1st Round'),
  heat('h5', '9:05 AM', 'e1', 1, 'Bronze Amer. Smooth Final (WT)'),
  heat('h6', '9:10 AM', 'e3', 3, 'Newcomer Intl. Cha Cha Final'),
];

export const couples: Couple[] = [
  { id: 'c1', lead: 'Chris', follow: 'Brooke' },
  { id: 'c2', lead: 'Alex (TBA)', follow: 'Sam' },
  { id: 'c3', lead: 'Sam', follow: 'Jo' },
  { id: 'c4', lead: 'Pat', follow: 'TBA' },
];

export const entries: Entries = {
  c1: ['e1', 'e2'],
  c2: ['e3'],
  c3: ['e1'],
  c4: ['gone'],
};

export const at = (hours: number, minutes: number) =>
  new Date(2026, 9, 29, hours, minutes).getTime();

export interface Setup {
  currentItemId?: string;
  currentSetAt?: number;
  callbacks?: CallbackMarks;
  entries?: Entries;
  date?: string;
}

export function competitionWith(setup: Setup = {}): Competition {
  return deriveCompetition({
    schedule,
    events,
    couples,
    entries: setup.entries ?? entries,
    date: setup.date,
    live: {
      currentItemId: setup.currentItemId ?? null,
      currentSetAt: setup.currentSetAt ?? null,
      callbacks: setup.callbacks ?? {},
    },
  });
}

export const ids = (items: readonly { id: string }[]) => items.map((item) => item.id);
