import { describe, expect, it } from 'vitest';
import { decodeDocument, encodeDocument } from '../../src/infra/sync/documentCodec';
import { couples, schedule } from '../domain/fixture';

/** Documents exactly as the original app wrote them. */
const legacy = {
  schedule: {
    heats: [
      { id: 'b1_x', t: '8:30 AM', label: 'Smooth Events' },
      { id: 'h2_x', t: '8:37 AM', ev: 1, name: 'Bronze Amer. Smooth 1st Round (WT)' },
    ],
  },
  entries: {
    couples: [
      {
        id: 'c1_x',
        lead: 'Chris',
        follow: 'Brooke',
        events: ['Bronze A. Smooth (WT)', 'Gold Intl. Tango'],
        manual: [{ entry: 'Gold Intl. Tango', ev: 3 }],
      },
    ],
  },
  live: {
    currentId: 'h2_x',
    setAt: 1_790_000_000_000,
    calls: { c1_x_1: { reach: 4 }, c1_x_3: { reach: 1, cut: 1 } },
  },
};

describe('reading the original (version 1) documents', () => {
  it('reads the schedule', () => {
    expect(decodeDocument('schedule', legacy.schedule)).toEqual([
      { kind: 'break', id: 'b1_x', scheduledTime: '8:30 AM', label: 'Smooth Events' },
      {
        kind: 'heat',
        id: 'h2_x',
        scheduledTime: '8:37 AM',
        eventNumber: 1,
        name: 'Bronze Amer. Smooth 1st Round (WT)',
      },
    ]);
  });

  it('reads couples and their manual matches', () => {
    expect(decodeDocument('entries', legacy.entries)).toEqual([
      {
        id: 'c1_x',
        lead: 'Chris',
        follow: 'Brooke',
        entries: ['Bronze A. Smooth (WT)', 'Gold Intl. Tango'],
        manualMatches: [{ entry: 'Gold Intl. Tango', eventNumber: 3 }],
      },
    ]);
  });

  it('reads the floor position and callback marks', () => {
    expect(decodeDocument('live', legacy.live)).toEqual({
      currentItemId: 'h2_x',
      currentSetAt: 1_790_000_000_000,
      callbacks: {
        c1_x_1: { reachedRound: 4, eliminated: false },
        c1_x_3: { reachedRound: 1, eliminated: true },
      },
    });
  });
});

describe('the current (version 2) format', () => {
  it('round-trips every document', () => {
    const live = {
      currentItemId: 'h3',
      currentSetAt: 1_790_000_000_000,
      callbacks: { c1_1: { reachedRound: 4 as const, eliminated: false } },
    };
    expect(decodeDocument('schedule', encodeDocument('schedule', schedule))).toEqual(schedule);
    expect(decodeDocument('entries', encodeDocument('entries', couples))).toEqual(couples);
    expect(decodeDocument('live', encodeDocument('live', live))).toEqual(live);
  });

  it('marks documents with their schema version', () => {
    expect(encodeDocument('schedule', [])).toEqual({ schemaVersion: 2, items: [] });
  });
});

describe('damaged or missing data', () => {
  it('reads a missing document as empty', () => {
    expect(decodeDocument('schedule', null)).toEqual([]);
    expect(decodeDocument('entries', undefined)).toEqual([]);
    expect(decodeDocument('live', null)).toEqual({
      currentItemId: null,
      currentSetAt: null,
      callbacks: {},
    });
  });

  it('drops malformed items and keeps the rest', () => {
    const items = decodeDocument('schedule', {
      heats: [
        null,
        { id: 'x' },
        { id: 'y', t: '9:00 AM', ev: 'one', name: 'Bad' },
        legacy.schedule.heats[0],
      ],
    });
    expect(items.map((item) => item.id)).toEqual(['b1_x']);

    const live = decodeDocument('live', { calls: { a: { reach: 9 }, b: 'x', c: { reach: 2 } } });
    expect(live.callbacks).toEqual({ c: { reachedRound: 2, eliminated: false } });
  });

  it('defaults a missing follow to TBA and skips non-text entries', () => {
    const [couple] = decodeDocument('entries', {
      couples: [{ id: 'c', lead: 'Kim', events: ['Bronze I. Latin (CR)', 4] }],
    });
    expect(couple).toEqual({
      id: 'c',
      lead: 'Kim',
      follow: 'TBA',
      entries: ['Bronze I. Latin (CR)'],
      manualMatches: [],
    });
  });
});
