import { defineConfig, devices } from '@playwright/test';

// Browser tests run against the app built in emulator mode (`npm run build:emulator`), served
// locally, with the Firebase emulators running (`npm run test:e2e` starts them).
const PORT = 4174;

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  // The tests share one emulator database.
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'phone', use: { ...devices['Pixel 7'] } }],
});
