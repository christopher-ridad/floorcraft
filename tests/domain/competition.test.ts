/**
 * The live logic, checked against the same scenarios and results as the legacy
 * characterization tests (tests/legacy/appLogic.test.ts), quirks included.
 */
import { describe, expect, it } from 'vitest';
import { alertKey, nextAlert, type AlertPreferences } from '../../src/domain/alerts';
import { pendingCallbacks, recordCallback, type CallbackUpdate } from '../../src/domain/callbacks';
import type { Competition } from '../../src/domain/competition';
import { upcomingHeatsFor } from '../../src/domain/dancers';
import { advanceFloor, markOnFloor, moveFloorBack } from '../../src/domain/floor';
import { estimatedMinutes, paceStatus } from '../../src/domain/pace';
import { deriveCompetition } from '../../src/domain/competition';
import { at, competitionWith, couples, ids, schedule } from './fixture';

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

const withCallback = (competition: Competition, update: CallbackUpdate) =>
  deriveCompetition({
    ...competition,
    live: {
      ...competition.live,
      callbacks: recordCallback(competition.live.callbacks, competition.rounds, update),
    },
  });

describe('entry matching and the team roster', () => {
  it('matches entries to events and lists the ones that match nothing', () => {
    const competition = competitionWith();
    expect(competition.entryMatches.get('c1')).toEqual([
      { entry: 'Bronze A. Smooth (WT)', eventNumber: 1, isManual: false },
      { entry: 'Bronze A. Smooth (FV)', eventNumber: 2, isManual: false },
    ]);
    expect(competition.unmatchedEntries.map((u) => [u.couple.id, u.entry])).toEqual([
      ['c4', 'Gold Intl. Tango'],
    ]);
  });

  it('uses a manual event choice instead of the automatic match', () => {
    const pat = couples[3];
    if (!pat) throw new Error('fixture changed');
    const competition = competitionWith({
      couples: [
        ...couples.slice(0, 3),
        { ...pat, manualMatches: [{ entry: 'Gold Intl. Tango', eventNumber: 3 }] },
      ],
    });
    expect(competition.entryMatches.get('c4')).toEqual([
      { entry: 'Gold Intl. Tango', eventNumber: 3, isManual: true },
    ]);
    expect(competition.unmatchedEntries).toEqual([]);
    expect(teamIn(competition, 'h4')).toMatchObject({ dancing: ['c2', 'c4'] });
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

  it('a recorded callback confirms that round only; later rounds stay possible', () => {
    const competition = withCallback(competitionWith(), {
      coupleId: 'c1',
      eventNumber: 1,
      reachedRound: 4,
      eliminated: false,
    });

    expect(competition.live.callbacks).toEqual({ c1_1: { reachedRound: 4, eliminated: false } });
    expect(teamIn(competition, 'h3')).toMatchObject({ dancing: ['c1'], possible: ['c3'] });
    expect(teamIn(competition, 'h5')).toMatchObject({ dancing: [], possible: ['c1', 'c3'] });
  });

  it('not being called back removes the couple from every later round', () => {
    const competition = withCallback(competitionWith(), {
      coupleId: 'c3',
      eventNumber: 1,
      reachedRound: 1,
      eliminated: true,
    });

    expect(competition.live.callbacks).toEqual({ c3_1: { reachedRound: 1, eliminated: true } });
    expect(teamIn(competition, 'h3')).toMatchObject({ possible: ['c1'], eliminated: ['c3'] });
    expect(teamIn(competition, 'h5')).toMatchObject({ possible: ['c1'], eliminated: ['c3'] });
  });

  it('resetting a couple back to the first round deletes its mark', () => {
    const competition = withCallback(
      competitionWith({ callbacks: { c1_1: { reachedRound: 4, eliminated: false } } }),
      { coupleId: 'c1', eventNumber: 1, reachedRound: 1, eliminated: false },
    );
    expect(competition.live.callbacks).toEqual({});
  });
});

describe('pace and estimated times', () => {
  const estimates = (competition: Competition) =>
    schedule.map((item) => estimatedMinutes(competition, item.id));

  it('before the first heat: no delay, posted times', () => {
    const competition = competitionWith();
    expect(competition.currentIndex).toBe(-1);
    expect(competition.delayMinutes).toBe(0);
    expect(paceStatus(competition)).toEqual({ kind: 'not-started' });
    expect(estimatedMinutes(competition, 'h5')).toBe(545);
  });

  it('shifts only heats after the current one by the delay', () => {
    const competition = competitionWith({ currentItemId: 'h3', currentSetAt: at(9, 5) });
    expect(competition.delayMinutes).toBe(10);
    expect(estimates(competition)).toEqual([510, 517, 528, 535, 550, 555, 560]);
    expect(paceStatus(competition)).toEqual({ kind: 'behind', minutes: 10 });
  });

  it('reports on time within 3 minutes and minutes ahead otherwise', () => {
    expect(paceStatus(competitionWith({ currentItemId: 'h3', currentSetAt: at(8, 57) }))).toEqual({
      kind: 'on-time',
    });
    expect(paceStatus(competitionWith({ currentItemId: 'h3', currentSetAt: at(8, 45) }))).toEqual({
      kind: 'ahead',
      minutes: 10,
    });
  });

  it('ignores a delay of more than 10 hours (floor set on another day)', () => {
    expect(competitionWith({ currentItemId: 'h3', currentSetAt: at(19, 0) }).delayMinutes).toBe(0);
  });
});

describe('moving the floor position', () => {
  const after = (competition: Competition, live: Competition['live']) =>
    deriveCompetition({ ...competition, live });

  it('next heat restarts the pace from the current time', () => {
    const competition = competitionWith({ currentItemId: 'h3', currentSetAt: at(9, 5) });
    const moved = after(competition, advanceFloor(competition, at(9, 20)));
    expect([moved.live.currentItemId, moved.delayMinutes]).toEqual(['h4', 20]);
  });

  it('the first tap puts the first schedule line on the floor, even a break', () => {
    expect(advanceFloor(competitionWith(), at(8, 30)).currentItemId).toBe('h0');
  });

  it('does nothing past the last line', () => {
    const competition = competitionWith({ currentItemId: 'h6', currentSetAt: at(9, 10) });
    expect(advanceFloor(competition, at(9, 20))).toBe(competition.live);
  });

  it('back is a correction that keeps the current delay', () => {
    const competition = competitionWith({ currentItemId: 'h4', currentSetAt: at(9, 10) });
    const moved = after(competition, moveFloorBack(competition, at(9, 20)));
    expect([moved.live.currentItemId, moved.delayMinutes]).toEqual(['h3', 10]);
  });
});

describe('callbacks waiting to be entered', () => {
  const pending = (competition: Competition) =>
    pendingCallbacks(competition).map((p) => [
      p.couple.id,
      p.eventNumber,
      p.dancedHeat.id,
      p.nextHeat.id,
      p.reachedRound,
      p.nextRound,
    ]);

  it('none before the competition starts', () => {
    expect(pending(competitionWith())).toEqual([]);
  });

  it('asks once a couple’s round has been danced, ordered by the next round', () => {
    expect(pending(competitionWith({ currentItemId: 'h4', currentSetAt: at(9, 0) }))).toEqual([
      ['c1', 1, 'h1', 'h3', 1, 4],
      ['c3', 1, 'h1', 'h3', 1, 4],
    ]);
  });

  it('keeps asking even after the next round has passed', () => {
    expect(pending(competitionWith({ currentItemId: 'h5', currentSetAt: at(9, 5) }))).toEqual([
      ['c1', 1, 'h1', 'h3', 1, 4],
      ['c3', 1, 'h1', 'h3', 1, 4],
      ['c2', 3, 'h4', 'h6', 1, 5],
    ]);
  });

  it('moves on to the following round after a callback and skips eliminated couples', () => {
    const competition = competitionWith({
      currentItemId: 'h5',
      currentSetAt: at(9, 5),
      callbacks: {
        c1_1: { reachedRound: 4, eliminated: false },
        c2_3: { reachedRound: 1, eliminated: true },
      },
    });
    expect(pending(competition)).toEqual([
      ['c3', 1, 'h1', 'h3', 1, 4],
      ['c1', 1, 'h3', 'h5', 4, 5],
    ]);
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

describe('alerts', () => {
  /** Puts each item on the floor in turn and returns the alert given at each step, as the app would. */
  function alertsWhileMovingTo(itemIds: string[], preferences: AlertPreferences) {
    const given = new Set<string>();
    let competition = competitionWith();
    return itemIds.map((itemId) => {
      competition = deriveCompetition({
        ...competition,
        live: markOnFloor(competition.live, itemId, at(9, 20)),
      });
      const alert = nextAlert(competition, preferences, given);
      if (alert) given.add(alertKey(alert));
      return alert && [alert.type, alert.heatId, alert.heatsAway];
    });
  }

  it('stay quiet before the competition starts', () => {
    expect(
      nextAlert(competitionWith(), { dancer: 'Chris', thresholdHeats: 3 }, new Set()),
    ).toBeNull();
  });

  it('warn within the threshold, then again on deck, once each', () => {
    expect(
      alertsWhileMovingTo(['h0', 'h1', 'h2', 'h3', 'h3'], { dancer: 'Alex', thresholdHeats: 3 }),
    ).toEqual([null, ['heads-up', 'h4', 3], null, ['on-deck', 'h4', 1], null]);
  });

  it('go straight to on deck when the first warning would be 1 heat away', () => {
    expect(alertsWhileMovingTo(['h0'], { dancer: 'Chris', thresholdHeats: 3 })).toEqual([
      ['on-deck', 'h1', 1],
    ]);
  });

  it('skip heats that depend on a callback', () => {
    expect(alertsWhileMovingTo(['h1'], { dancer: 'Jo', thresholdHeats: 3 })).toEqual([null]);
  });
});
