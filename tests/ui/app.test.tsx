// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { CompetitionDocuments } from '../../src/app/ports';
import type { Preferences } from '../../src/app/preferences';
import { createAppStore, EMPTY_LIVE } from '../../src/app/store';
import { memoryStorage } from '../../src/infra/storage/keyValueStorage';
import { App } from '../../src/ui/App';
import { createViewState, type Tab } from '../../src/ui/viewState';
import { at, couples, schedule } from '../domain/fixture';
import {
  fakeAlertOutput,
  fakeConnector,
  fakePreferences,
  fakeWakeLock,
  FakeSync,
} from '../app/fakes';

beforeAll(() => {
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
});
afterEach(cleanup);

interface Options {
  tab?: Tab;
  preferences?: Partial<Preferences>;
  live?: CompetitionDocuments['live'];
}

async function renderApp({ tab = 'now', preferences, live = EMPTY_LIVE }: Options = {}) {
  const shared = new FakeSync('shared', { schedule, entries: couples, live });
  const store = createAppStore({
    sync: fakeConnector(Promise.resolve(shared)).connector,
    preferences: fakePreferences(preferences).store,
    clock: { now: () => at(9, 20) },
    alertOutput: fakeAlertOutput().output,
    wakeLock: fakeWakeLock(true).wakeLock,
    createId: (() => {
      let next = 0;
      return () => `new${++next}`;
    })(),
  });
  const view = createViewState(memoryStorage({ 'floorcraft:tab': tab }));
  render(<App store={store} view={view} />);
  await store.start();
  return { store, shared, user: userEvent.setup() };
}

const onTheFloor = (itemId: string, setAt = at(9, 0)) => ({
  ...EMPTY_LIVE,
  currentItemId: itemId,
  currentSetAt: setAt,
});

describe('Now tab', () => {
  it('starts the competition from the first heat', async () => {
    const { store, user } = await renderApp();
    expect(await screen.findByText('Competition not started')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'First heat is on the floor' }));
    expect(await screen.findByText('Smooth Events')).toBeTruthy();
    expect(store.live.value.currentItemId).toBe('h0');
  });

  it('asks who you are, then shows your next heat', async () => {
    const { user } = await renderApp();
    await user.selectOptions(await screen.findByLabelText(/Who are you\?/), 'Alex');

    expect(await screen.findByText('Alex, your next heat')).toBeTruthy();
    expect(screen.getByText('At 9:00 AM')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Alerts set for Alex.');
  });

  it('counts down the heats and alerts when you are on deck', async () => {
    const { shared } = await renderApp({ preferences: { dancer: 'Chris' } });
    shared.emit('live', onTheFloor('h0'));

    expect(await screen.findByText('On deck')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe("You're on deck. Next heat is yours.");
  });

  it('says when you are waiting on a callback', async () => {
    await renderApp({ preferences: { dancer: 'Jo' }, live: onTheFloor('h2') });
    expect(await screen.findByText('Jo, waiting on a callback')).toBeTruthy();
  });

  it('asks for callbacks once a round is danced, and records them', async () => {
    const { store, user } = await renderApp({ live: onTheFloor('h4') });
    expect(await screen.findByText('Callbacks to enter · 2')).toBeTruthy();

    await user.click(screen.getAllByRole('button', { name: 'Called back' })[0] as HTMLElement);
    expect(store.live.value.callbacks).toEqual({ c1_1: { reachedRound: 4, eliminated: false } });
    expect(screen.getByRole('status').textContent).toBe('Callback saved.');
    // Chris & Brooke danced the semi already, so they're now asked about the final, which
    // sorts them after Sam & Jo.
    expect(await screen.findByText(/Danced the Semi\. Called back to the Final\?/)).toBeTruthy();

    await user.click(screen.getAllByRole('button', { name: 'Not called back' })[0] as HTMLElement);
    expect(store.live.value.callbacks).toMatchObject({
      c3_1: { reachedRound: 1, eliminated: true },
    });
    expect(await screen.findByText('Callbacks to enter · 1')).toBeTruthy();
  });

  it('moves the floor with Next and Back, showing the pace', async () => {
    const { user } = await renderApp({ live: onTheFloor('h3', at(9, 5)) });
    expect(await screen.findByText('10 min behind')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Next heat is up' }));
    expect(await screen.findByText('20 min behind')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Previous heat' }));
    expect(await screen.findByText('20 min behind')).toBeTruthy();
  });
});

describe('Schedule tab', () => {
  const listedEvents = () =>
    screen.queryAllByText(/^(Bronze|Newcomer|Smooth Events)/).map((element) => element.textContent);

  it('filters the team, your own and the entire schedule', async () => {
    const { user } = await renderApp({ tab: 'schedule' });
    await screen.findByRole('group', { name: 'Filter heats' });
    expect(listedEvents()).toContain('Smooth Events');

    await user.click(screen.getByRole('button', { name: 'My Schedule' }));
    expect(await screen.findByText(/Pick your name on the People tab/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Entire Schedule' }));
    expect(await screen.findAllByText('Bronze Amer. Smooth (WT)')).toHaveLength(3);
  });

  it('hides heats that depend on a callback when asked', async () => {
    const { user } = await renderApp({ tab: 'schedule' });
    expect(await screen.findAllByText('If called back')).toHaveLength(3);

    await user.click(screen.getByRole('switch', { name: 'Show possible callbacks' }));
    expect(screen.queryAllByText('If called back')).toHaveLength(0);
  });
});

describe('heat sheet', () => {
  it('opens from a heat, marks it on the floor, and closes', async () => {
    const { store, user } = await renderApp({ tab: 'schedule' });
    await user.click((await screen.findAllByText('Newcomer Intl. Cha Cha'))[0] as HTMLElement);

    const sheet = screen.getByRole('dialog', { name: 'Heat details' });
    await user.click(within(sheet).getByRole('button', { name: 'This heat is on the floor now' }));
    expect(store.live.value.currentItemId).toBe('h4');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('records a callback for one couple and can undo it', async () => {
    const { store, user } = await renderApp({ tab: 'schedule', live: onTheFloor('h3') });
    await user.click((await screen.findAllByText('Bronze Amer. Smooth (WT)'))[1] as HTMLElement);
    const sheet = screen.getByRole('dialog');

    await user.click(
      within(sheet).getAllByRole('button', { name: 'Called back' })[0] as HTMLElement,
    );
    expect(store.live.value.callbacks).toEqual({ c1_1: { reachedRound: 4, eliminated: false } });

    await user.click(await within(sheet).findByRole('button', { name: 'Undo' }));
    expect(store.live.value.callbacks).toEqual({});
  });

  it('fixes a line, rejecting a bad time', async () => {
    const { store, user } = await renderApp({ tab: 'schedule' });
    await user.click(await screen.findByText('Smooth Events'));
    const sheet = screen.getByRole('dialog');
    const time = within(sheet).getByLabelText('Time');

    await user.clear(time);
    await user.type(time, 'later');
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('status').textContent).toBe('Write the time like 9:39 AM.');

    await user.clear(time);
    await user.type(time, '8:25 am');
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(store.schedule.value[0]).toMatchObject({ scheduledTime: '8:25 AM' });
  });
});

describe('People tab', () => {
  it('shows each dancer’s heats and sets alerts for them', async () => {
    const { store, user } = await renderApp({ tab: 'people' });
    await user.click(await screen.findByRole('button', { name: /^Sam/ }));

    expect(await screen.findByText("Sam's day · 2 for sure, 3 if called back")).toBeTruthy();
    expect(screen.getAllByText('with Jo').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: "I'm Sam" }));
    expect(store.preferences.value.dancer).toBe('Sam');
  });
});

describe('Setup tab', () => {
  it('replaces the schedule from pasted text', async () => {
    const { store, user } = await renderApp({ tab: 'setup' });
    const box = await screen.findByLabelText('Schedule text');
    await user.click(box);
    await user.paste('9:00 AM [1] Bronze Amer. Smooth 1st Round (WT)');

    expect(await screen.findByText('1 heats found')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Replace schedule' }));
    expect(store.schedule.value).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toBe('Schedule replaced: 1 heats.');
  });

  it('flags unmatched entries and lets you pick the event', async () => {
    const { store, user } = await renderApp({ tab: 'setup' });
    expect(await screen.findByText(/1 entry doesn’t match any heat/)).toBeTruthy();

    await user.click(screen.getByText('Pat & TBA'));
    await user.selectOptions(
      screen.getByLabelText('Pick event for Gold Intl. Tango'),
      '3 · Newcomer Intl. Cha Cha',
    );
    expect(store.competition.value.unmatchedEntries).toEqual([]);
  });

  it('shows that the sheet is shared', async () => {
    await renderApp({ tab: 'setup' });
    expect(await screen.findByText('Shared with the team.')).toBeTruthy();
  });
});
