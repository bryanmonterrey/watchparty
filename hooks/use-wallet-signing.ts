'use client';

import { useState, useCallback } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { trpc } from '@/lib/trpc/client';
import { authClient } from '@/lib/auth/client';
import { useSwigSession } from '@/hooks/use-swig-session';
import { buildSwigTransaction } from '@/lib/swig/swig-signing';
import { getFrostClientData } from '@/lib/frost/frost-storage';
import { clientCommit, clientSignShare, extractClientMessageBytes } from '@/lib/frost/frost-client';

interface SignAndSubmitOptions {
  transaction: string; // base64-encoded partial transaction
}

interface UseWalletSigningReturn {
  signAndSubmit: (opts: SignAndSubmitOptions) => Promise<{ signature: string }>;
  /**
   * Sign a server-prepared Swig management tx (add/remove the auto-copy
   * executor role) with the FROST root authority. Root-only — sessions can't
   * change wallet authorities, so there's no tier-1 path here.
   */
  signManagement: (purpose: 'copyEnable' | 'copyDisable' | 'copyUpdateCap' | 'sessionAuthority', opts?: { dailyUsdcCap?: number }) => Promise<{ signature: string }>;
  isPending: boolean;
  error: Error | null;
  reset: () => void;
}

/**
 * Three-tier signing strategy (best → fallback):
 *
 * 1. Swig session key  — gasless, no FROST round trips after session is established
 * 2. FROST 2-of-2      — key never reconstructed, 2 round trips, treasury pays gas
 * 3. Server signing    — legacy fallback for v1 custodial wallets
 */
export function useWalletSigning(): UseWalletSigningReturn {
    const { connection } = useConnection();
    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const { session, ensureSession } = useSwigSession();
    const relaySwigTx = trpc.wallet.relaySwigTransaction.useMutation();
    const frostCommit = trpc.wallet.frostCommit.useMutation();
    const frostSign = trpc.wallet.frostSign.useMutation();
    const serverSign = trpc.wallet.signAndSendTransaction.useMutation();
    const ensureSwigAccount = trpc.wallet.ensureSwigAccount.useMutation();

    const signAndSubmit = useCallback(async ({ transaction }: SignAndSubmitOptions) => {
        setIsPending(true);
        setError(null);

        try {
            // ── Tier 0: the Swig account must EXIST on-chain ──────────────────
            // Its creation was split out of frostSetup into ensureSwigAccount
            // ("call this from the paths that actually need it: signing") and
            // the call was never added. Every v2 wallet since then sat at a
            // plain address with no account: tiers 1 and 2 both read the
            // account, got zero bytes ("cannot decode empty byte array") and
            // fell to tier 3, which cannot sign for a Swig PDA — the owner's
            // own wallet, 2026-10-04, with the message "Tier 1/2 both failed".
            // Idempotent and cheap once created; the treasury pays the rent.
            const ensured = await ensureSwigAccount.mutateAsync().catch((err: any) => {
                // A v1 custodial wallet has no Swig account to ensure — that
                // is tier 3's case, not an error here.
                if (err?.data?.code === "PRECONDITION_FAILED") return { ready: true as const };
                throw err;
            });
            if (ensured && !ensured.ready) {
                throw new Error(
                    "Your built-in wallet isn't set up on-chain yet and the account couldn't be created right now" +
                    ((ensured as { error?: string }).error ? ` (${(ensured as { error?: string }).error})` : "") +
                    ". Nothing was sent — please try again in a moment.",
                );
            }

            // ── Tier 1: Swig session key (no FROST round trips) ───────────────
            const activeSession = session ?? await ensureSession();
            if (activeSession) {
                try {
                    const { PublicKey } = await import('@solana/web3.js');
                    const feePayer = new PublicKey(activeSession.treasuryPubkey);
                    const partialTx = await buildSwigTransaction(activeSession, transaction, feePayer, connection);
                    return await relaySwigTx.mutateAsync({ transaction: partialTx });
                } catch (err: any) {
                    console.warn('[useWalletSigning] Swig session failed, falling back:', err?.message);
                }
            }

            // ── Tier 2: FROST 2-of-2 (key never reconstructed) ───────────────
            // Server wraps the raw tx in Swig execute instructions so the FROST
            // root authority (not a session key) can sign it directly.
            const s = await authClient.getSession();
            const userId = s.data?.user?.id;
            if (userId) {
                const frostData = await getFrostClientData(userId);
                if (frostData) {
                    try {
                        const signingSessionId = crypto.randomUUID();
                        const { nonces, clientCommitment } = await clientCommit(frostData.clientShare);
                        const round1 = await frostCommit.mutateAsync({ signingSessionId, purpose: 'tx', rawTransaction: transaction });
                        const { serverCommitment, txBase64: swigWrappedTx } = round1 as { serverCommitment: any; txBase64: string };
                        const msgBytes = await extractClientMessageBytes(swigWrappedTx);
                        const clientSigShare = await clientSignShare(
                            frostData.clientShare,
                            frostData.publicInfo,
                            nonces,
                            clientCommitment,
                            serverCommitment,
                            msgBytes,
                        );
                        const result = await frostSign.mutateAsync({ signingSessionId, clientCommitment, clientSigShare });
                        if (result.type === 'tx') return { signature: result.signature };
                    } catch (err: any) {
                        console.warn('[useWalletSigning] FROST path failed, falling back:', err?.message);
                    }
                }
            }

            // ── Tier 3: Server-side signing (legacy v1 custodial wallets) ─────
            return await serverSign.mutateAsync({ transaction });
        } catch (err) {
            const e = err instanceof Error ? err : new Error(String(err));
            setError(e);
            throw e;
        } finally {
            setIsPending(false);
        }
    }, [session, ensureSession, connection, relaySwigTx, frostCommit, frostSign, serverSign]);

    const signManagement = useCallback(async (purpose: 'copyEnable' | 'copyDisable' | 'copyUpdateCap' | 'sessionAuthority', opts?: { dailyUsdcCap?: number }) => {
        setIsPending(true);
        setError(null);
        try {
            const s = await authClient.getSession();
            const userId = s.data?.user?.id;
            if (!userId) throw new Error('Not signed in');
            const frostData = await getFrostClientData(userId);
            if (!frostData) throw new Error('This wallet does not support FROST signing on this device');

            const signingSessionId = crypto.randomUUID();
            const { nonces, clientCommitment } = await clientCommit(frostData.clientShare);
            const round1 = await frostCommit.mutateAsync({ signingSessionId, purpose, dailyUsdcCap: opts?.dailyUsdcCap });
            const { serverCommitment, txBase64 } = round1 as { serverCommitment: any; txBase64: string };
            const msgBytes = await extractClientMessageBytes(txBase64);
            const clientSigShare = await clientSignShare(
                frostData.clientShare,
                frostData.publicInfo,
                nonces,
                clientCommitment,
                serverCommitment,
                msgBytes,
            );
            const result = await frostSign.mutateAsync({ signingSessionId, clientCommitment, clientSigShare });
            if (result.type !== 'tx') throw new Error('Unexpected signing result');
            return { signature: result.signature };
        } catch (err) {
            const e = err instanceof Error ? err : new Error(String(err));
            setError(e);
            throw e;
        } finally {
            setIsPending(false);
        }
    }, [frostCommit, frostSign]);

    const reset = useCallback(() => setError(null), []);

    return { signAndSubmit, signManagement, isPending, error, reset };
}
