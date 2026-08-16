import { fileURLToPath } from 'node:url';
import { createEslintConfig } from './packages/config/eslint/eslint.base.mjs';

export default createEslintConfig({
  tsconfigRootDir: fileURLToPath(new URL('.', import.meta.url)),
  react: true,
  ignores: ['docs/**', 'infra/**', '*.md', '.github/**'],
});