import { defineConfig } from 'vitest/config';

// Tests that need the Firebase emulators. Run them with `npm run test:emulator`, which starts
// the emulators around the run.
export default defineConfig({
  test: {
    include: ['tests/emulator/**/*.test.ts'],
    environment: 'node',
    // The files share one emulator and reset it between tests.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
