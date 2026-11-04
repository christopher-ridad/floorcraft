// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AuthUser, InstallPlatform } from '../../src/app/ports';
import type { Preferences } from '../../src/app/preferences';
import { createSession } from '../../src/app/session';
import { createAppStore } from '../../src/app/store';
import type { FloorState } from '../../src/domain/types';
import { backupFromLegacy } from '../../src/infra/legacy/legacyBackup';
import { memoryStorage } from '../../src/infra/storage/keyValueStorage';
import { App } from '../../src/ui/App';
import { createViewState, type Tab } from '../../src/ui/viewState';
import { at } from '../domain/fixture';
import {
  COMPETITION_ID,
  fakeAccess,
  fakeAlertOutput,
  fakeAuth,
  fakePreferences,
  fakeRepository,
  fakeWakeLock,
  fixtureBackup,
  settle,
} from '../app/fakes';

beforeAll(() => {
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
});
afterEach(cleanup);

const captain: AuthUser = {
  uid: 'captain',
  isAnonymous: false,
  displayName: 'Casey',
  email: 'casey@example.com',
};

/** A phone for tests: how it can install the app, and a switch to announce an update. */
function fakeDevice({
  platform = 'other' as InstallPlatform,
  isInstalled = false,
  canPrompt = false,
} = {}) {
  let announceUpdate = () => {};
  const calls: string[] = [];
  return {
    calls,
    announceUpdate: () => announceUpdate(),
    device: {
      install: {
        platform,
        isInstalled,
        onPromptAvailable: (listener: (isAvailable: boolean) => void) => {
          listener(canPrompt);
          return () => {};
        },
        promptInstall: async () => {
          calls.push('promptInstall');
          return true;
        },
      },
      updates: {
        onReady: (listener: () => void) => {
          announceUpdate = listener;
          return () => {};
        },
        apply: () => void calls.push('applyUpdate'),
      },
    },
  };
}

interface Options {
  tab?: Tab;
  device?: ReturnType<typeof fakeDevice>;
  installFirstCode?: string;
  preferences?: Partial<Preferences>;
  floor?: FloorState;
  /** Who is signed in; by default the team's captain, who isn't dancing. */
  signedIn?: AuthUser | null;
  joinCode?: string | null;
  access?: ReturnType<typeof fakeAccess>;
  isOnline?: boolean;
}

async function renderApp({
  tab = 'now',
  preferences,
  floor,
  signedIn = captain,
  joinCode = null,
  access = fakeAccess({ captainUids: ['captain'] }),
  isOnline = true,
  device = fakeDevice(),
  installFirstCode,
}: Options = {}) {
  const backend = fakeRepository(fixtureBackup({ floor }));
  const store = createAppStore({
    repository: backend.repository,
    preferences: fakePreferences({ skipDancerClaim: signedIn === captain, ...preferences }).store,
    clock: { now: () => at(9, 20) },
    alertOutput: fakeAlertOutput().output,
    wakeLock: fakeWakeLock(true).wakeLock,
    connectivity: { isOnline: () => isOnline, onChange: () => () => {} },
    createId: (() => {
      let next = 0;
      return () => `new${++next}`;
    })(),
  });
  const auth = fakeAuth({ signedIn });
  const session = createSession({
    auth: auth.auth,
    access: access.access,
    store,
    joinCode,
    onJoinCodeUsed: () => {},
    createJoinCode: () => 'fresh-code',
  });
  const view = createViewState(memoryStorage({ 'floorcraft:tab': tab }));
  if (installFirstCode) view.installFirstCode.value = installFirstCode;
  render(<App store={store} session={session} view={view} device={device.device} />);
  session.start();
  await settle();
  return { store, session, backend, access, auth, user: userEvent.setup() };
}

const onTheFloor = (itemId: string, setAt = at(9, 0)): FloorState => ({
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
    const { backend } = await renderApp({ preferences: { dancer: 'Chris' } });
    await backend.otherPhone.saveFloor(COMPETITION_ID, onTheFloor('h0'));

    expect(await screen.findByText('On deck')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe("You're on deck. Next heat is yours.");
  });

  it('does not say you are on the floor for a heat you only dance if called back', async () => {
    // Jo's semi-final (h3) is on the floor, but Jo hasn't been marked as called back.
    await renderApp({ preferences: { dancer: 'Jo' }, floor: onTheFloor('h3') });
    expect(await screen.findByText('Jo, waiting on a callback')).toBeTruthy();
    expect(screen.getByText(/On the floor now, if you were called back/)).toBeTruthy();
    expect(screen.queryByText('Jo, you are')).toBeNull();
  });

  it('says when you are waiting on a callback', async () => {
    await renderApp({ preferences: { dancer: 'Jo' }, floor: onTheFloor('h2') });
    expect(await screen.findByText('Jo, waiting on a callback')).toBeTruthy();
  });

  it('asks for callbacks once a round is danced, and records them', async () => {
    const { store, user } = await renderApp({ floor: onTheFloor('h4') });
    expect(await screen.findByText('Callbacks to enter · 2')).toBeTruthy();

    await user.click(screen.getAllByRole('button', { name: 'Called back' })[0] as HTMLElement);
    expect(store.live.value.callbacks).toEqual({ c1_e1: { reachedRound: 4, eliminated: false } });
    expect(screen.getByRole('status').textContent).toBe('Callback saved.');
    // Chris & Brooke danced the semi already, so they're now asked about the final, which
    // sorts them after Sam & Jo.
    expect(await screen.findByText(/Danced the Semi\. Called back to the Final\?/)).toBeTruthy();

    await user.click(screen.getAllByRole('button', { name: 'Not called back' })[0] as HTMLElement);
    expect(store.live.value.callbacks).toMatchObject({
      c3_e1: { reachedRound: 1, eliminated: true },
    });
    expect(await screen.findByText('Callbacks to enter · 1')).toBeTruthy();
  });

  it('flags callbacks still not entered once the next round has started', async () => {
    await renderApp({ floor: onTheFloor('h5') });
    expect(await screen.findByText('Callbacks to enter · 3')).toBeTruthy();
    expect(screen.getAllByText('Overdue')).toHaveLength(2);
    expect(screen.getAllByText(/The Semi has started. Were they called back?/)).toHaveLength(2);
  });

  it('shows when the phone is offline, with changes waiting to sync', async () => {
    const { store, backend } = await renderApp({ isOnline: false });
    expect(screen.getByText('Offline')).toBeTruthy();

    backend.holdWrites();
    store.actions.advanceFloor();
    expect(await screen.findByText('Offline · 1 change waiting')).toBeTruthy();
    backend.releaseWrites();
    expect(await screen.findByText('Offline')).toBeTruthy();
  });

  it('moves the floor with Next and Back, showing the pace', async () => {
    const { user } = await renderApp({ floor: onTheFloor('h3', at(9, 5)) });
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
    const { store, user } = await renderApp({ tab: 'schedule', floor: onTheFloor('h3') });
    await user.click((await screen.findAllByText('Bronze Amer. Smooth (WT)'))[1] as HTMLElement);
    const sheet = screen.getByRole('dialog');

    await user.click(
      within(sheet).getAllByRole('button', { name: 'Called back' })[0] as HTMLElement,
    );
    expect(store.live.value.callbacks).toEqual({ c1_e1: { reachedRound: 4, eliminated: false } });

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

  it('flags entries for events no longer on the schedule, and edits a couple’s events', async () => {
    const { store, user } = await renderApp({ tab: 'setup' });
    expect(await screen.findByText(/1 entry is for events no longer on the schedule/)).toBeTruthy();

    await user.click(screen.getByText('Pat & TBA'));
    await user.selectOptions(
      screen.getAllByLabelText('Add event')[2] as HTMLElement,
      '3 · Newcomer Intl. Cha Cha',
    );
    await user.click(screen.getAllByRole('button', { name: 'Add' })[2] as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'Remove missing event' }));

    expect(store.competition.value.entries['c4']).toEqual(['e3']);
    expect(store.competition.value.missingEntries).toEqual([]);
  });

  it('shows that the sheet is shared', async () => {
    await renderApp({ tab: 'setup' });
    expect(await screen.findByText('Shared with the team.')).toBeTruthy();
  });
});

describe('getting in', () => {
  it('asks a visitor without a link to get one, and lets the captain sign in', async () => {
    const { user } = await renderApp({
      signedIn: null,
      access: fakeAccess({ captainUids: ['google-user'] }),
      preferences: { skipDancerClaim: true },
    });
    expect(screen.getByText(/open the link your captain sent you/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Captain? Sign in with Google' }));
    expect(await screen.findByText('Competition not started')).toBeTruthy();
  });

  it('joins with the team link and asks who you are', async () => {
    const { user, session } = await renderApp({ signedIn: null, joinCode: 'team-code' });
    expect(screen.getByRole('heading', { name: 'Who are you?' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Chris' }));
    expect(await screen.findByText('Chris, your next heat')).toBeTruthy();
    expect(session.membership.value?.dancerId).toBe('chris');
  });

  it('shows names other phones have taken', async () => {
    const access = fakeAccess();
    await access.access.join('other', 'team-code', 'anonymous');
    await access.access.claimDancer('other', 'chris', null);
    await renderApp({ signedIn: null, joinCode: 'team-code', access });

    const chris = screen.getByRole('button', { name: /^Chris/ }) as HTMLButtonElement;
    expect(chris.disabled).toBe(true);
    expect(within(chris).getByText('Taken')).toBeTruthy();
  });

  it('explains a join link that no longer works', async () => {
    await renderApp({ signedIn: null, joinCode: 'old-code' });
    expect(screen.getByRole('heading', { name: "That join link didn't work" })).toBeTruthy();
  });

  it('lets a Google account create the team the first time', async () => {
    const access = fakeAccess({ teamExists: false });
    const { user } = await renderApp({
      signedIn: { ...captain, uid: 'founder' },
      access,
    });
    expect(screen.getByRole('heading', { name: "You're not on the team yet" })).toBeTruthy();

    await user.click(screen.getByText('Setting up the team for the first time?'));
    await user.type(screen.getByLabelText('Team name'), 'Purdue Ballroom');
    await user.type(screen.getByLabelText('First competition'), 'Purdue Ballroom Classic');
    await user.type(screen.getByLabelText('Date'), '2026-11-14');
    await user.click(screen.getByRole('button', { name: 'Create the team' }));

    expect(await screen.findByRole('heading', { name: 'Who are you?' })).toBeTruthy();
    expect(access.state.captainUids).toEqual(['founder']);
  });
});

describe('Setup for members and captains', () => {
  it('shows members only this phone’s settings and their account', async () => {
    const access = fakeAccess();
    await access.access.join('phone', 'team-code', 'anonymous');
    await access.access.claimDancer('phone', 'sam', null);
    await renderApp({
      tab: 'setup',
      signedIn: { uid: 'phone', isAnonymous: true, displayName: null, email: null },
      access,
    });

    expect(screen.getByText('Joined with the team link on this phone')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep me signed in on any device' })).toBeTruthy();
    expect(screen.queryByText('Team link')).toBeNull();
    expect(screen.queryByText('Couples & entries')).toBeNull();
  });

  it('gives captains the team link, and a way to replace it', async () => {
    const { user } = await renderApp({ tab: 'setup' });
    const link = screen.getByLabelText('Team link') as HTMLInputElement;
    expect(link.value).toMatch(/#join=team-code$/);

    await user.click(screen.getByRole('button', { name: 'Make a new link' }));
    await user.click(screen.getByRole('button', { name: 'Make new link' }));
    expect((screen.getByLabelText('Team link') as HTMLInputElement).value).toMatch(
      /#join=fresh-code$/,
    );
  });

  it('lets someone change which dancer they are', async () => {
    const { user, session } = await renderApp({ tab: 'setup' });
    await user.click(screen.getByRole('button', { name: 'Pick my name' }));
    await user.click(screen.getByRole('button', { name: 'Jo' }));

    expect(await screen.findByRole('button', { name: 'Change' })).toBeTruthy();
    expect(session.membership.value?.dancerId).toBe('jo');
  });
});

describe('backups', () => {
  const backupFile = (contents: unknown) =>
    new File([JSON.stringify(contents)], 'backup.json', { type: 'application/json' });

  it('restores the migrated Purdue data from a file', async () => {
    const legacy = (name: string): unknown =>
      JSON.parse(readFileSync(resolve('tests/fixtures/legacy-artifact', `${name}.json`), 'utf8'));
    const { backup } = backupFromLegacy(
      { schedule: legacy('schedule'), entries: legacy('entries') },
      { name: 'Purdue Ballroom Classic', date: '2026-11-14', status: 'active' },
      () => crypto.randomUUID(),
    );
    const { user, store } = await renderApp({ tab: 'setup' });

    await user.upload(screen.getByLabelText('Restore from a backup'), backupFile(backup));
    expect(await screen.findByText(/makes/, { exact: false })).toBeTruthy();
    expect(screen.getByText('Purdue Ballroom Classic', { selector: 'b' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Restore' }));

    expect(store.activeCompetition.value?.name).toBe('Purdue Ballroom Classic');
    expect(store.schedule.value).toHaveLength(147);
    expect(screen.getByRole('status').textContent).toBe('Backup restored.');
  });

  it('refuses a file that isn’t a backup', async () => {
    const { user, store } = await renderApp({ tab: 'setup' });
    await user.upload(screen.getByLabelText('Restore from a backup'), backupFile({ hello: 1 }));

    expect(await screen.findByText('This is not a team backup file.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
    expect(store.activeCompetition.value?.name).toBe('Classic');
  });
});

describe('installing the app', () => {
  it('shows iPhone users the Home Screen steps, until dismissed', async () => {
    const { user } = await renderApp({ device: fakeDevice({ platform: 'ios' }) });
    expect(screen.getByText('Install Heat Sheet')).toBeTruthy();
    expect(screen.getByText(/Add to Home Screen/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByText('Install Heat Sheet')).toBeNull();
  });

  it('offers the browser’s install prompt on Android', async () => {
    const device = fakeDevice({ platform: 'android', canPrompt: true });
    const { user } = await renderApp({ device });
    await user.click(await screen.findByRole('button', { name: 'Install app' }));
    expect(device.calls).toEqual(['promptInstall']);
  });

  it('says nothing once installed, or where installing isn’t offered', async () => {
    await renderApp({ device: fakeDevice({ platform: 'ios', isInstalled: true }) });
    expect(screen.queryByText('Install Heat Sheet')).toBeNull();
    cleanup();
    await renderApp({ device: fakeDevice({ platform: 'android', canPrompt: false }) });
    expect(screen.queryByText('Install Heat Sheet')).toBeNull();
  });

  it('asks iPhone Safari users with a team link to install first, showing the code', async () => {
    const { user, session } = await renderApp({ signedIn: null, installFirstCode: 'team-code' });
    expect(
      screen.getByRole('heading', { name: 'First, add Heat Sheet to your Home Screen' }),
    ).toBeTruthy();
    expect(screen.getByText('team-code')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Join in Safari instead' }));
    expect(await screen.findByRole('heading', { name: 'Who are you?' })).toBeTruthy();
    expect(session.membership.value).not.toBeNull();
  });

  it('joins with a team code typed into the app', async () => {
    const { user } = await renderApp({ signedIn: null });
    await user.type(screen.getByLabelText('Team code'), 'team-code');
    await user.click(screen.getByRole('button', { name: 'Join the team' }));
    expect(await screen.findByRole('heading', { name: 'Who are you?' })).toBeTruthy();
  });

  it('offers to reload when a new version is ready', async () => {
    const device = fakeDevice();
    const { user } = await renderApp({ device });
    expect(screen.queryByText('A new version is ready.')).toBeNull();

    device.announceUpdate();
    await user.click(await screen.findByRole('button', { name: 'Reload' }));
    expect(device.calls).toEqual(['applyUpdate']);
  });
});
