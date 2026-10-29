import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatClockTime, parseClockTime } from '../../src/domain/clock';
import { matchEntry } from '../../src/domain/entries/matchEntry';
import { parseEntries } from '../../src/domain/entries/parseEntries';
import { classifyDanceStyle } from '../../src/domain/schedule/danceStyle';
import { buildEventCatalog } from '../../src/domain/schedule/eventCatalog';
import { parseHeatName } from '../../src/domain/schedule/heatName';
import { parseSchedule } from '../../src/domain/schedule/parseSchedule';

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
    const items = parseSchedule(sampleSchedule);
    expect(items.filter((item) => item.kind === 'heat')).toHaveLength(139);
    expect(items.some((item) => item.kind === 'break' && item.label === 'Smooth Awards')).toBe(
      true,
    );
  });

  it('reads heats, breaks and several items on one line', () => {
    const text =
      '8:30 AM Smooth Events 8:37 am [1] Bronze Amer. Smooth 1st Round (WT)\nno time here';
    expect(parseSchedule(text, sequentialIds())).toEqual([
      { kind: 'break', id: 'id1', scheduledTime: '8:30 AM', label: 'Smooth Events' },
      {
        kind: 'heat',
        id: 'id2',
        scheduledTime: '8:37 AM',
        eventNumber: 1,
        name: 'Bronze Amer. Smooth 1st Round (WT)',
      },
    ]);
  });

  it('restores time order for text pasted from a two-column PDF', () => {
    const lines = sampleSchedule.trim().split('\n');
    const half = Math.ceil(lines.length / 2);
    const interleaved = lines.slice(0, half).map((line, i) => `${line} ${lines[half + i] ?? ''}`);
    const heatKeys = (text: string) =>
      parseSchedule(text).flatMap((item) =>
        item.kind === 'heat' ? [`${item.scheduledTime}${item.eventNumber}`] : [],
      );

    expect(heatKeys(interleaved.join('\n'))).toEqual(heatKeys(lines.join('\n')));
  });
});

describe('partnership parsing', () => {
  it('reads tab-separated rows, defaulting a missing follow to TBA', () => {
    expect(
      parseEntries(
        'Chris\tBrooke\tBronze\tBronze I. Latin (CR), Bronze A. Smooth (WT)\nPat\t\t\tGold Intl. Tango',
        sequentialIds(),
      ),
    ).toEqual([
      {
        id: 'id1',
        lead: 'Chris',
        follow: 'Brooke',
        entries: ['Bronze I. Latin (CR)', 'Bronze A. Smooth (WT)'],
        manualMatches: [],
      },
      { id: 'id2', lead: 'Pat', follow: 'TBA', entries: ['Gold Intl. Tango'], manualMatches: [] },
    ]);
  });

  it('reads space-separated rows with name notes and a level column', () => {
    const [couple] = parseEntries('Liam (TBA) Abby Bronze, Silver Bronze I. Latin (CR)');
    expect(couple).toMatchObject({
      lead: 'Liam (TBA)',
      follow: 'Abby',
      entries: ['Bronze I. Latin (CR)'],
    });
  });

  it('matches every sample entry to a scheduled event', () => {
    const events = buildEventCatalog(parseSchedule(sampleSchedule));
    const couples = parseEntries(samplePartnerships);
    expect(couples).toHaveLength(20);

    const misses = couples.flatMap((couple) =>
      couple.entries
        .filter((entry) => matchEntry(entry, events) === null)
        .map((entry) => `${couple.lead}/${couple.follow}: ${entry}`),
    );
    expect(misses).toEqual([]);
  });

  it('handles shorthand: dance order, missing style, V. Waltz', () => {
    const events = buildEventCatalog(parseSchedule(sampleSchedule));
    expect(matchEntry('Silver I. Standard (TF)', events)).toBe(16); // schedule lists (FT)
    expect(matchEntry('Newcomer Swing', events)).toBe(29);
    expect(matchEntry('Silver I. V. Waltz', events)).toBe(20);
    expect(matchEntry('Gold I. Latin (SCRJ)', events)).toBe(37);
  });
});
