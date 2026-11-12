/**
 * The live logic. These scenarios and results were first recorded against the original app
 * before the rewrite, so they pin down its behavior, quirks included.
 */
import { describe, expect, it } from 'vitest';
import type { Competition } from '../../src/domain/competition';
import { upcomingHeatsFor } from '../../src/domain/dancers';
import { estimatedMinutes } from '../../src/domain/pace';
import { at, competitionWith, ids, schedule } from './fixture';

const teamIn = (competition: Competition, heatId: string) => {
  const team = competition.heatTeams.get(heatId);
  if (!team) throw new Error(`No team for ${heatId}`);
  return {
    dancing: ids(team.dancing),
    possible: ids(team.possible),
    eliminated: ids(team.eliminated),
    firstRound: team.firstRound,
  };
};

describe('entries and the team roster', () => {
  it('lists each couple’s events and flags entries for events no longer on the schedule', () => {
    const competition = competitionWith();
    expect(competition.coupleEvents.get('c1')).toEqual(['e1', 'e2']);
    expect(competition.coupleEvents.get('c4')).toEqual([]);
    expect(
      competition.missingEntries.map((missing) => [missing.couple.id, missing.eventId]),
    ).toEqual([['c4', 'gone']]);
  });

  it('puts an entered couple in every heat of the event', () => {
    const competition = competitionWith({ entries: { c2: ['e3'], c4: ['e3'] } });
    expect(teamIn(competition, 'h4')).toMatchObject({ dancing: ['c2', 'c4'] });
    expect(teamIn(competition, 'h6')).toMatchObject({ possible: ['c2', 'c4'] });
    expect(competition.missingEntries).toEqual([]);
  });

  it('counts each dancer’s sure and possible heats, ignoring TBA and name notes', () => {
    expect([...competitionWith().dancers]).toEqual([
      ['Chris', { confirmedHeats: 2, possibleHeats: 2 }],
      ['Brooke', { confirmedHeats: 2, possibleHeats: 2 }],
      ['Alex', { confirmedHeats: 1, possibleHeats: 1 }],
      ['Sam', { confirmedHeats: 2, possibleHeats: 3 }],
      ['Jo', { confirmedHeats: 1, possibleHeats: 2 }],
      ['Pat', { confirmedHeats: 0, possibleHeats: 0 }],
    ]);
  });
});

describe('callback states', () => {
  it('puts everyone in first rounds and single-round events, and later rounds as possible', () => {
    const competition = competitionWith();
    const none = { possible: [], eliminated: [] };
    expect(teamIn(competition, 'h1')).toEqual({ dancing: ['c1', 'c3'], ...none, firstRound: 1 });
    expect(teamIn(competition, 'h2')).toEqual({ dancing: ['c1'], ...none, firstRound: 5 });
    expect(teamIn(competition, 'h3')).toEqual({
      dancing: [],
      possible: ['c1', 'c3'],
      eliminated: [],
      firstRound: 1,
    });
    expect(teamIn(competition, 'h5')).toMatchObject({ dancing: [], possible: ['c1', 'c3'] });
  });

  it('a callback mark confirms that round only; later rounds stay possible', () => {
    const competition = competitionWith({
      callbacks: { c1_e1: { reachedRound: 4, eliminated: false } },
    });
    expect(teamIn(competition, 'h3')).toMatchObject({ dancing: ['c1'], possible: ['c3'] });
    expect(teamIn(competition, 'h5')).toMatchObject({ dancing: [], possible: ['c1', 'c3'] });
  });

  it('not being called back removes the couple from every later round', () => {
    const competition = competitionWith({
      callbacks: { c3_e1: { reachedRound: 1, eliminated: true } },
    });
    expect(teamIn(competition, 'h3')).toMatchObject({ possible: ['c1'], eliminated: ['c3'] });
    expect(teamIn(competition, 'h5')).toMatchObject({ possible: ['c1'], eliminated: ['c3'] });
  });
});

describe('pace and estimated times', () => {
  const estimates = (competition: Competition) =>
    schedule.map((item) => estimatedMinutes(competition, item.id));

  it('before the first heat: no delay, posted times', () => {
    const competition = competitionWith();
    expect(competition.currentIndex).toBe(-1);
    expect(competition.delayMinutes).toBe(0);
    expect(estimatedMinutes(competition, 'h5')).toBe(545);
  });

  it('shifts only heats after the current one by the delay', () => {
    const competition = competitionWith({ currentItemId: 'h3', currentSetAt: at(9, 5) });
    expect(competition.delayMinutes).toBe(10);
    expect(estimates(competition)).toEqual([510, 517, 528, 535, 550, 555, 560]);
  });

  it('ignores a floor position set on a different day from the competition', () => {
    const floor = { currentItemId: 'h3', currentSetAt: at(9, 5) };
    expect(competitionWith({ ...floor, date: '2026-10-29' }).delayMinutes).toBe(10);
    expect(competitionWith({ ...floor, date: '2026-11-14' }).delayMinutes).toBe(0);
  });

  it('counts long delays on the competition day', () => {
    const floor = { currentItemId: 'h3', currentSetAt: at(19, 0) };
    expect(competitionWith({ ...floor, date: '2026-10-29' }).delayMinutes).toBe(605);
  });

  it('without a date, ignores a delay of more than 10 hours', () => {
    expect(competitionWith({ currentItemId: 'h3', currentSetAt: at(19, 0) }).delayMinutes).toBe(0);
  });
});

describe('a dancer’s upcoming heats', () => {
  const upcoming = (competition: Competition, dancer: string) =>
    upcomingHeatsFor(competition, dancer).map((u) => [u.heat.id, u.couple.id, u.isPossible]);

  it('lists sure and possible heats in schedule order', () => {
    expect(upcoming(competitionWith(), 'Sam')).toEqual([
      ['h1', 'c3', false],
      ['h3', 'c3', true],
      ['h4', 'c2', false],
      ['h5', 'c3', true],
      ['h6', 'c2', true],
    ]);
  });

  it('includes the heat on the floor and drops earlier ones', () => {
    expect(
      upcoming(competitionWith({ currentItemId: 'h4', currentSetAt: at(9, 0) }), 'Sam'),
    ).toEqual([
      ['h4', 'c2', false],
      ['h5', 'c3', true],
      ['h6', 'c2', true],
    ]);
  });
});
