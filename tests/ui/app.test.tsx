// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Preferences } from '../../src/app/preferences';
import { createAppStore } from '../../src/app/store';
import { preferencesStorage } from '../../src/infra/platform/preferencesStorage';
import { memoryStorage } from '../../src/infra/storage/keyValueStorage';
import { App } from '../../src/ui/App';
import { createViewState, type Tab } from '../../src/ui/viewState';

beforeAll(() => {
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Two days before the competition, and on the day itself. */
const BEFORE = new Date(2026, 10, 12, 18, 0);
const ON_THE_DAY = (hours: number, minutes: number) => new Date(2026, 10, 14, hours, minutes);

interface Options {
  tab?: Tab;
  now?: Date;
  preferences?: Partial<Preferences>;
}

function renderApp({ tab = 'now', now = BEFORE, preferences = {} }: Options = {}) {
  // Only the clock is faked; timers run normally.
  vi.useFakeTimers({ toFake: ['Date'], now });
  const storage = memoryStorage({ 'floorcraft:tab': tab });
  preferencesStorage(storage).save({ dancer: '', showPossibleHeats: true, ...preferences });
  const store = createAppStore({
    preferences: preferencesStorage(storage),
    clock: { now: () => Date.now() },
  });
  render(<App store={store} view={createViewState(storage)} />);
  return { store, user: userEvent.setup() };
}

describe('the site', () => {
  it('has three sections and nothing to sign in to', () => {
    renderApp();
    const tabs = within(screen.getByRole('navigation', { name: 'Sections' })).getAllByRole(
      'button',
    );
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Now', 'Schedule', 'People']);
    expect(screen.queryByText(/sign in|team link|notification/i)).toBeNull();
    expect(screen.getByText('Sat, Nov 14')).toBeTruthy();
  });
});

describe('Now tab', () => {
  it('before the day: asks who you are, then shows your first heat', async () => {
    const { user } = renderApp();
    expect(screen.queryByText(/not started|happening now/i)).toBeNull();

    await user.selectOptions(screen.getByLabelText(/Who are you\?/), 'Chris');

    expect(await screen.findByText('Chris, your next heat')).toBeTruthy();
    expect(screen.getByText('At 8:07 AM')).toBeTruthy();
    expect(screen.getByText(/Bronze Amer\. Smooth \(WT\) · 1st Round with Brooke/)).toBeTruthy();
  });

  it('on the day: follows the posted times', () => {
    renderApp({ now: ON_THE_DAY(8, 20), preferences: { dancer: 'Chris' } });
    expect(screen.getByText('Chris, you are')).toBeTruthy();
    expect(screen.getByText('On the floor now')).toBeTruthy();
  });

  it('marks a heat that depends on a callback', () => {
    // Chris's 1st rounds are done, and the 2nd round (8:29) depends on a callback.
    renderApp({ now: ON_THE_DAY(8, 30), preferences: { dancer: 'Chris' } });
    expect(screen.getByText('Chris, waiting on a callback')).toBeTruthy();
  });
});

describe('Schedule tab', () => {
  it('shows the team, your own, or the entire schedule', async () => {
    const { user } = renderApp({ tab: 'schedule', preferences: { dancer: 'Nathanio' } });
    const heats = () => document.querySelectorAll('[data-heat-row]').length;
    expect(heats()).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'My Schedule' }));
    // Nathanio & Phoebe dance Newcomer Amer. Waltz: four rounds.
    expect(heats()).toBe(4);

    await user.click(screen.getByRole('button', { name: 'Entire Schedule' }));
    expect(heats()).toBe(145);
    expect(screen.getByText('Latin Awards')).toBeTruthy();
  });

  it('hides heats that depend on a callback when asked', async () => {
    const { user } = renderApp({ tab: 'schedule', preferences: { dancer: 'Nathanio' } });
    await user.click(screen.getByRole('button', { name: 'My Schedule' }));
    await user.click(screen.getByRole('switch', { name: 'Show possible callbacks' }));
    expect(document.querySelectorAll('[data-heat-row]')).toHaveLength(1);
  });
});

describe('People tab', () => {
  it('shows each dancer’s day, and follows one on this device', async () => {
    const { user, store } = renderApp({ tab: 'people' });
    await user.click(screen.getByRole('button', { name: /^Brooke/ }));
    expect(screen.getByRole('heading', { name: /Brooke's day · 13 for sure/ })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: "I'm Brooke" }));
    expect(store.preferences.value.dancer).toBe('Brooke');
    expect(screen.getByRole('status').textContent).toBe('My Schedule now shows Brooke.');
  });
});
