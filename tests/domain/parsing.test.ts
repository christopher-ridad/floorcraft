import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatClockTime, parseClockTime } from '../../src/domain/clock';
import { matchEntry } from '../../src/domain/entries/matchEntry';
import { parsePartnershipRows } from '../../src/domain/entries/parsePartnershipRows';
import { classifyDanceStyle } from '../../src/domain/schedule/danceStyle';
import { buildEventCatalog } from '../../src/domain/schedule/eventCatalog';
import { parseHeatName } from '../../src/domain/schedule/heatName';
import { parseSchedule } from '../../src/domain/schedule/parseSchedule';
import type { Schedule, ScheduleItem } from '../../src/domain/types';

const readData = (file: string) =>
  readFileSync(new URL(`../../data/${file}`, import.meta.url), 'utf8');
const sampleSchedule = readData('schedule-2025-tentative.txt');
const samplePartnerships = readData('partnerships-2026.txt');
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

describe('schedule parsing', () => {
  it('parses every heat and break from the sample schedule', () => {
    const { items, events } = parseSchedule(sampleSchedule);
    expect(items.filter((item) => item.kind === 'heat')).toHaveLength(139);
    expect(items.some((item) => item.kind === 'break' && item.label === 'Smooth Awards')).toBe(
      true,
    );
    expect(events).toHaveLength(new Set(items.flatMap(eventNumberOf)).size);
  });

  it('reads heats, breaks and several items on one line, and identifies the events', () => {
    const text =
      '8:30 AM Smooth Events 8:37 am [1] Bronze Amer. Smooth 1st Round (WT)\nno time here';
    expect(parseSchedule(text, { createId: sequentialIds() })).toEqual({
      items: [
        { kind: 'break', id: 'id1', scheduledTime: '8:30 AM', label: 'Smooth Events' },
        {
          kind: 'heat',
          id: 'id2',
          scheduledTime: '8:37 AM',
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
          confirmed: false,
        },
      ],
    });
  });

  it('restores time order for text pasted from a two-column PDF', () => {
    const lines = sampleSchedule.trim().split('\n');
    const half = Math.ceil(lines.length / 2);
    const interleaved = lines.slice(0, half).map((line, i) => `${line} ${lines[half + i] ?? ''}`);
    const heatKeys = (text: string) =>
      parseSchedule(text).items.flatMap((item) =>
        item.kind === 'heat' ? [`${item.scheduledTime}${item.eventNumber}`] : [],
      );

    expect(heatKeys(interleaved.join('\n'))).toEqual(heatKeys(lines.join('\n')));
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
  const reviewedEvents = original.events.map((event) => ({ ...event, confirmed: true }));
  const idOf = (schedule: Schedule, eventNumber: number) =>
    schedule.events.find((event) => event.eventNumber === eventNumber)?.eventId;

  it('gives every heat of an event the same id', () => {
    const ids = original.items.flatMap((item) =>
      item.kind === 'heat' && item.eventNumber === 1 ? [item.eventId] : [],
    );
    expect(ids).toEqual([idOf(original, 1), idOf(original, 1)]);
  });

  it('keeps ids, and the review, for events that are unchanged', () => {
    const updated = parseSchedule('9:05 AM [1] Bronze Amer. Smooth 1st Round (WT)', {
      previousEvents: reviewedEvents,
    });
    expect(idOf(updated, 1)).toBe(idOf(original, 1));
    expect(updated.events[0]?.confirmed).toBe(true);
  });

  it('follows an event that was renumbered', () => {
    const updated = parseSchedule(
      ['9:10 AM [7] Silver Intl. Standard (WQ)', '9:20 AM [2] Gold Amer. Rhythm (CR)'].join('\n'),
      { previousEvents: original.events },
    );
    expect(idOf(updated, 7)).toBe(idOf(original, 2));
    expect(idOf(updated, 2)).toBe(idOf(original, 3));
  });

  it('keeps the id when a name is corrected, but asks for a new review', () => {
    const updated = parseSchedule('9:10 AM [2] Silver Intl. Standard (WTQ)', {
      previousEvents: reviewedEvents,
    });
    expect(idOf(updated, 2)).toBe(idOf(original, 2));
    expect(updated.events[0]).toMatchObject({ dances: 'WTQ', confirmed: false });
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

  it('matches every sample entry to a scheduled event', () => {
    const events = buildEventCatalog(parseSchedule(sampleSchedule).events);
    const rows = parsePartnershipRows(samplePartnerships);
    expect(rows).toHaveLength(20);

    const misses = rows.flatMap((row) =>
      row.entries
        .filter((entry) => matchEntry(entry, events) === null)
        .map((entry) => `${row.lead}/${row.follow}: ${entry}`),
    );
    expect(misses).toEqual([]);
  });

  it('handles shorthand: dance order, missing style, V. Waltz', () => {
    const events = buildEventCatalog(parseSchedule(sampleSchedule).events);
    const numberOf = (entry: string) => events.get(matchEntry(entry, events) ?? '')?.eventNumber;
    expect(numberOf('Silver I. Standard (TF)')).toBe(16); // schedule lists (FT)
    expect(numberOf('Newcomer Swing')).toBe(29);
    expect(numberOf('Silver I. V. Waltz')).toBe(20);
    expect(numberOf('Gold I. Latin (SCRJ)')).toBe(37);
  });
});

function eventNumberOf(item: ScheduleItem): number[] {
  return item.kind === 'heat' ? [item.eventNumber] : [];
}
