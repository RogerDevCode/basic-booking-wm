import { encryptData } from '../internal/crypto';

export function encryptContent(plainContent: string): { readonly encrypted: string; readonly version: number } {
    const encrypted = encryptData(plainContent);
    return { encrypted, version: 1 };
}
