'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { CryptoManager } from '@/lib/encryption/crypto-manager';
import { KeyStorage } from '@/lib/encryption/key-storage';
import { prfManager } from '@/lib/prf/prf-manager';
import { useAuthSession } from '@/hooks/use-auth-session';
import { trpc } from '@/lib/trpc/client';
import { logger } from '@/lib/logger';

const cryptoManager = new CryptoManager();
const keyStorage = new KeyStorage();

interface EncryptionContextValue {
    isInitialized: boolean;
    isInitializing: boolean;
    error: string | null;
    publicKey: string | null;
    encryptMessage: (text: string, recipientPublicKey: string) => Promise<{ ciphertext: string; iv: string }>;
    decryptMessage: (ciphertext: string, iv: string, senderPublicKey: string) => Promise<string>;
    clearKeys: () => Promise<void>;
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
    const [error, setError] = useState<string | null>(null);
    const [publicKey, setPublicKey] = useState<string | null>(null);
    const [keyPair, setKeyPair] = useState<CryptoKeyPair | null>(null);

    const uploadKeyPairMutation = trpc.encryption.uploadKeyPair.useMutation();
    const utils = trpc.useUtils();

    // Initialize keys on mount
    useEffect(() => {
        if (!session?.user?.id) return;

        const initKeys = async () => {
            try {
                setIsInitializing(true);

                // 1. Try to fetch keys from server (Cloud Sync)
                // We use fetch() to get fresh data
                const serverKeys = await utils.encryption.getKeyPair.fetch({
                    userId: session.user.id
                });

                let finalPublicKey: string | null = null;
                let finalPrivateKey: string | null = null;
                let isNewGeneration = false;

                // Attempt PRF derivation silently — succeeds only if a passkey
                // is already registered for this origin. Never blocks init.
                const prfKey = await prfManager.derive().catch(() => null);

                if (serverKeys?.success && serverKeys.privateKey && serverKeys.publicKey) {
                    // CASE A: Keys exist on server -> Sync DOWN
                    logger.info('Encryption keys found on server. Syncing down...', { userId: session.user.id });

                    finalPublicKey = serverKeys.publicKey;
                    finalPrivateKey = serverKeys.privateKey;

                    // Save to local storage, encrypted with PRF if available
                    await keyStorage.storeKeyPair(
                        session.user.id,
                        { publicKey: finalPublicKey, privateKey: finalPrivateKey },
                        prfKey ?? undefined
                    );

                } else {
                    // CASE B: No keys on server -> Check Local or Generate

                    // Try encrypted read first (PRF), fall back to plaintext
                    const stored = prfKey
                        ? await keyStorage.getKeyPair(session.user.id, prfKey)
                            ?? await keyStorage.getKeyPair(session.user.id)
                        : await keyStorage.getKeyPair(session.user.id);

                    if (stored) {
                        // CASE B1: Keys exist locally but not on server -> Sync UP
                        logger.info('Keys found locally but not on server. Syncing up...', { userId: session.user.id });
                        finalPublicKey = stored.publicKey;
                        finalPrivateKey = stored.privateKey;

                        // Re-encrypt with PRF if we just read a plaintext record
                        if (prfKey && !stored.encryptionIv) {
                            await keyStorage.storeKeyPair(
                                session.user.id,
                                { publicKey: finalPublicKey, privateKey: finalPrivateKey },
                                prfKey
                            );
                        }
                    } else {
                        // CASE B2: No keys anywhere -> Generate New
                        logger.info('No keys found. Generating new identity...', { userId: session.user.id });
                        const newKeyPair = await cryptoManager.generateKeyPair();
                        const exported = await cryptoManager.exportKeyPair(newKeyPair);

                        finalPublicKey = exported.publicKey;
                        finalPrivateKey = exported.privateKey;
                        isNewGeneration = true;

                        await keyStorage.storeKeyPair(
                            session.user.id,
                            exported,
                            prfKey ?? undefined
                        );
                    }

                    // Upload to server (Sync UP)
                    // We upload both Public and Private keys now
                    try {
                        await uploadKeyPairMutation.mutateAsync({
                            publicKey: finalPublicKey!,
                            privateKey: finalPrivateKey!
                        });
                        logger.info('Encryption keys synced to cloud', { userId: session.user.id });
                        utils.encryption.getKeyPair.invalidate({ userId: session.user.id });
                        utils.encryption.getPublicKey.invalidate({ userId: session.user.id });
                    } catch (uploadError) {
                        logger.error('Failed to sync keys to cloud', uploadError as Error);
                        // Don't fail the whole init, we can work locally
                    }
                }

                // Import the final keys into memory for use
                if (finalPublicKey && finalPrivateKey) {
                    const imported = await cryptoManager.importKeyPair(
                        finalPublicKey,
                        finalPrivateKey
                    );
                    setKeyPair(imported);
                    setPublicKey(finalPublicKey);
                    setIsInitialized(true);
                } else {
                    throw new Error("Failed to resolve encryption keys");
                }

            } catch (err) {
                console.error('[Encryption] Initialization failed', err);
                logger.error('Failed to initialize encryption keys', err as Error, {
                    userId: session?.user?.id,
                });
                setError(err instanceof Error ? err.message : 'Failed to initialize encryption');
            } finally {
                setIsInitializing(false);
            }
        };

        initKeys();
    }, [session?.user?.id]);

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
            prfManager.clear();
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
                error,
                publicKey,
                encryptMessage,
                decryptMessage,
                clearKeys,
            }}
        >
            {children}
        </EncryptionContext.Provider>
    );
}
