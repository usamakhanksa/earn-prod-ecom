import type { AuthUser, Role } from '@marketplace/shared';
import type { UserRepository, UserRecord } from '../../repositories/user.repository.js';
import { hashPassword, verifyPassword } from './password.js';
import { signToken } from './jwt.js';

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface RegisterParams {
  name: string;
  email: string;
  password: string;
  /**
   * Defaults to USER. Built generically so a later pass can add
   * SUPPLIER/AFFILIATE self-registration surfaces (and ADMIN/SUPER_ADMIN/
   * SUPPORT/FINANCE invite-only creation) through this exact same method
   * without any change here — see docs/marketplace/DEBT.md.
   */
  role?: Role;
  countryCode?: string | null;
}

export interface LoginParams {
  email: string;
  password: string;
}

export interface AuthResult {
  user: AuthUser;
  token: string;
}

/**
 * Auth service. Deliberately generic across roles (see RegisterParams) —
 * this pass wires only the USER registration/login HTTP surface, but the
 * service itself makes adding Supplier/Affiliate/Admin login surfaces in
 * a later phase a routing change, not a service rewrite.
 */
export class AuthService {
  constructor(private readonly userRepository: UserRepository) {}

  async register(params: RegisterParams): Promise<AuthResult> {
    const existing = await this.userRepository.findByEmail(params.email);
    if (existing) {
      throw new AuthError('An account with this email already exists.', 409);
    }

    const passwordHash = await hashPassword(params.password);
    const user = await this.userRepository.create({
      email: params.email,
      passwordHash,
      name: params.name,
      role: params.role ?? 'USER',
      countryCode: params.countryCode ?? null,
    });

    return this.buildAuthResult(user);
  }

  async login(params: LoginParams): Promise<AuthResult> {
    const user = await this.userRepository.findByEmail(params.email);
    if (!user || !user.isActive) {
      throw new AuthError('Invalid email or password.', 401);
    }

    const passwordMatches = await verifyPassword(params.password, user.passwordHash);
    if (!passwordMatches) {
      throw new AuthError('Invalid email or password.', 401);
    }

    return this.buildAuthResult(user);
  }

  async getSanitizedUser(id: string): Promise<AuthUser | null> {
    const user = await this.userRepository.findById(id);
    return user ? sanitizeUser(user) : null;
  }

  private buildAuthResult(user: UserRecord): AuthResult {
    const token = signToken({ sub: user.id, email: user.email, role: user.role });
    return { user: sanitizeUser(user), token };
  }
}

function sanitizeUser(user: UserRecord): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    countryCode: user.countryCode,
    createdAt: user.createdAt.toISOString(),
  };
}
