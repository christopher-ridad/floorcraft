/**
 * Characterization tests: they pin down how the legacy app's live logic behaves today
 * (callbacks, pace, pending callbacks, upcoming heats, alerts), quirks included, so the
 * rewrite can be checked against them. They describe current behavior, not desired behavior.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { loadLegacyApp, type LegacyApp, type LegacyState } from './loadLegacyApp';

const at = (hours: number, minutes: number) => new Date(2026, 9, 29, hours, minutes);

// Scheduled minutes after midnight: h0 510, h1 517, h2 528, h3 535, h4 540, h5 545, h6 550.
const heats = [
  { id: 'h0', t: '8:30 AM', label: 'Smooth Events' },
  { id: 'h1', t: '8:37 AM', ev: 1, name: 'Bronze Amer. Smooth 1st Round (WT)' },
  { id: 'h2', t: '8:48 AM', ev: 2, name: 'Bronze Amer. Smooth (FV)' },
  { id: 'h3', t: '8:55 AM', ev: 1, name: 'Bronze Amer. Smooth Semi-Final (WT)' },
  { id: 'h4', t: '9:00 AM', ev: 3, name: 'Newcomer Intl. Cha Cha 1st Round' },
  { id: 'h5', t: '9:05 AM', ev: 1, name: 'Bronze Amer. Smooth Final (WT)' },
  { id: 'h6', t: '9:10 AM', ev: 3, name: 'Newcomer Intl. Cha Cha Final' },
];
const couples = [
  {
    id: 'c1',
    lead: 'Chris',
    follow: 'Brooke',
    events: ['Bronze A. Smooth (WT)', 'Bronze A. Smooth (FV)'],
    manual: [],
  },
  { id: 'c2', lead: 'Alex (TBA)', follow: 'Sam', events: ['Newcomer I. Cha Cha'], manual: [] },
  { id: 'c3', lead: 'Sam', follow: 'Jo', events: ['Bronze A. Smooth (WT)'], manual: [] },
  { id: 'c4', lead: 'Pat', follow: 'TBA', events: ['Gold Intl. Tango'], manual: [] },
];

interface Setup {
  currentId?: string;
  setAt?: Date;
  calls?: Record<string, { reach: number; cut?: number }>;
  couples?: object[];
  prefs?: Record<string, unknown>;
  now?: Date;
}

let app: LegacyApp | undefined;
afterEach(() => app?.close());

async function start(setup: Setup = {}): Promise<LegacyApp> {
  const state: LegacyState = {
    heats,
    couples: setup.couples ?? couples,
    live: {
      currentId: setup.currentId ?? null,
      setAt: setup.setAt?.getTime() ?? null,
      calls: setup.calls ?? {},
    },
  };
  app = await loadLegacyApp({ state, prefs: setup.prefs, now: setup.now ?? at(9, 20) });
  return app;
}

/** Runs an expression in the page and returns its JSON value as plain Node data. */
const json = <T = unknown>(page: LegacyApp, expression: string): T =>
  JSON.parse(page.run<string>(`JSON.stringify(${expression})`)) as T;

const teamIn = (page: LegacyApp, heatId: string) =>
  json(
    page,
    `(t => ({ on: t.on.map(c => c.id), maybe: t.maybe.map(c => c.id), out: t.out.map(c => c.id), first: t.first }))(D.team.get('${heatId}'))`,
  );

describe('entry matching and the team roster', () => {
  it('matches entries to events and lists the ones that match nothing', async () => {
    const page = await start();
    expect(json(page, `D.coupleEvs.get('c1')`)).toEqual([
      { entry: 'Bronze A. Smooth (WT)', ev: 1, manual: false },
      { entry: 'Bronze A. Smooth (FV)', ev: 2, manual: false },
    ]);
    expect(json(page, `D.unmatched.map(u => [u.couple.id, u.entry])`)).toEqual([
      ['c4', 'Gold Intl. Tango'],
    ]);
  });

  it('uses a manual event choice instead of the automatic match', async () => {
    const page = await start({
      couples: [
        ...couples.slice(0, 3),
        { ...couples[3], manual: [{ entry: 'Gold Intl. Tango', ev: 3 }] },
      ],
    });
    expect(json(page, `D.coupleEvs.get('c4')`)).toEqual([
      { entry: 'Gold Intl. Tango', ev: 3, manual: true },
    ]);
    expect(json(page, 'D.unmatched')).toEqual([]);
    expect(teamIn(page, 'h4')).toMatchObject({ on: ['c2', 'c4'] });
  });

  it('counts each dancer’s sure and possible heats, ignoring TBA and name notes', async () => {
    const page = await start();
    expect(json(page, '[...D.people]')).toEqual([
      ['Chris', { sure: 2, maybe: 2 }],
      ['Brooke', { sure: 2, maybe: 2 }],
      ['Alex', { sure: 1, maybe: 1 }],
      ['Sam', { sure: 2, maybe: 3 }],
      ['Jo', { sure: 1, maybe: 2 }],
      ['Pat', { sure: 0, maybe: 0 }],
    ]);
  });
});

describe('callback states', () => {
  it('puts everyone in first rounds and single-round events, and later rounds as maybe', async () => {
    const page = await start();
    expect(teamIn(page, 'h1')).toEqual({ on: ['c1', 'c3'], maybe: [], out: [], first: 1 });
    expect(teamIn(page, 'h2')).toEqual({ on: ['c1'], maybe: [], out: [], first: 5 });
    expect(teamIn(page, 'h3')).toEqual({ on: [], maybe: ['c1', 'c3'], out: [], first: 1 });
    expect(teamIn(page, 'h5')).toEqual({ on: [], maybe: ['c1', 'c3'], out: [], first: 1 });
  });

  it('a recorded callback confirms that round only; later rounds stay maybe', async () => {
    const page = await start();
    page.run('setCall("c1", 1, 4, null)');

    expect(json(page, 'S.live.calls')).toEqual({ c1_1: { reach: 4 } });
    expect(teamIn(page, 'h3')).toMatchObject({ on: ['c1'], maybe: ['c3'] });
    expect(teamIn(page, 'h5')).toMatchObject({ on: [], maybe: ['c1', 'c3'] });
  });

  it('not being called back removes the couple from every later round', async () => {
    const page = await start();
    page.run('setCall("c3", 1, 1, 1)');

    expect(json(page, 'S.live.calls')).toEqual({ c3_1: { reach: 1, cut: 1 } });
    expect(teamIn(page, 'h3')).toMatchObject({ maybe: ['c1'], out: ['c3'] });
    expect(teamIn(page, 'h5')).toMatchObject({ maybe: ['c1'], out: ['c3'] });
  });

  it('resetting a couple back to the first round deletes its mark', async () => {
    const page = await start({ calls: { c1_1: { reach: 4 } } });
    page.run('setCall("c1", 1, 1, null)');
    expect(json(page, 'S.live.calls')).toEqual({});
  });
});

describe('pace and estimated times', () => {
  it('before the first heat: no delay, posted times', async () => {
    const page = await start();
    expect(json(page, '[D.curIdx, D.delay, paceText(), est(S.heats[5])]')).toEqual([
      -1,
      0,
      { t: 'Not started', late: false },
      545,
    ]);
  });

  it('shifts only heats after the current one by the delay', async () => {
    const page = await start({ currentId: 'h3', setAt: at(9, 5) });
    expect(json(page, 'D.delay')).toBe(10);
    expect(json(page, 'S.heats.map(est)')).toEqual([510, 517, 528, 535, 550, 555, 560]);
    expect(json(page, 'paceText()')).toEqual({ t: '10 min behind', late: true });
  });

  it('reports on time within 3 minutes and minutes ahead otherwise', async () => {
    let page = await start({ currentId: 'h3', setAt: at(8, 57) });
    expect(json(page, 'paceText()')).toEqual({ t: 'On time', late: false });
    page.close();

    page = await start({ currentId: 'h3', setAt: at(8, 45) });
    expect(json(page, 'paceText()')).toEqual({ t: '10 min ahead', late: true });
  });

  it('ignores a delay of more than 10 hours (floor set on another day)', async () => {
    const page = await start({ currentId: 'h3', setAt: at(19, 0) });
    expect(json(page, 'D.delay')).toBe(0);
  });
});

describe('moving the floor position', () => {
  it('next heat restarts the pace from the current time', async () => {
    const page = await start({ currentId: 'h3', setAt: at(9, 5), now: at(9, 20) });
    page.run('step(1)');
    expect(json(page, '[S.live.currentId, D.delay]')).toEqual(['h4', 20]);
  });

  it('the first tap puts the first schedule line on the floor, even a break', async () => {
    const page = await start();
    page.run('step(1)');
    expect(json(page, 'S.live.currentId')).toBe('h0');
  });

  it('does nothing past the last line', async () => {
    const page = await start({ currentId: 'h6', setAt: at(9, 10) });
    page.run('step(1)');
    expect(json(page, 'S.live.currentId')).toBe('h6');
  });

  it('back is a correction that keeps the current delay', async () => {
    const page = await start({ currentId: 'h4', setAt: at(9, 10) });
    page.run('step(-1)');
    expect(json(page, '[S.live.currentId, D.delay]')).toEqual(['h3', 10]);
  });
});

describe('callbacks waiting to be entered', () => {
  const pending = (page: LegacyApp) =>
    json(
      page,
      'pendingCallbacks().map(p => [p.c.id, p.ev, p.done.id, p.upcoming.id, p.reach, p.nx])',
    );

  it('none before the competition starts', async () => {
    const page = await start();
    expect(pending(page)).toEqual([]);
  });

  it('asks once a couple’s round has been danced, ordered by the next round', async () => {
    const page = await start({ currentId: 'h4', setAt: at(9, 0) });
    expect(pending(page)).toEqual([
      ['c1', 1, 'h1', 'h3', 1, 4],
      ['c3', 1, 'h1', 'h3', 1, 4],
    ]);
  });

  it('keeps asking even after the next round has passed', async () => {
    const page = await start({ currentId: 'h5', setAt: at(9, 5) });
    expect(pending(page)).toEqual([
      ['c1', 1, 'h1', 'h3', 1, 4],
      ['c3', 1, 'h1', 'h3', 1, 4],
      ['c2', 3, 'h4', 'h6', 1, 5],
    ]);
  });

  it('moves on to the following round after a callback and skips cut couples', async () => {
    const page = await start({
      currentId: 'h5',
      setAt: at(9, 5),
      calls: { c1_1: { reach: 4 }, c2_3: { reach: 1, cut: 1 } },
    });
    expect(pending(page)).toEqual([
      ['c3', 1, 'h1', 'h3', 1, 4],
      ['c1', 1, 'h3', 'h5', 4, 5],
    ]);
  });
});

describe('a dancer’s upcoming heats', () => {
  const upcoming = (page: LegacyApp, name: string) =>
    json(page, `upcomingFor(${JSON.stringify(name)}).map(x => [x.h.id, x.c.id, x.maybe])`);

  it('lists sure and possible heats in schedule order', async () => {
    const page = await start();
    expect(upcoming(page, 'Sam')).toEqual([
      ['h1', 'c3', false],
      ['h3', 'c3', true],
      ['h4', 'c2', false],
      ['h5', 'c3', true],
      ['h6', 'c2', true],
    ]);
  });

  it('includes the heat on the floor and drops earlier ones', async () => {
    const page = await start({ currentId: 'h4', setAt: at(9, 0) });
    expect(upcoming(page, 'Sam')).toEqual([
      ['h4', 'c2', false],
      ['h5', 'c3', true],
      ['h6', 'c2', true],
    ]);
  });
});

describe('alerts', () => {
  it('stay quiet before the competition starts', async () => {
    const page = await start({ prefs: { me: 'Chris' } });
    page.run('checkAlerts()');
    expect(page.takeToast()).toBeNull();
  });

  it('warn within the threshold, then again on deck, once each', async () => {
    const page = await start({ prefs: { me: 'Alex', threshold: 3 } });

    page.run('setCurrent("h0")'); // Alex's next sure heat (h4) is 4 away
    expect(page.takeToast()).toBeNull();

    page.run('setCurrent("h1")');
    expect(page.takeToast()).toBe('Heads up: you dance in 3 heats.');

    page.run('setCurrent("h2")');
    expect(page.takeToast()).toBeNull();

    page.run('setCurrent("h3")');
    expect(page.takeToast()).toBe("You're on deck. Next heat is yours.");

    page.run('checkAlerts()');
    expect(page.takeToast()).toBeNull();
  });

  it('go straight to on deck when the first warning would be 1 heat away', async () => {
    const page = await start({ prefs: { me: 'Chris', threshold: 3 } });
    page.run('setCurrent("h0")');
    expect(page.takeToast()).toBe("You're on deck. Next heat is yours.");
  });

  it('skip heats that depend on a callback', async () => {
    const page = await start({ prefs: { me: 'Jo', threshold: 3 } });
    page.run('setCurrent("h1")'); // Jo's later heats are all "if called back"
    expect(page.takeToast()).toBeNull();
  });
});
