import crypto from 'crypto';

export function hashPasswordSync(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const key = crypto.scryptSync(password, salt, 64);
    return `${salt}:${key.toString('hex')}`;
}
