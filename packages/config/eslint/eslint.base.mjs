/**
 * Shared ESLint flat config for all OmniSell workspaces.
 * Base enforcements from prompt.md: no `any`, no `@ts-ignore`, no console.log.
 * React additions (web/admin/mobile): hooks + jsx-a11y recommended rules.
 */
import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * @param {{ tsconfigRootDir: string, react?: boolean, ignores?: string[] }} options
 */
export function createEslintConfig({ tsconfigRootDir, react = false, ignores = [] }) {
  const a11yRules = jsxA11y?.flatConfigs?.recommended?.rules ?? jsxA11y?.configs?.recommended?.rules ?? {};

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
          // NOTE: an attempt to fix the "was not found by the project service"
          // errors below via `projectService: { allowDefaultProject: [...] }`
          // was reverted in the Phase 1 follow-up pass — it caused `pnpm lint`
          // to blow up node's memory (multi-GB per worker) and crash instead of
          // finishing, apparently because `allowDefaultProject`'s wide-project
          // fallback tries to build a full type-checked program per matched
          // file across this monorepo's size. Left as plain `true` (the
          // pre-existing, known-slow-but-finite behaviour) — see docs/DEBT.md
          // 1-D8 for the real fix (a dedicated, carefully-scoped pass).
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