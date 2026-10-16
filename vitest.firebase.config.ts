import { defineConfig } from 'vitest/config';

// Runs against the Firebase emulators: `npm run test:firebase`.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
