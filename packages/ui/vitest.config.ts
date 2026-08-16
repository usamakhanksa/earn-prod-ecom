import { defineConfig } from 'vitest/config';

// See packages/shared/vitest.config.ts for why this file needs to exist at all.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
    globals: false,
  },
});
