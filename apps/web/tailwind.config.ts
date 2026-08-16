import type { Config } from 'tailwindcss';
import omnisellPreset from '@omnisell/config/tailwind';

export default {
  presets: [omnisellPreset],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
} satisfies Config;