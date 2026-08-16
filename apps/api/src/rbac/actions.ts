/** CASL actions (prompt.md Phase 1.4). `manage` is CASL's built-in wildcard. */
export const ACTIONS = ['manage', 'create', 'read', 'update', 'delete', 'invite'] as const;
export type Action = (typeof ACTIONS)[number];
