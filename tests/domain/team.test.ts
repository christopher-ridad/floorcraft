import { describe, expect, it } from 'vitest';
import { parsePartnershipRows } from '../../src/domain/entries/parsePartnershipRows';
import { OFFICIAL_PARTNERSHIPS_TEXT, officialSchedule } from '../../src/domain/purdue';
import { buildEventCatalog } from '../../src/domain/schedule/eventCatalog';
import { findPartnership, importPartnerships, resolveCouples } from '../../src/domain/team';
import type { Dancer, Partnership } from '../../src/domain/types';
import { events } from './fixture';

const sequentialIds = (prefix = 'id') => {
  let next = 0;
  return () => `${prefix}${++next}`;
};
const catalog = buildEventCatalog(events);
const empty = { dancers: [] as Dancer[], partnerships: [] as Partnership[] };

describe('importing partnerships', () => {
  it('creates dancers and partnerships, and matches entries to events', () => {
    const result = importPartnerships(
      [
        {
          lead: 'Chris',
          follow: 'Brooke',
          entries: ['Bronze A. Smooth (WT)', 'Bronze A. Smooth (FV)'],
        },
        { lead: 'Pat', follow: 'TBA', entries: ['Gold Intl. Tango'] },
      ],
      empty,
      catalog,
      sequentialIds(),
    );

    expect(result.dancers).toEqual([
      { id: 'id1', name: 'Chris', active: true },
      { id: 'id2', name: 'Brooke', active: true },
      { id: 'id4', name: 'Pat', active: true },
    ]);
    expect(result.partnerships).toEqual([
      { id: 'id3', leadId: 'id1', followId: 'id2', active: true },
      { id: 'id5', leadId: 'id4', followId: null, active: true },
    ]);
    expect(result.entries).toEqual({ id3: ['e1', 'e2'], id5: [] });
    expect(result.unmatched).toEqual([{ lead: 'Pat', follow: 'TBA', entry: 'Gold Intl. Tango' }]);
  });

  it('reuses dancers by name (ignoring case and notes) and existing partnerships', () => {
    const team = {
      dancers: [
        { id: 'liam', name: 'Liam', active: false },
        { id: 'abby', name: 'Abby', active: true },
      ],
      partnerships: [{ id: 'liam-abby', leadId: 'liam', followId: 'abby', active: false }],
    };
    const result = importPartnerships(
      [{ lead: 'liam (TBA)', follow: 'ABBY', entries: ['Newcomer I. Cha Cha'] }],
      team,
      catalog,
      sequentialIds(),
    );

    expect(result.dancers).toEqual([
      { id: 'liam', name: 'Liam', active: true },
      { id: 'abby', name: 'Abby', active: true },
    ]);
    expect(result.partnerships).toEqual([
      { id: 'liam-abby', leadId: 'liam', followId: 'abby', active: true },
    ]);
    expect(result.entries).toEqual({ 'liam-abby': ['e3'] });
  });

  it('makes partnerships missing from the sheet inactive, keeping them for history', () => {
    const team = {
      dancers: [{ id: 'jo', name: 'Jo', active: true }],
      partnerships: [{ id: 'old', leadId: 'jo', followId: null, active: true }],
    };
    const result = importPartnerships(
      [{ lead: 'Kim', follow: 'Lee', entries: [] }],
      team,
      catalog,
      sequentialIds(),
    );
    expect(result.partnerships.find((partnership) => partnership.id === 'old')?.active).toBe(false);
    expect(result.entries).not.toHaveProperty('old');
  });

  it('merges repeated rows for the same couple without repeating events', () => {
    const result = importPartnerships(
      [
        { lead: 'Chris', follow: 'Brooke', entries: ['Bronze A. Smooth (WT)'] },
        {
          lead: 'Chris',
          follow: 'Brooke',
          entries: ['Bronze A. Smooth (WT)', 'Bronze A. Smooth (FV)'],
        },
      ],
      empty,
      catalog,
      sequentialIds(),
    );
    expect(result.partnerships).toHaveLength(1);
    expect(Object.values(result.entries)).toEqual([['e1', 'e2']]);
  });

  it('imports the whole built-in sheet against the official schedule', () => {
    const schedule = officialSchedule();
    const result = importPartnerships(
      parsePartnershipRows(OFFICIAL_PARTNERSHIPS_TEXT),
      empty,
      buildEventCatalog(schedule.events),
      sequentialIds(),
    );
    expect(result.partnerships).toHaveLength(20);
    expect(result.unmatched).toEqual([]);
    // A lead or follow still to be announced is no dancer.
    const zach = result.dancers.find((dancer) => dancer.name === 'Zach')?.id;
    const tbaFollow = result.partnerships.find((p) => p.leadId === zach && p.followId === null);
    expect(result.entries[tbaFollow?.id ?? '']).toHaveLength(1);
    // "Liam (TBA)" and the TBA rows share dancers with other rows.
    expect(new Set(result.dancers.map((dancer) => dancer.name.toLowerCase())).size).toBe(
      result.dancers.length,
    );
  });
});

describe('couples', () => {
  const dancers = [
    { id: 'zach', name: 'Zach', active: true },
    { id: 'erica', name: 'Erica', active: true },
    { id: 'alice', name: 'Alice', active: true },
  ];

  it('names active partnerships in alphabetical order, with TBA for an unannounced partner', () => {
    expect(
      resolveCouples(dancers, [
        { id: 'p1', leadId: 'zach', followId: 'erica', active: true },
        { id: 'p2', leadId: 'alice', followId: null, active: true },
        { id: 'p3', leadId: 'zach', followId: 'alice', active: false },
      ]),
    ).toEqual([
      { id: 'p2', lead: 'Alice', follow: 'TBA' },
      { id: 'p1', lead: 'Zach', follow: 'Erica' },
    ]);
  });

  it('finds a partnership by its dancers’ names', () => {
    const team = {
      dancers,
      partnerships: [
        { id: 'p1', leadId: 'zach', followId: 'erica', active: true },
        { id: 'p2', leadId: 'alice', followId: null, active: true },
      ],
    };
    expect(findPartnership(team, 'zach', 'Erica (TBA)')?.id).toBe('p1');
    expect(findPartnership(team, 'Alice', 'TBA')?.id).toBe('p2');
    expect(findPartnership(team, 'Alice', 'Zach')).toBeUndefined();
    expect(findPartnership(team, 'Nobody', 'Erica')).toBeUndefined();
  });
});
