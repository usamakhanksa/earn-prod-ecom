import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AuthError } from '../modules/auth/auth.service.js';
import { ProviderNotConfiguredError } from '../providers/marketplace-provider.js';

export class NotFoundError extends Error {}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      message: 'Validation failed.',
      issues: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
    return;
  }

  if (err instanceof AuthError) {
    res.status(err.status).json({ message: err.message });
    return;
  }

  if (err instanceof NotFoundError) {
    res.status(404).json({ message: err.message || 'Not found.' });
    return;
  }

  if (err instanceof ProviderNotConfiguredError) {
    res.status(503).json({ message: err.message });
    return;
  }

  // eslint-disable-next-line no-console
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Internal server error.' });
}
