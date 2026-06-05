'use client';

import { keyStorage } from '@/lib/encryption/key-storage';
import { prfManager } from '@/lib/prf/prf-manager';

/**
 * Decrypt the server-side d2 backup with the PRF key and store it in IndexedDB.
 * The PRF key must already be derived (prfManager.getKey() non-null), or this
 * function will attempt to derive it (triggering a WebAuthn assertion).
 *
 * Returns true on success, false if PRF unavailable or decryption fails.
 */
export async function recoverWalletShare(
  userId: string,
  encryptedD2Backup: string,
  d2BackupIv: string,
  prfKey?: CryptoKey
): Promise<boolean> {
  const key = prfKey ?? prfManager.getKey() ?? await prfManager.derive().catch(() => null);
  if (!key) return false;

  try {
    const iv = Buffer.from(d2BackupIv, 'base64');
    const ciphertext = Buffer.from(encryptedD2Backup, 'base64');

    const d2 = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    await keyStorage.storeWalletShare(userId, new Uint8Array(d2), key);
    return true;
  } catch {
    return false;
  }
}
