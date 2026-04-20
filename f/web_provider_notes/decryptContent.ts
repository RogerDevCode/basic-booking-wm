import { decryptData } from '../internal/crypto/index';

export function decryptContent(encrypted: string | null): string {
    if (encrypted == null) return '';
    try {
    return decryptData(encrypted);
    } catch {
    return '[ERROR: Unable to decrypt note]';
    }
}
