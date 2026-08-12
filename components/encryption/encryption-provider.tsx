'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { CryptoManager } from '@/lib/encryption/crypto-manager';
import { KeyStorage } from '@/lib/encryption/key-storage';
import {
    deriveMessagingWrapKey,
    deriveWrapKeyFromSignature,
    wrapPrivateKey,
    unwrapPrivateKey,
    isWrapped,
} from '@/lib/encryption/wallet-key-derivation';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAuthSession } from '@/hooks/use-auth-session';
import { trpc } from '@/lib/trpc/client';
import { TRPCClientError } from '@trpc/client';
import { logger } from '@/lib/logger';
import { storeFrostClientShare } from '@/lib/frost/frost-storage';
import type { FrostShare, FrostPublicInfo } from '@/lib/frost/types';

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
    // External (extension) wallet, if connected — used to derive the wrapping key
    // when there's no embedded wallet share. publicKey/connecting drive re-init
    // as the adapter auto-connects on load.
    const { publicKey: adapterPublicKey, signMessage, connecting } = useWallet();
    const [isInitialized, setIsInitialized] = useState(false);
    const [isInitializing, setIsInitializing] = useState(false);
    const [needsWallet, setNeedsWallet] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [publicKey, setPublicKey] = useState<string | null>(null);
    const [keyPair, setKeyPair] = useState<CryptoKeyPair | null>(null);
    // Synchronous re-entry guard so the one-time signature can't double-prompt
    // when the effect re-fires (StrictMode, adapter reconnect). Reset on the bail
    // paths (so a later wallet connect can proceed) and on logout.
    const initGuard = useRef(false);

    const uploadKeyPairMutation = trpc.encryption.uploadKeyPair.useMutation();
    // Restores/ensures the embedded (MPC) wallet's FROST client share. Used to
    // rehydrate the on-device share when an existing wallet isn't materialized on
    // this device yet, so messaging doesn't wrongly prompt to generate a wallet.
    const frostSetup = trpc.wallet.frostSetup.useMutation();
    const ensureEmbedded = trpc.wallet.ensureEmbedded.useMutation();
    const utils = trpc.useUtils();

    const initKeys = useCallback(async () => {
        if (!session?.user?.id) return;
        if (initGuard.current) return;
        initGuard.current = true;
        const userId = session.user.id;

        try {
            setIsInitializing(true);
            setError(null);

            // Fast path: a cached keypair on this device means we're already set
            // up — no wallet prompt, no signature, no network. Covers every
            // repeat visit, including extension wallets after their one-time sign.
            const cached = await keyStorage.getKeyPair(userId);
            if (cached) {
                const imported = await cryptoManager.importKeyPair(cached.publicKey, cached.privateKey);
                setKeyPair(imported);
                setPublicKey(cached.publicKey);
                setNeedsWallet(false);
                setIsInitialized(true);
                return;
            }

            // First use on this device: derive a server-blind wrapping key.
            //  - Embedded (MPC) wallet -> from the on-device FROST share (no prompt).
            //  - External (extension) wallet -> from a one-time signature.
            // Without either, gate on wallet setup rather than fall back to a
            // server-readable key.
            let wrapKey = await deriveMessagingWrapKey(userId);

            // The account has an embedded (MPC) wallet but its FROST client share
            // isn't on THIS device yet — created on another device, storage was
            // cleared, or it's normally hydrated lazily by a wallet action that
            // hasn't run here. Restore it from the server's encrypted backup and
            // retry, instead of wrongly prompting the user to generate a wallet
            // they already have. Gated on wallet_address so we never create a
            // wallet for someone who genuinely has none.
            if (!wrapKey && session?.user?.wallet_address) {
                try {
                    const setup = await frostSetup.mutateAsync();
                    if (setup?.clientShare) {
                        await storeFrostClientShare(userId, setup.clientShare, setup.publicInfo);
                        wrapKey = await deriveMessagingWrapKey(userId);
                    }
                } catch (restoreErr) {
                    // wallet_address is set for BOTH wallet kinds, but only
                    // embedded (MPC) wallets have an encrypted_wallets row.
                    // For extension-wallet users frostSetup answers NOT_FOUND
                    // (or PRECONDITION_FAILED pre-FROST) — that's the expected
                    // "no embedded wallet" signal, not a failure; fall through
                    // to the signature-derived wrap key below.
                    const code = restoreErr instanceof TRPCClientError ? restoreErr.data?.code : undefined;
                    if (code !== 'NOT_FOUND' && code !== 'PRECONDITION_FAILED') {
                        logger.error('Failed to restore embedded wallet share for messaging', restoreErr as Error, { userId });
                    }
                }
            }

            if (!wrapKey) {
                if (adapterPublicKey && signMessage) {
                    wrapKey = await deriveWrapKeyFromSignature(signMessage);
                } else if (connecting) {
                    // Adapter still auto-connecting — bail; the effect re-runs on connect.
                    initGuard.current = false;
                    return;
                } else {
                    // No wallet anywhere — this used to be the hard wall that
                    // ~1/3 of accounts (email/OAuth signups) hit. The embedded
                    // wallet is fully server-provisionable and idempotent
                    // (wallet.ensureEmbedded), so self-heal instead: create or
                    // fetch it, land the FROST client share on this device,
                    // and carry on. The seed phrase stays recoverable from
                    // wallet settings (revealPhrase) — backup is a nudge, not
                    // a wall. Only a genuine provisioning failure still gates.
                    try {
                        const created = await ensureEmbedded.mutateAsync();
                        if (created?.clientShare && created?.publicInfo) {
                            // The wire type collapses to {} (the router passes
                            // ensureEmbeddedWallet's share through untyped);
                            // the values are our own server's FrostShare.
                            await storeFrostClientShare(
                                userId,
                                created.clientShare as FrostShare,
                                created.publicInfo as FrostPublicInfo,
                            );
                        } else {
                            // Wallet pre-existed (created:false) — the share
                            // comes from the server backup instead.
                            const setup = await frostSetup.mutateAsync();
                            if (setup?.clientShare) {
                                await storeFrostClientShare(userId, setup.clientShare, setup.publicInfo);
                            }
                        }
                        wrapKey = await deriveMessagingWrapKey(userId);
                    } catch (provisionErr) {
                        logger.error('Silent wallet provisioning for messaging failed', provisionErr as Error, { userId });
                    }
                }
                if (!wrapKey) {
                    setNeedsWallet(true);
                    setIsInitialized(false);
                    // Allow a later wallet connect (dep change) or retry() to proceed.
                    initGuard.current = false;
                    return;
                }
            }
            setNeedsWallet(false);

            // Fetch the (wrapped) keypair from the server for cross-device sync.
            const serverKeys = await utils.encryption.getKeyPair.fetch({ userId });

            let finalPublicKey: string | null = null;
            let finalPrivateKey: string | null = null;

            if (serverKeys?.success && serverKeys.privateKey && serverKeys.publicKey) {
                finalPublicKey = serverKeys.publicKey;

                if (isWrapped(serverKeys.privateKey)) {
                    // Wrapped key on server -> unwrap with the wallet-derived key.
                    const unwrapped = await unwrapPrivateKey(wrapKey, serverKeys.privateKey);
                    if (!unwrapped) {
                        throw new Error("Couldn't unlock your messages on this device.");
                    }
                    finalPrivateKey = unwrapped;
                } else {
                    // Legacy plaintext key on server -> migrate to wrapped.
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
            } else {
                // No keys on server -> generate a new identity and sync up wrapped.
                logger.info('No keys found. Generating new messaging identity...', { userId });
                const newKeyPair = await cryptoManager.generateKeyPair();
                const exported = await cryptoManager.exportKeyPair(newKeyPair);
                finalPublicKey = exported.publicKey;
                finalPrivateKey = exported.privateKey;

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
                // Cache locally so future loads skip the wrap key entirely.
                await keyStorage.storeKeyPair(userId, { publicKey: finalPublicKey, privateKey: finalPrivateKey });
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
            // Allow retry after a real failure (e.g. the user rejected the signature).
            initGuard.current = false;
        } finally {
            setIsInitializing(false);
        }
        // utils + uploadKeyPairMutation + frostSetup are stable tRPC references.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.user?.id, session?.user?.wallet_address, adapterPublicKey, signMessage, connecting]);

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
            initGuard.current = false;
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
