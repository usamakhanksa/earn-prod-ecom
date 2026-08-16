/**
 * Shared ESLint flat config for the GlobalMart (marketplace-*) workspaces.
 * Intentionally standalone from @omnisell/config — this app family shares
 * only root-level monorepo tooling conventions with OmniSell, not its
 * concrete config package. Base rules: no `any`, no unused vars, no
 * console.log (warn/error allowed). React additions (web/mobile): hooks +
 * jsx-a11y recommended rules.
 */
import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * @param {{ tsconfigRootDir: string, react?: boolean, ignores?: string[] }} options
 */
export function createMarketplaceEslintConfig({ tsconfigRootDir, react = false, ignores = [] }) {
  const a11yRules =
    jsxA11y?.flatConfigs?.recommended?.rules ?? jsxA11y?.configs?.recommended?.rules ?? {};

  return [
    {
      ignores: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.next/**',
        '**/.expo/**',
        '**/coverage/**',
        '**/.turbo/**',
        '**/*.gen.ts',
        ...ignores,
      ],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        'no-console': ['error', { allow: ['warn', 'error'] }],
      },
    },
    ...(react
      ? [
          {
            plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
            rules: {
              ...a11yRules,
              'react-hooks/rules-of-hooks': 'error',
              'react-hooks/exhaustive-deps': 'warn',
            },
          },
        ]
      : []),
    prettierConfig,
  ];
}
