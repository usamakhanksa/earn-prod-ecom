import { Router } from 'express';
import { env } from '../../env.js';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    mockMode: env.MOCK_MODE,
    timestamp: new Date().toISOString(),
  });
});
