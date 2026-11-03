import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

// Paths are relative to the project root, where Playwright runs.
const appUrl = pathToFileURL(resolve('dist/index.html')).href;
const sample = (file: string) => readFileSync(resolve('data', file), 'utf8');

const tab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name });

test('runs a competition morning on this phone only', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Fonts come from Google; the app must work without them.
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());

  await page.goto(appUrl);
  await expect(page.getByRole('img', { name: 'This phone only' })).toBeVisible();
  await expect(page.getByText('No schedule yet')).toBeVisible();

  // Load the sample schedule and partnerships.
  await page.getByRole('button', { name: 'Open Setup' }).click();
  await page.getByLabel('Schedule text').fill(sample('schedule-2025-tentative.txt'));
  await expect(page.getByText('139 heats found')).toBeVisible();
  await page.getByRole('button', { name: 'Replace schedule' }).click();
  await expect(page.getByRole('status')).toHaveText('Schedule replaced: 139 heats.');

  await page.getByLabel('Partnerships text').fill(sample('partnerships-2026.txt'));
  await page.getByRole('button', { name: 'Replace couples' }).click();
  await expect(page.getByRole('status')).toHaveText('20 couples loaded.');
  await expect(page.getByText(/doesn’t match any heat|don’t match any heat/)).toHaveCount(0);

  // Pick who this phone alerts for.
  await page.getByLabel('I am').selectOption('Chris');

  // Start the competition and move through the first heats.
  await tab(page, 'Now').click();
  await expect(page.getByText('Chris, your next heat')).toBeVisible();
  await page.getByRole('button', { name: 'First heat is on the floor' }).click();
  await expect(page.getByText('American Style Smooth Events')).toBeVisible();
  await page.getByRole('button', { name: 'Next heat is up' }).click();
  await expect(page.getByText(/On the floor · Heat 1/)).toBeVisible();

  // The schedule tab shows the team's heats with the floor marked.
  await tab(page, 'Schedule').click();
  await expect(page.getByRole('button', { name: 'Team Schedule' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('[data-now]')).toHaveCount(1);

  // Everything survives a reload, including the tab.
  await page.reload();
  await expect(page.locator('[data-now]')).toHaveCount(1);
  await tab(page, 'Now').click();
  await expect(page.getByText(/On the floor · Heat 1/)).toBeVisible();

  expect(errors).toEqual([]);
});
