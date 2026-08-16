import { describe, expect, it, beforeEach } from 'vitest';
import { AuthService, AuthError } from '../src/modules/auth/auth.service.js';
import { MockUserRepository } from '../src/repositories/user.repository.mock.js';

describe('AuthService (against the mock repository — MOCK_MODE path)', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService(new MockUserRepository());
  });

  it('registers a new USER and returns a sanitized user + token', async () => {
    const result = await service.register({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'super-secret-1',
    });
    expect(result.user.email).toBe('ada@example.com');
    expect(result.user.role).toBe('USER');
    expect(result.token).toBeTruthy();
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('rejects registering the same email twice', async () => {
    await service.register({ name: 'Ada', email: 'ada@example.com', password: 'super-secret-1' });
    await expect(
      service.register({ name: 'Ada 2', email: 'ada@example.com', password: 'super-secret-2' }),
    ).rejects.toThrow(AuthError);
  });

  it('logs in with correct credentials', async () => {
    await service.register({ name: 'Ada', email: 'ada@example.com', password: 'super-secret-1' });
    const result = await service.login({ email: 'ada@example.com', password: 'super-secret-1' });
    expect(result.user.email).toBe('ada@example.com');
  });

  it('rejects login with a wrong password', async () => {
    await service.register({ name: 'Ada', email: 'ada@example.com', password: 'super-secret-1' });
    await expect(
      service.login({ email: 'ada@example.com', password: 'wrong' }),
    ).rejects.toThrow(AuthError);
  });

  it('rejects login for an unknown email', async () => {
    await expect(
      service.login({ email: 'nobody@example.com', password: 'whatever' }),
    ).rejects.toThrow(AuthError);
  });
});
