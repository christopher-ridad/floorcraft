import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [preact()],
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    // These need the Firebase emulators: npm run test:emulator.
    exclude: ['tests/emulator/**', 'node_modules/**'],
    environment: 'node',
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
