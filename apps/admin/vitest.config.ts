import { defineConfig } from 'vitest/config';

// See apps/web/vitest.config.ts for why `esbuild.jsx` is set explicitly here.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
    globals: false,
  },
});
