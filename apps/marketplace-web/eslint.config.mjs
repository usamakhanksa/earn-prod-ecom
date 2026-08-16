import { fileURLToPath } from 'node:url';
import { createMarketplaceEslintConfig } from '@marketplace/config/eslint/eslint.base.mjs';

export default createMarketplaceEslintConfig({
  tsconfigRootDir: fileURLToPath(new URL('.', import.meta.url)),
  react: true,
  ignores: ['.next/**'],
});
