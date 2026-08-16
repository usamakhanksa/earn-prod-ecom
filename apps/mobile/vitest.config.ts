import { defineConfig } from 'vitest/config';

// See packages/shared/vitest.config.ts (local-config-stops-upward-search) and
// apps/web/vitest.config.ts (esbuild.jsx) for why both of these exist.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
    globals: false,
  },
});
