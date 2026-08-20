'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { trpc } from '@/lib/trpc/client';
import { useAuthSession } from '@/hooks/use-auth-session';
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

// One slot fetch per 30s across every mount of this hook, for the same reason
// as the shared session read below: this hook lives in every component that
// can sign, so a per-mount getSlot was one /api/rpc POST (a Helius credit) per
// rendered coin row. Slots advance ~2.5/s; expiry validation doesn't care
// about 30s of drift. Failures aren't cached — 0 means "couldn't ask".
let slotCache: { at: number; slot: number } | null = null;
async function getSlotShared(connection: { getSlot: (c: 'finalized') => Promise<number> }): Promise<number> {
    if (slotCache && Date.now() - slotCache.at < 30_000) return slotCache.slot;
    const slot = await connection.getSlot('finalized').catch(() => 0);
    if (slot) slotCache = { at: Date.now(), slot };
    return slot;
}

export function useSwigSession(): UseSwigSessionReturn {
    const { connection } = useConnection();
    const [session, setSession] = useState<ActiveSession | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const ensureInProgress = useRef(false);

    const frostSetup = trpc.wallet.frostSetup.useMutation();
    const frostCommit = trpc.wallet.frostCommit.useMutation();
    const frostSign = trpc.wallet.frostSign.useMutation();

    // The user id comes from the SHARED session query (one request per 30s
    // app-wide), never from authClient.getSession() — that helper makes a real
    // HTTP request per call, and this hook mounts once per component that can
    // sign (every coin row via useQuickBuy, every trade panel, …). On
    // 2026-08-19 that was ~100 get-session requests/min from one browser
    // scrolling /home, which tripped better-auth's rate limiter (100/60s) and
    // 429'd the LEGITIMATE session reads — the header tiles fell into their
    // skeletons while the feed was quietly DDoSing our own auth endpoint.
    const { data: authSession } = useAuthSession();
    const userId = authSession?.user?.id;

    // Load cached session from IndexedDB on mount
    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        const load = async () => {
            try {
                const slot = await getSlotShared(connection);
                const active = await getActiveSession(userId, slot);
                if (!cancelled && active) setSession(active);
            } catch { /* non-fatal */ }
        };
        load();
        return () => { cancelled = true; };
    }, [connection, userId]);

    const ensureSession = useCallback(async (): Promise<ActiveSession | null> => {
        if (session) return session;
        if (ensureInProgress.current) return null;

        ensureInProgress.current = true;
        setIsLoading(true);

        try {
            if (!userId) return null;

            // Check IndexedDB for a valid cached session first
            const slot = await getSlotShared(connection);
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

            let round1;
            try {
                round1 = await frostCommit.mutateAsync({ signingSessionId, purpose: 'session' });
            } catch (err: any) {
                // The Swig root is AuthorityType.Ed25519 — NOT session-based —
                // so CreateSessionV1 throws against it. Wallets created before
                // the session authority existed need it added once, root-signed
                // via FROST. Add it, then retry.
                //
                // The outer nonces are reused for the retry deliberately: the
                // failed call threw before the server stored any round-1 state,
                // so they were never consumed by a signature share. The
                // add-authority signing below gets its OWN commitment pair —
                // two concurrent FROST exchanges must not share nonces.
                if (!String(err?.message ?? '').includes('NO_SESSION_AUTHORITY')) throw err;

                const addId = crypto.randomUUID();
                const add1 = await clientCommit(frostData.clientShare);
                const addRound1 = await frostCommit.mutateAsync({ signingSessionId: addId, purpose: 'sessionAuthority' });
                const { serverCommitment: addServerCommitment, txBase64: addTx } =
                    addRound1 as { serverCommitment: any; txBase64: string };
                const addMsg = await extractClientMessageBytes(addTx);
                const addShare = await clientSignShare(
                    frostData.clientShare,
                    frostData.publicInfo,
                    add1.nonces,
                    add1.clientCommitment,
                    addServerCommitment,
                    addMsg,
                );
                await frostSign.mutateAsync({
                    signingSessionId: addId,
                    clientCommitment: add1.clientCommitment,
                    clientSigShare: addShare,
                });

                round1 = await frostCommit.mutateAsync({ signingSessionId, purpose: 'session' });
            }

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
    }, [session, connection, frostSetup, frostCommit, frostSign, userId]);

    const clearSwigSession = useCallback(async () => {
        if (userId) {
            await clearSession(userId);
            await clearFrostClientShare(userId);
        }
        setSession(null);
    }, [userId]);

    return { session, isLoading, ensureSession, clearSwigSession };
}
