import { defineConfig } from 'vitest/config';

// See packages/shared/vitest.config.ts for why this file needs to exist at all.
// `esbuild.jsx: 'automatic'` overrides this app's tsconfig `"jsx": "preserve"`
// (Next.js compiles JSX itself at build/dev time) — without it, Vite's default
// esbuild transform falls back to the classic runtime and every .tsx test needs
// its own `import React from 'react'` just to satisfy `React.createElement`.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
    globals: false,
  },
});
