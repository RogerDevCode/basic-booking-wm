// ============================================================================
// CRYPTO — Password hashing (Argon2id) + AES-256-GCM data encryption
// ============================================================================
// Best practices: OWASP 2024 password storage + application-level encryption
// ============================================================================

import * as argon2 from 'argon2';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

// ============================================================================
// PASSWORD HASHING (Argon2id — OWASP recommended)
// ============================================================================

export interface PasswordHashOptions {
  readonly memoryCost: number;    // KB, default 65536 (64MB)
  readonly timeCost: number;      // iterations, default 3
  readonly parallelism: number;   // threads, default 1
}

const DEFAULT_HASH_OPTS: PasswordHashOptions = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
};

export async function hashPassword(plain: string, opts?: PasswordHashOptions): Promise<string> {
  const o = opts ?? DEFAULT_HASH_OPTS;
  return argon2.hash(plain, {
    type: argon2.argon2id,
    memoryCost: o.memoryCost,
    timeCost: o.timeCost,
    parallelism: o.parallelism,
  });
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

// ============================================================================
// TEMPORARY PASSWORD GENERATION (4-char readable for admin)
// ============================================================================

const READABLE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1

export function generateReadablePassword(length: number = 4): string {
  const bytes = randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    const byte = bytes[i];
    if (byte != null) {
      result += READABLE_CHARS[byte % READABLE_CHARS.length];
    }
  }
  return result;
}

// ============================================================================
// PASSWORD POLICY VALIDATION (OWASP guidelines)
// ============================================================================

export interface PasswordPolicyResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export function validatePasswordPolicy(plain: string): PasswordPolicyResult {
  const errors: string[] = [];

  if (plain.length < 8) errors.push('Minimum 8 characters');
  if (plain.length > 128) errors.push('Maximum 128 characters');
  if (!/[A-Z]/.test(plain)) errors.push('At least one uppercase letter');
  if (!/[a-z]/.test(plain)) errors.push('At least one lowercase letter');
  if (!/[0-9]/.test(plain)) errors.push('At least one digit');
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(plain)) errors.push('At least one special character');

  // Check for common weak patterns
  if (/^(.)\1+$/.test(plain)) errors.push('Password cannot be all same character');
  if (/^(123|abc|qwe|password|admin)/i.test(plain)) errors.push('Password cannot start with common patterns');

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// AES-256-GCM DATA ENCRYPTION (for sensitive fields like service_notes)
// ============================================================================

function getEncryptionKey(): Buffer {
  const keyEnv = process.env['ENCRYPTION_KEY'];
  if (keyEnv == null || keyEnv === '') {
    // Derive a key from DATABASE_URL as fallback (not ideal but better than nothing)
    const dbUrl = process.env['DATABASE_URL'] ?? 'fallback-key-material-for-dev';
    return scryptSync(dbUrl, 'booking-titanium-salt', 32);
  }
  // Key should be 32 bytes (256 bits) hex-encoded
  return Buffer.from(keyEnv, 'hex');
}

interface EncryptedPayload {
  readonly iv: string;       // 16 bytes hex
  readonly authTag: string;  // 16 bytes hex
  readonly ciphertext: string; // hex
}

export function encryptData(plain: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plain, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  const payload: EncryptedPayload = {
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    ciphertext: encrypted,
  };

  return JSON.stringify(payload);
}

export function decryptData(encryptedJson: string): string {
  const key = getEncryptionKey();
  const payload: EncryptedPayload = JSON.parse(encryptedJson) as EncryptedPayload;

  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(payload.authTag, 'hex'));

  let decrypted = decipher.update(payload.ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
