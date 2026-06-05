'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { trpc } from '@/lib/trpc/client';
import { authClient } from '@/lib/auth/client';
import {
    getActiveSession,
    storeSession,
    clearSession,
    type ActiveSession,
} from '@/lib/swig/session-storage';
import {
    getFrostClientData,
    storeFrostClientShare,
    clearFrostClientShare,
} from '@/lib/frost/frost-storage';
import { clientCommit, clientSignShare, extractClientMessageBytes } from '@/lib/frost/frost-client';

interface UseSwigSessionReturn {
    session: ActiveSession | null;
    isLoading: boolean;
    ensureSession: () => Promise<ActiveSession | null>;
    clearSwigSession: () => Promise<void>;
}

export function useSwigSession(): UseSwigSessionReturn {
    const { connection } = useConnection();
    const [session, setSession] = useState<ActiveSession | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const ensureInProgress = useRef(false);

    const frostSetup = trpc.wallet.frostSetup.useMutation();
    const frostCommit = trpc.wallet.frostCommit.useMutation();
    const frostSign = trpc.wallet.frostSign.useMutation();

    // Load cached session from IndexedDB on mount
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const s = await authClient.getSession();
                const userId = s.data?.user?.id;
                if (!userId) return;
                const slot = await connection.getSlot('finalized').catch(() => 0);
                const active = await getActiveSession(userId, slot);
                if (!cancelled && active) setSession(active);
            } catch { /* non-fatal */ }
        };
        load();
        return () => { cancelled = true; };
    }, [connection]);

    const ensureSession = useCallback(async (): Promise<ActiveSession | null> => {
        if (session) return session;
        if (ensureInProgress.current) return null;

        ensureInProgress.current = true;
        setIsLoading(true);

        try {
            const s = await authClient.getSession();
            const userId = s.data?.user?.id;
            if (!userId) return null;

            // Check IndexedDB for a valid cached session first
            const slot = await connection.getSlot('finalized').catch(() => 0);
            const cached = await getActiveSession(userId, slot);
            if (cached) { setSession(cached); return cached; }

            // Ensure FROST client share exists in IndexedDB (stored at signup).
            // frostSetup also lazily creates the Swig on-chain account if needed.
            let frostData = await getFrostClientData(userId);
            const setup = await frostSetup.mutateAsync();
            if (!frostData) {
                // Should not happen post-Option-B, but handle gracefully if IndexedDB was cleared.
                if (!setup.clientShare) throw new Error('FROST client share missing from IndexedDB and server returned none — re-create wallet');
                await storeFrostClientShare(userId, setup.clientShare, setup.publicInfo);
                frostData = { clientShare: setup.clientShare, publicInfo: setup.publicInfo };
            }

            // ── FROST 2-round session creation ────────────────────────────────
            const signingSessionId = crypto.randomUUID();

            // Round 1: client commits locally, server commits + builds session tx
            const { nonces, clientCommitment } = await clientCommit(frostData.clientShare);
            const round1 = await frostCommit.mutateAsync({ signingSessionId, purpose: 'session' });
            const { serverCommitment, txBase64 } = round1 as { serverCommitment: any; txBase64: string };

            // Compute client signature share over the session tx message
            const msgBytes = await extractClientMessageBytes(txBase64);
            const clientSigShare = await clientSignShare(
                frostData.clientShare,
                frostData.publicInfo,
                nonces,
                clientCommitment,
                serverCommitment,
                msgBytes,
            );

            // Round 2: server aggregates, submits session creation tx, returns session keys
            const result = await frostSign.mutateAsync({ signingSessionId, clientCommitment, clientSigShare });
            if (result.type !== 'session') return null;

            await storeSession(
                userId,
                result.swigAddress!,
                result.sessionPrivateKey,
                result.treasuryPubkey,
                result.createdAtSlot,
                result.durationSlots,
            );

            const active = await getActiveSession(userId, slot);
            if (active) setSession(active);
            return active;
        } catch (err) {
            console.warn('[useSwigSession] session creation failed:', err);
            return null;
        } finally {
            setIsLoading(false);
            ensureInProgress.current = false;
        }
    }, [session, connection, frostSetup, frostCommit, frostSign]);

    const clearSwigSession = useCallback(async () => {
        const s = await authClient.getSession();
        const userId = s.data?.user?.id;
        if (userId) {
            await clearSession(userId);
            await clearFrostClientShare(userId);
        }
        setSession(null);
    }, []);

    return { session, isLoading, ensureSession, clearSwigSession };
}
