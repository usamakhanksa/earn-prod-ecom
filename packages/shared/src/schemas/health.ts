import { z } from 'zod';

export const healthStatusSchema = z.enum(['ok', 'degraded', 'down']);
export type HealthStatus = z.infer<typeof healthStatusSchema>;

export interface HealthChecks {
  [name: string]: HealthStatus;
}

export interface HealthReport {
  status: HealthStatus;
  checks: HealthChecks;
}