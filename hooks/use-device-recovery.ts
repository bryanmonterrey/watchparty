'use client';

import { useState, useEffect, useCallback } from 'react';
import { trpc } from '@/lib/trpc/client';
import { authClient } from '@/lib/auth/client';
import { keyStorage } from '@/lib/encryption/key-storage';
import { prfManager } from '@/lib/prf/prf-manager';
import { recoverWalletShare } from '@/lib/solana/device-recovery';

export type DeviceKeyStatus =
  | 'loading'
  | 'secured'       // d2 present in IndexedDB
  | 'needs_restore' // d2 missing but server backup exists
  | 'no_backup'     // wallet not split or no backup stored
  | 'unsupported';  // PRF / passkey not available

interface UseDeviceRecoveryReturn {
  status: DeviceKeyStatus;
  recover: () => Promise<boolean>;
  isRecovering: boolean;
}

/**
 * Checks whether the device has the local d2 wallet share (IndexedDB) and
 * whether a server-side backup is available to restore it from.
 *
 * Used in wallet settings to surface a "Restore on this device" prompt.
 */
export function useDeviceRecovery(): UseDeviceRecoveryReturn {
  const [status, setStatus] = useState<DeviceKeyStatus>('loading');
  const [isRecovering, setIsRecovering] = useState(false);

  const utils = trpc.useUtils();

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        if (!prfManager.canAttempt()) {
          if (!cancelled) setStatus('unsupported');
          return;
        }

        const session = await authClient.getSession();
        const userId = session.data?.user?.id;
        if (!userId) {
          if (!cancelled) setStatus('unsupported');
          return;
        }

        const hasShare = await keyStorage.hasWalletShare(userId);
        if (hasShare) {
          if (!cancelled) setStatus('secured');
          return;
        }

        // d2 absent — check if server backup exists
        const share = await utils.wallet.getEncryptedShare.fetch().catch(() => null);
        if (!cancelled) {
          setStatus(share?.encryptedD2Backup ? 'needs_restore' : 'no_backup');
        }
      } catch {
        if (!cancelled) setStatus('no_backup');
      }
    };

    check();
    return () => { cancelled = true; };
  }, []);

  const recover = useCallback(async (): Promise<boolean> => {
    setIsRecovering(true);
    try {
      const session = await authClient.getSession();
      const userId = session.data?.user?.id;
      if (!userId) return false;

      const share = await utils.wallet.getEncryptedShare.fetch().catch(() => null);
      if (!share?.encryptedD2Backup || !share.d2BackupIv) return false;

      const ok = await recoverWalletShare(userId, share.encryptedD2Backup, share.d2BackupIv);
      if (ok) setStatus('secured');
      return ok;
    } finally {
      setIsRecovering(false);
    }
  }, [utils]);

  return { status, recover, isRecovering };
}
