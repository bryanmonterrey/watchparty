'use client';

import { useEncryptionContext } from '@/components/encryption/encryption-provider';

export interface UseEncryptionReturn {
    isInitialized: boolean;
    isInitializing: boolean;
    error: string | null;
    publicKey: string | null;
    encryptMessage: (text: string, recipientPublicKey: string) => Promise<{ ciphertext: string; iv: string }>;
    decryptMessage: (ciphertext: string, iv: string, senderPublicKey: string) => Promise<string>;
    clearKeys: () => Promise<void>;
}

/**
 * React hook for encryption operations.
 * Must be used within EncryptionProvider (messages layout).
 */
export function useEncryption(): UseEncryptionReturn {
    return useEncryptionContext();
}
