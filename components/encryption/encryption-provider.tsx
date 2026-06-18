'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { CryptoManager } from '@/lib/encryption/crypto-manager';
import { KeyStorage } from '@/lib/encryption/key-storage';
import {
    deriveMessagingWrapKey,
    wrapPrivateKey,
    unwrapPrivateKey,
    isWrapped,
} from '@/lib/encryption/wallet-key-derivation';
import { useAuthSession } from '@/hooks/use-auth-session';
import { trpc } from '@/lib/trpc/client';
import { logger } from '@/lib/logger';

const cryptoManager = new CryptoManager();
const keyStorage = new KeyStorage();

interface EncryptionContextValue {
    isInitialized: boolean;
    isInitializing: boolean;
    /** True when the user has no wallet share on this device — messaging is gated until they set one up. */
    needsWallet: boolean;
    error: string | null;
    publicKey: string | null;
    encryptMessage: (text: string, recipientPublicKey: string) => Promise<{ ciphertext: string; iv: string }>;
    decryptMessage: (ciphertext: string, iv: string, senderPublicKey: string) => Promise<string>;
    clearKeys: () => Promise<void>;
    /** Re-run initialization (e.g. after the user sets up their wallet). */
    retry: () => void;
}

const EncryptionContext = createContext<EncryptionContextValue | null>(null);

export function useEncryptionContext(): EncryptionContextValue {
    const context = useContext(EncryptionContext);
    if (!context) {
        throw new Error('useEncryptionContext must be used within EncryptionProvider');
    }
    return context;
}

interface EncryptionProviderProps {
    children: ReactNode;
}

export function EncryptionProvider({ children }: EncryptionProviderProps) {
    const { data: session } = useAuthSession();
    const [isInitialized, setIsInitialized] = useState(false);
    const [isInitializing, setIsInitializing] = useState(false);
    const [needsWallet, setNeedsWallet] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [publicKey, setPublicKey] = useState<string | null>(null);
    const [keyPair, setKeyPair] = useState<CryptoKeyPair | null>(null);

    const uploadKeyPairMutation = trpc.encryption.uploadKeyPair.useMutation();
    const utils = trpc.useUtils();

    const initKeys = useCallback(async () => {
        if (!session?.user?.id) return;
        const userId = session.user.id;

        try {
            setIsInitializing(true);
            setError(null);

            // Root of trust: derive a wrapping key from the on-device wallet share.
            // No prompt, no signature — it's already in IndexedDB once the wallet
            // exists. Without a wallet there's no server-blind secret, so we gate
            // messaging on wallet setup rather than fall back to plaintext.
            const wrapKey = await deriveMessagingWrapKey(userId);
            if (!wrapKey) {
                setNeedsWallet(true);
                setIsInitialized(false);
                return;
            }
            setNeedsWallet(false);

            // Fetch the (wrapped) keypair from the server for cross-device sync.
            const serverKeys = await utils.encryption.getKeyPair.fetch({ userId });

            let finalPublicKey: string | null = null;
            let finalPrivateKey: string | null = null;

            if (serverKeys?.success && serverKeys.privateKey && serverKeys.publicKey) {
                finalPublicKey = serverKeys.publicKey;

                if (isWrapped(serverKeys.privateKey)) {
                    // CASE A: Wrapped key on server -> unwrap with the wallet-derived key.
                    const unwrapped = await unwrapPrivateKey(wrapKey, serverKeys.privateKey);
                    if (!unwrapped) {
                        throw new Error("Couldn't unlock your messages on this device.");
                    }
                    finalPrivateKey = unwrapped;
                } else {
                    // CASE A': Legacy plaintext key on server -> migrate to wrapped.
                    logger.info('Migrating plaintext encryption key to wallet-wrapped form', { userId });
                    finalPrivateKey = serverKeys.privateKey;
                    try {
                        await uploadKeyPairMutation.mutateAsync({
                            publicKey: finalPublicKey,
                            privateKey: await wrapPrivateKey(wrapKey, finalPrivateKey),
                        });
                        utils.encryption.getKeyPair.invalidate({ userId });
                    } catch (migrateError) {
                        logger.error('Failed to migrate encryption key to wrapped form', migrateError as Error);
                    }
                }

                // Cache locally for fast subsequent loads on this device.
                await keyStorage.storeKeyPair(userId, { publicKey: finalPublicKey, privateKey: finalPrivateKey });
            } else {
                // CASE B: No keys on server -> use local cache or generate, then sync up wrapped.
                const stored = await keyStorage.getKeyPair(userId);

                if (stored) {
                    finalPublicKey = stored.publicKey;
                    finalPrivateKey = stored.privateKey;
                } else {
                    logger.info('No keys found. Generating new messaging identity...', { userId });
                    const newKeyPair = await cryptoManager.generateKeyPair();
                    const exported = await cryptoManager.exportKeyPair(newKeyPair);
                    finalPublicKey = exported.publicKey;
                    finalPrivateKey = exported.privateKey;
                    await keyStorage.storeKeyPair(userId, exported);
                }

                try {
                    await uploadKeyPairMutation.mutateAsync({
                        publicKey: finalPublicKey,
                        privateKey: await wrapPrivateKey(wrapKey, finalPrivateKey),
                    });
                    utils.encryption.getKeyPair.invalidate({ userId });
                    utils.encryption.getPublicKey.invalidate({ userId });
                } catch (uploadError) {
                    logger.error('Failed to sync keys to cloud', uploadError as Error);
                    // Don't fail init — messaging still works locally on this device.
                }
            }

            if (finalPublicKey && finalPrivateKey) {
                const imported = await cryptoManager.importKeyPair(finalPublicKey, finalPrivateKey);
                setKeyPair(imported);
                setPublicKey(finalPublicKey);
                setIsInitialized(true);
            } else {
                throw new Error('Failed to resolve encryption keys');
            }
        } catch (err) {
            console.error('[Encryption] Initialization failed', err);
            logger.error('Failed to initialize encryption keys', err as Error, { userId });
            setError(err instanceof Error ? err.message : 'Failed to initialize encryption');
        } finally {
            setIsInitializing(false);
        }
        // utils + uploadKeyPairMutation are stable tRPC references.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.user?.id]);

    useEffect(() => {
        initKeys();
    }, [initKeys]);

    const encryptMessage = useCallback(
        async (text: string, recipientPublicKey: string) => {
            if (!keyPair) {
                throw new Error('Encryption not initialized');
            }

            try {
                const recipientPubKey = await cryptoManager.importPublicKey(recipientPublicKey);
                const sharedKey = await cryptoManager.deriveSharedKey(
                    keyPair.privateKey,
                    recipientPubKey
                );
                return await cryptoManager.encryptMessage(text, sharedKey);
            } catch (err) {
                logger.error('Failed to encrypt message', err as Error);
                throw new Error('Failed to encrypt message');
            }
        },
        [keyPair]
    );

    const decryptMessage = useCallback(
        async (ciphertext: string, iv: string, senderPublicKey: string) => {
            if (!keyPair) {
                throw new Error('Encryption not initialized');
            }

            try {
                const senderPubKey = await cryptoManager.importPublicKey(senderPublicKey);
                const sharedKey = await cryptoManager.deriveSharedKey(
                    keyPair.privateKey,
                    senderPubKey
                );
                return await cryptoManager.decryptMessage(ciphertext, iv, sharedKey);
            } catch (err) {
                logger.error('Failed to decrypt message', err as Error);
                throw new Error('Failed to decrypt message');
            }
        },
        [keyPair]
    );

    const clearKeys = useCallback(async () => {
        try {
            await keyStorage.clearAll();
            cryptoManager.clearKeys();
            setKeyPair(null);
            setPublicKey(null);
            setIsInitialized(false);
            logger.info('Encryption keys cleared');
        } catch (err) {
            logger.error('Failed to clear keys', err as Error);
        }
    }, []);

    // Clear keys on logout
    useEffect(() => {
        if (!session?.user?.id && isInitialized) {
            clearKeys();
        }
    }, [session?.user?.id, isInitialized, clearKeys]);

    return (
        <EncryptionContext.Provider
            value={{
                isInitialized,
                isInitializing,
                needsWallet,
                error,
                publicKey,
                encryptMessage,
                decryptMessage,
                clearKeys,
                retry: initKeys,
            }}
        >
            {children}
        </EncryptionContext.Provider>
    );
}
