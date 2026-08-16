import { createRequire } from 'node:module';

/**
 * Trademark of the "Corporate Precision" design system (prompt.md) mapped onto Tailwind.
 * Values reference CSS custom properties defined in @omnisell/ui/tokens.css.
 */
const require = createRequire(import.meta.url);

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        ink: {
          50: 'var(--ink-50)',
          100: 'var(--ink-100)',
          200: 'var(--ink-200)',
          400: 'var(--ink-400)',
          600: 'var(--ink-600)',
          700: 'var(--ink-700)',
          800: 'var(--ink-800)',
          900: 'var(--ink-900)',
          950: 'var(--ink-950)',
        },
        brand: {
          soft: 'var(--brand-soft)',
          400: 'var(--brand-400)',
          500: 'var(--brand-500)',
          600: 'var(--brand-600)',
        },
        accent: {
          500: 'var(--accent-500)',
          600: 'var(--accent-600)',
        },
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        info: 'var(--info)',
        consumer: {
          accent: 'var(--consumer-accent)',
          surface: 'var(--surface-consumer)',
        },
      },
      borderRadius: {
        consumer: 'var(--radius-consumer)',
      },
      boxShadow: {
        sh1: 'var(--sh-1)',
        sh2: 'var(--sh-2)',
        sh3: 'var(--sh-3)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      transitionTimingFunction: {
        base: 'var(--ease)',
      },
    },
  },
};