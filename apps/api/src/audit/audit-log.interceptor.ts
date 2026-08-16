import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AuditLogService } from './audit-log.service';
import { SKIP_AUDIT_LOG_KEY } from './skip-audit-log.decorator';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import type { TenantScopedRequest } from '../auth/tenant-context.guard';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

// Keys whose values must never reach an audit row, even in a "generic" snapshot.
const SENSITIVE_KEYS = /password|secret|token|hash|otpauth|recoverycode|authorization|cookie/i;

/**
 * Global fallback audit writer (prompt.md Phase 1.10 / docs/DEBT.md 1-D5).
 *
 * Applies to every mutating request that is NOT flagged `@SkipAuditLog()`. It can
 * only capture what a generic HTTP layer knows: actor, tenant, IP, a best-effort
 * action/entity derived from the route, and a redacted snapshot of the response
 * body as `after` — it has no way to fetch a real "before" row without knowing the
 * entity's shape, so `before` is always null here (see AuditLogService's doc
 * comment for which call sites supply a real diff instead).
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditLog: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const request = context.switchToHttp().getRequest<Request & Partial<AuthenticatedRequest> & Partial<TenantScopedRequest>>();
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_LOG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skip === true || !MUTATING_METHODS.has(request.method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: (body) => {
          this.write(request, body);
        },
      }),
    );
  }

  private write(
    request: Request & Partial<AuthenticatedRequest> & Partial<TenantScopedRequest>,
    responseBody: unknown,
  ): void {
    const routePath = (request.route as { path?: string } | undefined)?.path ?? request.path;
    const segments = routePath.split('/').filter((segment) => segment.length > 0 && !segment.startsWith(':'));
    const resource = segments[segments.indexOf('v1') + 1] ?? segments[0] ?? 'unknown';
    const verb = verbFor(request.method);
    const entityId = typeof request.params?.['id'] === 'string' ? request.params['id'] : null;

    this.auditLog
      .record({
        tenantId: request.tenantContext?.tenantId ?? null,
        actorId: request.user?.userId ?? null,
        action: `${resource}.${verb}`,
        entityType: resource,
        entityId,
        after: redact(responseBody),
        ipAddress: request.ip ?? null,
      })
      .catch((error: unknown) => {
        this.logger.error(`Generic audit write failed: ${String(error)}`);
      });
  }
}

function verbFor(method: string): string {
  switch (method) {
    case 'POST':
      return 'create';
    case 'PUT':
    case 'PATCH':
      return 'update';
    case 'DELETE':
      return 'delete';
    default:
      return method.toLowerCase();
  }
}

/** Deep-redacts anything shaped like a secret before it is persisted. */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = SENSITIVE_KEYS.test(key) ? '[REDACTED]' : redact(val, depth + 1);
    }
    return result;
  }
  return value;
}
