import { useEffect, useRef, useState } from 'react';

import { authClient } from '@/lib/auth-client';
import { generateKeys, keysFromServer, type E2EKeys } from '@/lib/e2e';
import { trpc } from '@/lib/trpc';

/**
 * Key lifecycle, mirroring components/encryption/encryption-provider.tsx:
 * fetch the cloud-synced pair (same identity as web) → else generate a
 * P-256 pair in WebCrypto-compatible formats and sync it up.
 */
export function useE2E(): { keys: E2EKeys | null; ready: boolean } {
  const { data: session } = authClient.useSession();
  const [keys, setKeys] = useState<E2EKeys | null>(null);
  const generating = useRef(false);

  const serverKeys = trpc.encryption.getKeyPair.useQuery(
    { userId: session?.user.id ?? '' },
    { enabled: !!session?.user.id, staleTime: Infinity },
  );
  const upload = trpc.encryption.uploadKeyPair.useMutation();
  const utils = trpc.useUtils();

  useEffect(() => {
    if (keys || !serverKeys.data) return;

    if (serverKeys.data.success && serverKeys.data.publicKey && serverKeys.data.privateKey) {
      // Cloud sync down — same identity as the web client.
      try {
        setKeys(keysFromServer(serverKeys.data.publicKey, serverKeys.data.privateKey));
      } catch (e) {
        console.error('[e2e] failed to import cloud keys:', e);
      }
      return;
    }

    // No keys anywhere → generate and sync up (web Case B2).
    if (generating.current) return;
    generating.current = true;
    const { keys: fresh, privateKeyPkcs8B64 } = generateKeys();
    upload.mutate(
      { publicKey: fresh.publicKeyB64, privateKey: privateKeyPkcs8B64 },
      {
        onSuccess: () => {
          setKeys(fresh);
          utils.encryption.getKeyPair.invalidate();
          utils.encryption.getPublicKey.invalidate();
        },
        onError: (e) => {
          generating.current = false;
          console.error('[e2e] failed to sync keys up:', e);
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKeys.data, keys]);

  return { keys, ready: !!keys };
}
