/**
 * The built app, served and talking to the Firebase emulators: two phones join with the team link,
 * and what one does shows up on the other. Run with `npm run test:e2e`.
 */
import { expect, test, type Page } from '@playwright/test';
import { closeSeed, JOIN_CODE, seedTeam } from './seed';

test.beforeEach(() => seedTeam());
test.afterAll(() => closeSeed());

const tab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name });

/** Opens the app on a fresh phone with the team link and picks a name. */
async function joinAs(page: Page, name: string) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Fonts come from Google; the app must work without them.
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());

  await page.goto(`/#join=${JOIN_CODE}`);
  await expect(page.getByRole('heading', { name: 'Who are you?' })).toBeVisible();
  // The join code is cleared from the address bar once used.
  await expect.poll(() => new URL(page.url()).hash).toBe('');
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.getByText(`${name}, your next heat`)).toBeVisible();
  return errors;
}

test('two phones join with the team link and see each other’s changes', async ({ browser }) => {
  const chrisPhone = await (await browser.newContext()).newPage();
  const brookePhone = await (await browser.newContext()).newPage();
  const chrisErrors = await joinAs(chrisPhone, 'Chris');
  const brookeErrors = await joinAs(brookePhone, 'Brooke');

  // Chris is taken now, so a third phone can't pick that name.
  const thirdPhone = await (await browser.newContext()).newPage();
  await thirdPhone.goto(`/#join=${JOIN_CODE}`);
  await expect(thirdPhone.getByRole('button', { name: /^Chris/ })).toBeDisabled();

  // Brooke's phone starts the competition; Chris's phone follows along.
  await brookePhone.getByRole('button', { name: 'First heat is on the floor' }).click();
  await brookePhone.getByRole('button', { name: 'Next heat is up' }).click();
  await expect(chrisPhone.getByText(/On the floor · Heat 1/)).toBeVisible();

  // Members see their phone's settings, not the captain's setup.
  await tab(chrisPhone, 'Setup').click();
  await expect(chrisPhone.getByText('Joined with the team link on this phone')).toBeVisible();
  await expect(chrisPhone.getByText('Couples & entries')).toHaveCount(0);

  // The phone stays on the team after a reload.
  await chrisPhone.reload();
  await tab(chrisPhone, 'Now').click();
  await expect(chrisPhone.getByText(/On the floor · Heat 1/)).toBeVisible();

  expect([...chrisErrors, ...brookeErrors]).toEqual([]);
});

test('a visitor without the link is asked for it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/open the link your captain sent you/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Captain? Sign in with Google' })).toBeVisible();
});

test('an old link is refused', async ({ page }) => {
  await page.goto('/#join=not-the-code');
  await expect(page.getByRole('heading', { name: "That join link didn't work" })).toBeVisible();
});
