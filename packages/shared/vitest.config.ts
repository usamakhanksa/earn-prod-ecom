import { defineConfig } from 'vitest/config';

// An explicit local config stops Vite's upward config search at this
// directory — without one, `vitest run` from inside this package walks past
// the monorepo root and can pick up an unrelated `vite.config.ts` belonging to
// a sibling project on disk (this sandbox nests the repo inside a parent
// folder full of unrelated scratch projects). See docs/DEBT.md.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
    globals: false,
  },
});
