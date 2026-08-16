/**
 * Fallback DTO types used until `pnpm openapi:gen` produces types.openapi.gen.ts
 * from the live OpenAPI document. Keep in sync, then delete after generation lands.
 */
export interface HealthCheckReport {
  status: 'ok' | 'degraded' | 'down';
  checks: Record<string, 'ok' | 'degraded' | 'down'>;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
}