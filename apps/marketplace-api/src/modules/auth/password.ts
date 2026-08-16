import bcrypt from 'bcryptjs';

/**
 * Password hashing choice: bcryptjs (pure JS, no native bindings) rather
 * than argon2/bcrypt. Documented reasoning: this is a fresh, independent
 * app with no existing hash format to match, and a pure-JS implementation
 * removes the native-build (node-gyp/prebuild) failure mode entirely —
 * a real risk on a Windows sandbox with no guaranteed build toolchain.
 * Cost factor 12 (bcrypt's own recommended minimum as of 2024+).
 */
const SALT_ROUNDS = 12;

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

export async function verifyPassword(plainPassword: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainPassword, hash);
}
