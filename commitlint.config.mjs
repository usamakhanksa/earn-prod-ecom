// Root-level git hooks & commit policy (Phase 0.1).
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'chore', 'docs', 'refactor', 'test', 'build', 'ci', 'perf', 'revert']],
    'subject-case': [0],
  },
};