import { SetMetadata } from '@nestjs/common';

export const SKIP_AUDIT_LOG_KEY = 'skip_audit_log';

/**
 * Marks a controller or a single route handler as already covered by a manual,
 * domain-precise `AuditLogService.record()` call — the global `AuditLogInterceptor`
 * skips it to avoid writing a second, lower-fidelity row for the same mutation.
 */
export const SkipAuditLog = () => SetMetadata(SKIP_AUDIT_LOG_KEY, true);
