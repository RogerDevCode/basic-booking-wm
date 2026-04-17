import crypto from 'crypto';

/**
 * verifyPasswordSync — Verifies password against salt:hash scrypt format.
 * Matches logic used in f/web_auth_register/main.ts.
 */
export function verifyPasswordSync(password: string, storedHash: string): boolean {
    const parts = storedHash.split(':');
    if (parts.length !== 2) return false;
    const salt = parts[0];
    const storedKey = parts[1];
    if (salt === undefined || storedKey === undefined) return false;
    try {
    const key = crypto.scryptSync(password, salt, 64);
    return key.toString('hex') === storedKey;
    } catch {
    return false;
    }
}
