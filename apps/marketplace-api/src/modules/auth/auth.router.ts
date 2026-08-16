import { Router } from 'express';
import { loginSchema, registerSchema } from '@marketplace/shared';
import { createUserRepository } from '../../repositories/repository-factory.js';
import { AuthService } from './auth.service.js';
import { AUTH_COOKIE_NAME } from './jwt.js';
import { requireAuth } from '../../middleware/auth.guard.js';
import { NotFoundError } from '../../middleware/error-handler.js';

export const authRouter = Router();

const authService = new AuthService(createUserRepository());

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function setAuthCookie(res: import('express').Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SEVEN_DAYS_MS,
    path: '/',
  });
}

authRouter.post('/register', async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const result = await authService.register(input);
    setAuthCookie(res, result.token);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const result = await authService.login(input);
    setAuthCookie(res, result.token);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, { path: '/' });
  res.status(200).json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const sub = req.user?.sub;
    if (!sub) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }
    const user = await authService.getSanitizedUser(sub);
    if (!user) {
      throw new NotFoundError('User no longer exists.');
    }
    res.status(200).json(user);
  } catch (err) {
    next(err);
  }
});
