/** The one competition this app is for. */

import { localDate, minutesSinceMidnight, parseClockTime } from './clock';
import { deriveCompetition, type Competition } from './competition';
import { parsePartnershipRows } from './entries/parsePartnershipRows';
import { buildEventCatalog } from './schedule/eventCatalog';
import { parseSchedule, type ParseScheduleOptions } from './schedule/parseSchedule';
import { importPartnerships, resolveCouples } from './team';
import type { Couple, Entries, IdFactory, Schedule, ScheduleItem } from './types';

export const PURDUE_CLASSIC = {
  name: 'Purdue Ballroom Classic',
  /** Local date, `YYYY-MM-DD`. */
  date: '2026-11-14',
} as const;

/**
 * The official schedule of the 29th Annual Purdue Ballroom Classic (2026), as posted. Sunday's
 * workshops are left off: the heat sheet covers Saturday's competition only.
 */
export const OFFICIAL_SCHEDULE_TEXT = `
8:00 AM American Style Smooth Events
8:07 AM [1] Bronze Amer. Smooth 1st Round (WT)
8:18 AM [2] Bronze Amer. Smooth 1st Round (FV)
8:29 AM [1] Bronze Amer. Smooth 2nd Round (WT)
8:36 AM [2] Bronze Amer. Smooth 2nd Round (FV)
8:43 AM [1] Bronze Amer. Smooth Quarter (WT)
8:47 AM [2] Bronze Amer. Smooth Quarter (FV)
8:51 AM [3] Gold Amer. Smooth Semi (WTFV)
8:58 AM [1] Bronze Amer. Smooth Semi (WT)
9:02 AM [2] Bronze Amer. Smooth Semi (FV)
9:05 AM [3] Gold Amer. Smooth Final (WTFV)
9:13 AM [1] Bronze Amer. Smooth Final (WT)
9:16 AM [2] Bronze Amer. Smooth Final (FV)
9:20 AM [4] Newcomer Amer. Waltz 1st Round
9:24 AM [5] Newcomer Amer. Tango 1st Round
9:27 AM [6] Newcomer Amer. Foxtrot 1st Round
9:31 AM [7] Silver Amer. Smooth 1st Round (WT)
9:38 AM [8] Silver Amer. Smooth 1st Round (FV)
9:46 AM [4] Newcomer Amer. Waltz Quarter
9:47 AM [5] Newcomer Amer. Tango Quarter
9:49 AM [6] Newcomer Amer. Foxtrot Quarter
9:51 AM [7] Silver Amer. Smooth Quarter (WT)
9:55 AM [8] Silver Amer. Smooth Quarter (FV)
9:58 AM [4] Newcomer Amer. Waltz Semi
10:00 AM [5] Newcomer Amer. Tango Semi
10:02 AM [6] Newcomer Amer. Foxtrot Semi
10:04 AM [9] Novice Amer. Smooth Semi (WTF)
10:09 AM [7] Silver Amer. Smooth Semi (WT)
10:13 AM [8] Silver Amer. Smooth Semi (FV)
10:17 AM [9] Novice Amer. Smooth Final (WTF)
10:22 AM [4] Newcomer Amer. Waltz Final
10:24 AM [5] Newcomer Amer. Tango Final
10:26 AM [6] Newcomer Amer. Foxtrot Final
10:28 AM [7] Silver Amer. Smooth Final (WT)
10:31 AM [8] Silver Amer. Smooth Final (FV)
10:35 AM [10] Pre-Champ Amer. Smooth (WTFV)
10:42 AM Smooth Awards
10:57 AM International Style Standard Events
10:57 AM [11] Bronze Intl. Standard 1st Round (WQ)
11:08 AM [12] Bronze Intl. Standard 1st Round (TF)
11:19 AM [11] Bronze Intl. Standard 2nd Round (WQ)
11:27 AM [13] Gold Intl. Standard Quarter (WTVFQ)
11:36 AM [11] Bronze Intl. Standard Quarter (WQ)
11:40 AM [12] Bronze Intl. Standard Quarter (TF)
11:43 AM [13] Gold Intl. Standard Semi (WTVFQ)
11:52 AM [11] Bronze Intl. Standard Semi (WQ)
11:56 AM [12] Bronze Intl. Standard Semi (TF)
12:00 PM [13] Gold Intl. Standard Final (WTVFQ)
12:09 PM [11] Bronze Intl. Standard Final (WQ)
12:13 PM [12] Bronze Intl. Standard Final (TF)
12:16 PM [14] Newcomer Intl. Waltz Quarter
12:20 PM [15] Newcomer Intl. Tango Quarter
12:22 PM [16] Newcomer Intl. Quickstep Quarter
12:24 PM [17] Silver Intl. Standard Quarter (WQ)
12:31 PM [18] Silver Intl. Standard Quarter (FT)
12:38 PM [19] Silver Intl. V. Waltz Quarter
12:42 PM [20] Pre-Champ Intl. Standard (WTFQ)
12:49 PM [14] Newcomer Intl. Waltz Semi
12:51 PM [15] Newcomer Intl. Tango Semi
12:53 PM [16] Newcomer Intl. Quickstep Semi
12:55 PM [17] Silver Intl. Standard Semi (WQ)
12:58 PM [18] Silver Intl. Standard Semi (FT)
1:02 PM [19] Silver Intl. V. Waltz Semi
1:04 PM [21] Novice Intl. Standard Semi (WFQ)
1:09 PM [14] Newcomer Intl. Waltz Final
1:11 PM [15] Newcomer Intl. Tango Final
1:13 PM [16] Newcomer Intl. Quickstep Final
1:15 PM [17] Silver Intl. Standard Final (WQ)
1:19 PM [18] Silver Intl. Standard Final (FT)
1:22 PM [19] Silver Intl. V. Waltz Final
1:24 PM [21] Novice Intl. Standard Final (WFQ)
1:30 PM [22] Championship Intl. Standard (WTVFQ)
1:39 PM Standard Awards
1:54 PM American Style Rhythm
1:54 PM [23] Bronze Amer. Rhythm 1st Round (CR)
2:05 PM [24] Bronze Amer. Rhythm 1st Round (SM)
2:16 PM [23] Bronze Amer. Rhythm 2nd Round (CR)
2:23 PM [24] Bronze Amer. Rhythm 2nd Round (SM)
2:30 PM [23] Bronze Amer. Rhythm Quarter (CR)
2:34 PM [24] Bronze Amer. Rhythm Quarter (SM)
2:38 PM [25] Gold Amer. Rhythm Semi (CRSM)
2:45 PM [23] Bronze Amer. Rhythm Semi (CR)
2:49 PM [24] Bronze Amer. Rhythm Semi (SM)
2:52 PM [25] Gold Amer. Rhythm Final (CRSM)
3:00 PM [23] Bronze Amer. Rhythm Final (CR)
3:03 PM [24] Bronze Amer. Rhythm Final (SM)
3:07 PM [26] Newcomer Amer. Cha Cha 1st Round
3:11 PM [27] Newcomer Amer. Rumba 1st Round
3:14 PM [28] Newcomer Amer. Swing 1st Round
3:18 PM [29] Silver Amer. Rhythm 1st Round (CR)
3:25 PM [30] Silver Amer. Rhythm 1st Round (SM)
3:33 PM [31] Syllabus Amer. Bolero Quarter
3:36 PM [26] Newcomer Amer. Cha Cha Quarter
3:38 PM [27] Newcomer Amer. Rumba Quarter
3:40 PM [28] Newcomer Amer. Swing Quarter
3:42 PM [29] Silver Amer. Rhythm Quarter (CR)
3:46 PM [30] Silver Amer. Rhythm Quarter (SM)
3:49 PM [31] Syllabus Amer. Bolero Semi
3:51 PM [26] Newcomer Amer. Cha Cha Semi
3:53 PM [27] Newcomer Amer. Rumba Semi
3:55 PM [28] Newcomer Amer. Swing Semi
3:57 PM [31] Syllabus Amer. Bolero Final
3:58 PM [32] Novice Amer. Rhythm Semi (CRS)
4:04 PM [29] Silver Amer. Rhythm Semi (CR)
4:08 PM [30] Silver Amer. Rhythm Semi (SM)
4:11 PM [32] Novice Amer. Rhythm Final (CRS)
4:17 PM [26] Newcomer Amer. Cha Cha Final
4:19 PM [27] Newcomer Amer. Rumba Final
4:20 PM [28] Newcomer Amer. Swing Final
4:22 PM [29] Silver Amer. Rhythm Final (CR)
4:26 PM [30] Silver Amer. Rhythm Final (SM)
4:30 PM [33] Pre-Champ Amer. Rhythm (CRSB)
4:37 PM Rhythm Awards
4:52 PM International Style Latin Events
4:52 PM [34] Bronze Intl. Latin 1st Round (CR)
5:03 PM [35] Bronze Intl. Latin 1st Round (SJ)
5:14 PM [34] Bronze Intl. Latin 2nd Round (CR)
5:21 PM [35] Bronze Intl. Latin 2nd Round (SJ)
5:29 PM [34] Bronze Intl. Latin Quarter (CR)
5:32 PM [35] Bronze Intl. Latin Quarter (SJ)
5:36 PM [36] Gold Intl. Latin Semi (SCRJ)
5:43 PM [34] Bronze Intl. Latin Semi (CR)
5:47 PM [35] Bronze Intl. Latin Semi (SJ)
5:51 PM [36] Gold Intl. Latin Final (SCRJ)
5:58 PM [34] Bronze Intl. Latin Final (CR)
6:02 PM [35] Bronze Intl. Latin Final (SJ)
6:05 PM [37] Newcomer Intl. Cha Cha 1st Round
6:09 PM [38] Newcomer Intl. Rumba 1st Round
6:13 PM [39] Newcomer Intl. Jive 1st Round
6:16 PM [40] Silver Intl. Latin 1st Round (CR)
6:24 PM [41] Silver Intl. Latin 1st Round (SJ)
6:31 PM [42] Syllabus Intl. Paso Doble Quarter
6:33 PM [37] Newcomer Intl. Cha Cha Quarter
6:35 PM [38] Newcomer Intl. Rumba Quarter
6:36 PM [39] Newcomer Intl. Jive Quarter
6:38 PM [40] Silver Intl. Latin Quarter (CR)
6:42 PM [41] Silver Intl. Latin Quarter (SJ)
6:46 PM [42] Syllabus Intl. Paso Doble Semi
6:47 PM [37] Newcomer Intl. Cha Cha Semi
6:49 PM [38] Newcomer Intl. Rumba Semi
6:51 PM [39] Newcomer Intl. Jive Semi
6:53 PM [43] Novice Intl. Latin Semi (SCR)
6:58 PM [42] Syllabus Intl. Paso Doble Final
7:00 PM [40] Silver Intl. Latin Semi (CR)
7:04 PM [41] Silver Intl. Latin Semi (SJ)
7:08 PM [43] Novice Intl. Latin Final (SCR)
7:13 PM [37] Newcomer Intl. Cha Cha Final
7:15 PM [38] Newcomer Intl. Rumba Final
7:17 PM [39] Newcomer Intl. Jive Final
7:19 PM [40] Silver Intl. Latin Final (CR)
7:22 PM [41] Silver Intl. Latin Final (SJ)
7:26 PM [44] Pre-Champ Intl. Latin (SCRJ)
7:33 PM Latin Awards
`;

/**
 * The team's partnerships and the events each couple dances, from the 2026 partnerships sheet:
 * lead, follow, level, then events. `TBA` is a partner still to be announced.
 */
export const OFFICIAL_PARTNERSHIPS_TEXT = `
Alice	Jenya	Silver	Silver A. Smooth (WT), Silver A. Smooth (FV)
Alice	Jiayi	Silver, Gold	Gold I. Latin (SCRJ), Silver I. Latin (CR), Silver I. Latin (SJ)
Andrey	Jenya	Silver, Gold	Silver A. Rhythm (SM), Silver A. Rhythm (CR), Silver I. Latin (CR), Silver I. Latin (SJ), Gold I. Standard (WTVFQ), Syllabus Bolero
Chris	Brooke	Bronze, Silver	Bronze I. Standard (WQ), Bronze I. Standard (TF), Bronze I. Latin (CR), Bronze I. Latin (SJ), Bronze A. Smooth (WT), Bronze A. Smooth (FV), Bronze A. Rhythm (SM), Bronze A. Rhythm (CR), Silver I. Standard (WQ), Silver I. Standard (TF), Silver I. Latin (CR), Silver I. Latin (SJ), Silver I. V. Waltz
Franke	Leon	Bronze	Bronze A. Smooth (WT), Bronze I. Standard (TF)
Franke	Abby	Bronze	Bronze I. Latin (SJ), Bronze A. Smooth (FV)
Franke	Yumna	Bronze	Bronze I. Latin (CR)
Franke	Jiayi	Bronze	Bronze I. Standard (WQ)
Jenya	Alice	Silver	Silver I. V. Waltz
Kennedy	Ashley	Bronze	Bronze I. Standard (WQ), Bronze I. Standard (TF), Bronze I. Latin (CR), Bronze I. Latin (SJ)
Leon	Erica	Newcomer, Bronze	Bronze I. Latin (CR), Bronze I. Latin (SJ), Bronze A. Rhythm (SM), Bronze A. Rhythm (CR), Syllabus Paso Doble, Syllabus Bolero, Newcomer A. Cha Cha, Newcomer A. Rumba, Newcomer Swing
Liam (TBA)	Abby	Bronze	Bronze I. Latin (CR)
Nathanio	Phoebe	Newcomer	Newcomer A. Waltz
Peter	Abby	Bronze, Silver	Bronze I. Standard (WQ), Bronze I. Standard (TF), Silver I. Standard (WQ), Silver I. Standard (TF)
Sylvia	Aleksandra	Newcomer	Newcomer A. Waltz, Newcomer A. Foxtrot, Newcomer I. Waltz, Newcomer A. Cha Cha, Newcomer Swing, Newcomer I. Cha Cha, Bronze A. Rhythm (SM)
TBA	Jiayi	Bronze	Bronze A. Smooth (WT), Bronze A. Smooth (FV), Bronze A. Rhythm (SM), Bronze A. Rhythm (CR), Bronze I. Standard (TF)
Yumna	Erica	Bronze	Bronze I. Standard (WQ)
Zach	Leon	Bronze	Bronze A. Smooth (FV), Bronze I. Standard (WQ)
Zach	Erica	Bronze	Bronze A. Smooth (WT), Bronze I. Standard (TF)
Zach	TBA	Bronze	Bronze I. Latin (CR)
Alice	TBA	Silver	Silver I. Standard (WQ), Silver I. Standard (TF)
`;

/**
 * The official schedule, as stored data. Pass the current schedule's events so events that match
 * keep their ids, and couples' entries and callback marks stay attached.
 */
export function officialSchedule(options?: ParseScheduleOptions): Schedule {
  return parseSchedule(OFFICIAL_SCHEDULE_TEXT, options);
}

/** A schedule line, ignoring ids. */
const lineKey = (item: ScheduleItem) =>
  item.kind === 'heat'
    ? `${item.scheduledTime}|${item.eventNumber}|${item.name}`
    : `${item.scheduledTime}|${item.label}`;

let officialKeys: string[] | undefined;

/** True when `items` is the official schedule, line for line (day-of edits make it differ). */
export function isOfficialSchedule(items: readonly ScheduleItem[]): boolean {
  officialKeys ??= officialSchedule().items.map(lineKey);
  const keys = officialKeys;
  return (
    items.length === keys.length && items.every((item, index) => lineKey(item) === keys[index])
  );
}

/** Ids that are the same every time the page loads. */
const sequentialIds = (prefix: string): IdFactory => {
  let next = 0;
  return () => `${prefix}${++next}`;
};

interface PurdueData {
  schedule: Schedule;
  couples: Couple[];
  entries: Entries;
}

let purdueData: PurdueData | undefined;

/** The schedule, the team's couples and what each dances, all from the built-in text. */
export function loadPurdueData(): PurdueData {
  if (purdueData) return purdueData;
  const schedule = officialSchedule({ createId: sequentialIds('item') });
  const roster = importPartnerships(
    parsePartnershipRows(OFFICIAL_PARTNERSHIPS_TEXT),
    { dancers: [], partnerships: [] },
    buildEventCatalog(schedule.events),
    sequentialIds('team'),
  );
  purdueData = {
    schedule,
    couples: resolveCouples(roster.dancers, roster.partnerships),
    entries: roster.entries,
  };
  return purdueData;
}

/**
 * The schedule item the posted times say is happening at `now`: the last one that has started.
 * Null on any day but competition day, and before the first item.
 */
export function itemAtTime(
  items: readonly ScheduleItem[],
  now: number,
  date: string = PURDUE_CLASSIC.date,
): ScheduleItem | null {
  if (localDate(now) !== date) return null;
  const minutes = minutesSinceMidnight(new Date(now));
  let current: ScheduleItem | null = null;
  for (const item of items) {
    const start = parseClockTime(item.scheduledTime);
    if (start === null || start > minutes) break;
    current = item;
  }
  return current;
}

/** Everything the site shows at `now`: the posted schedule, with "now" placed by the clock. */
export function purdueCompetition(now: number): Competition {
  const { schedule, couples, entries } = loadPurdueData();
  const current = itemAtTime(schedule.items, now);
  return deriveCompetition({
    schedule: schedule.items,
    events: schedule.events,
    couples,
    entries,
    live: { currentItemId: current?.id ?? null, currentSetAt: null },
    date: PURDUE_CLASSIC.date,
  });
}
