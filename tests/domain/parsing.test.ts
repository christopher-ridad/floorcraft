import { describe, expect, it } from 'vitest';
import { formatClockTime, parseClockTime } from '../../src/domain/clock';
import { matchEntry } from '../../src/domain/entries/matchEntry';
import { parsePartnershipRows } from '../../src/domain/entries/parsePartnershipRows';
import {
  isOfficialSchedule,
  OFFICIAL_PARTNERSHIPS_TEXT,
  officialSchedule,
} from '../../src/domain/purdue';
import { classifyDanceStyle } from '../../src/domain/schedule/danceStyle';
import { buildEventCatalog } from '../../src/domain/schedule/eventCatalog';
import { parseHeatName } from '../../src/domain/schedule/heatName';
import { parseSchedule } from '../../src/domain/schedule/parseSchedule';
import type { Schedule } from '../../src/domain/types';

const sequentialIds = () => {
  let next = 0;
  return () => `id${++next}`;
};

describe('clock times', () => {
  it.each([
    ['9:39 AM', 579],
    ['12:05 AM', 5],
    ['12:30 PM', 750],
    ['1:05 p.m.', 785],
    ['not a time', null],
  ])('parses %s', (text, minutes) => {
    expect(parseClockTime(text)).toBe(minutes);
  });

  it('formats minutes, rounding and wrapping past midnight', () => {
    expect(formatClockTime(579)).toBe('9:39 AM');
    expect(formatClockTime(750.4)).toBe('12:30 PM');
    expect(formatClockTime(1440 + 5)).toBe('12:05 AM');
    expect(formatClockTime(null)).toBe('');
  });
});

describe('heat names', () => {
  it('splits off the round and reads dances and style', () => {
    expect(parseHeatName('Bronze Amer. Smooth Semi-Final (WT)')).toEqual({
      baseName: 'Bronze Amer. Smooth (WT)',
      round: 4,
      isSingleRound: false,
      dances: 'WT',
      style: 'smooth',
    });
  });

  it.each([
    ['Bronze Amer. Smooth 2nd Round (WT)', 2],
    ['Gold Amer. Smooth Semi (WTFV)', 4],
    ['Newcomer Amer. Waltz Semi', 4],
    ['Novice Amer. Smooth Final (WTF)', 5],
  ])('reads the round of %s as %i', (name, round) => {
    expect(parseHeatName(name)).toMatchObject({ round, isSingleRound: false });
    expect(parseHeatName(name).baseName).not.toMatch(/semi|round|final/i);
  });

  it('treats a name with no round as a single-round final', () => {
    expect(parseHeatName('Pre-Champ Amer. Smooth (WTFV)')).toMatchObject({
      round: 5,
      isSingleRound: true,
    });
  });

  it.each([
    ['Silver Intl. Standard (WQ)', 'standard'],
    ['Silver I. Latin (CR)', 'latin'],
    ['Bronze A. Rhythm (SM)', 'rhythm'],
    ['Newcomer Swing', 'rhythm'],
    ['Syllabus Paso Doble', 'latin'],
    ['Team Match', 'other'],
  ])('classifies %s as %s', (name, style) => {
    expect(classifyDanceStyle(name)).toBe(style);
  });
});

describe('the official schedule', () => {
  it('has every heat, break and event', () => {
    const { items, events } = officialSchedule();
    expect(items.filter((item) => item.kind === 'heat')).toHaveLength(145);
    expect(items.filter((item) => item.kind === 'break').map((item) => item.scheduledTime)).toEqual(
      ['8:00 AM', '10:42 AM', '10:57 AM', '1:39 PM', '1:54 PM', '4:37 PM', '4:52 PM', '7:33 PM'],
    );
    expect(events.map((event) => event.eventNumber)).toEqual(
      Array.from({ length: 44 }, (_, i) => i + 1),
    );
    expect(events.every((event) => event.style !== 'other' && event.level)).toBe(true);
  });

  it('is in time order', () => {
    const minutes = officialSchedule().items.map((item) => parseClockTime(item.scheduledTime));
    expect(minutes.every((value, i) => value !== null && value >= (minutes[i - 1] ?? 0))).toBe(
      true,
    );
  });

  it('only gives the pre-champ and championship events a single round', () => {
    const singles = officialSchedule().items.flatMap((item) =>
      item.kind === 'heat' && parseHeatName(item.name).isSingleRound ? [item.eventNumber] : [],
    );
    expect(singles).toEqual([10, 20, 22, 33, 44]);
  });

  it('recognizes itself, and not an edited copy', () => {
    const { items } = officialSchedule();
    expect(isOfficialSchedule(items)).toBe(true);
    expect(isOfficialSchedule(items.slice(1))).toBe(false);
    expect(
      isOfficialSchedule(
        items.map((item, i) => (i ? item : { ...item, scheduledTime: '7:55 AM' })),
      ),
    ).toBe(false);
  });
});

describe('schedule parsing', () => {
  it('reads heats and breaks, ignores lines without a time, and identifies the events', () => {
    const text = [
      '8:00 AM Smooth Events',
      '8:07 am [1] Bronze Amer. Smooth 1st Round (WT)',
      'no time here',
    ].join('\n');
    expect(parseSchedule(text, { createId: sequentialIds() })).toEqual({
      items: [
        { kind: 'break', id: 'id1', scheduledTime: '8:00 AM', label: 'Smooth Events' },
        {
          kind: 'heat',
          id: 'id2',
          scheduledTime: '8:07 AM',
          eventId: 'id3',
          eventNumber: 1,
          name: 'Bronze Amer. Smooth 1st Round (WT)',
        },
      ],
      events: [
        {
          eventId: 'id3',
          eventNumber: 1,
          name: 'Bronze Amer. Smooth (WT)',
          level: 'bronze',
          style: 'smooth',
          dances: 'WT',
        },
      ],
    });
  });
});

describe('event identity across schedule updates', () => {
  const original = parseSchedule(
    [
      '9:00 AM [1] Bronze Amer. Smooth 1st Round (WT)',
      '9:10 AM [2] Silver Intl. Standard (WQ)',
      '9:20 AM [3] Gold Amer. Rhythm (CR)',
      '9:30 AM [1] Bronze Amer. Smooth Final (WT)',
    ].join('\n'),
  );
  const idOf = (schedule: Schedule, eventNumber: number) =>
    schedule.events.find((event) => event.eventNumber === eventNumber)?.eventId;

  it('gives every heat of an event the same id', () => {
    const ids = original.items.flatMap((item) =>
      item.kind === 'heat' && item.eventNumber === 1 ? [item.eventId] : [],
    );
    expect(ids).toEqual([idOf(original, 1), idOf(original, 1)]);
  });

  it('keeps ids for events that are unchanged', () => {
    const updated = parseSchedule('9:05 AM [1] Bronze Amer. Smooth 1st Round (WT)', {
      previousEvents: original.events,
    });
    expect(idOf(updated, 1)).toBe(idOf(original, 1));
  });

  it('follows an event that was renumbered', () => {
    const updated = parseSchedule(
      ['9:10 AM [7] Silver Intl. Standard (WQ)', '9:20 AM [2] Gold Amer. Rhythm (CR)'].join('\n'),
      { previousEvents: original.events },
    );
    expect(idOf(updated, 7)).toBe(idOf(original, 2));
    expect(idOf(updated, 2)).toBe(idOf(original, 3));
  });

  it('keeps the id when a name is corrected', () => {
    const updated = parseSchedule('9:10 AM [2] Silver Intl. Standard (WTQ)', {
      previousEvents: original.events,
    });
    expect(idOf(updated, 2)).toBe(idOf(original, 2));
    expect(updated.events[0]).toMatchObject({ dances: 'WTQ' });
  });

  it('does not take over a different event that only shares the number', () => {
    const updated = parseSchedule('9:10 AM [2] Newcomer Amer. Waltz', {
      previousEvents: original.events,
    });
    expect(original.events.map((event) => event.eventId)).not.toContain(idOf(updated, 2));
  });

  it('gives new events new ids', () => {
    const updated = parseSchedule('9:40 AM [9] Newcomer Swing', {
      previousEvents: original.events,
    });
    expect(original.events.map((event) => event.eventId)).not.toContain(idOf(updated, 9));
  });
});

describe('partnership rows', () => {
  it('reads tab-separated rows, defaulting a missing follow to TBA', () => {
    const text =
      'Chris\tBrooke\tBronze\tBronze I. Latin (CR), Bronze A. Smooth (WT)\nPat\t\t\tGold Intl. Tango';
    expect(parsePartnershipRows(text)).toEqual([
      {
        lead: 'Chris',
        follow: 'Brooke',
        entries: ['Bronze I. Latin (CR)', 'Bronze A. Smooth (WT)'],
      },
      { lead: 'Pat', follow: 'TBA', entries: ['Gold Intl. Tango'] },
    ]);
  });

  it('reads space-separated rows with name notes and a level column', () => {
    expect(parsePartnershipRows('Liam (TBA) Abby Bronze, Silver Bronze I. Latin (CR)')).toEqual([
      { lead: 'Liam (TBA)', follow: 'Abby', entries: ['Bronze I. Latin (CR)'] },
    ]);
  });

  it('matches every built-in entry to a scheduled event', () => {
    const events = buildEventCatalog(officialSchedule().events);
    const rows = parsePartnershipRows(OFFICIAL_PARTNERSHIPS_TEXT);
    expect(rows).toHaveLength(21);

    const misses = rows.flatMap((row) =>
      row.entries
        .filter((entry) => matchEntry(entry, events) === null)
        .map((entry) => `${row.lead}/${row.follow}: ${entry}`),
    );
    expect(misses).toEqual([]);
  });

  it('handles shorthand: dance order, missing style, V. Waltz', () => {
    const events = buildEventCatalog(officialSchedule().events);
    const numberOf = (entry: string) => events.get(matchEntry(entry, events) ?? '')?.eventNumber;
    expect(numberOf('Silver I. Standard (TF)')).toBe(18); // schedule lists (FT)
    expect(numberOf('Newcomer Swing')).toBe(28);
    expect(numberOf('Silver I. V. Waltz')).toBe(19);
    expect(numberOf('Gold I. Latin (SCRJ)')).toBe(36);
    expect(numberOf('Syllabus Paso Doble')).toBe(42);
  });
});
