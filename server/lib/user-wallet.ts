/**
 * The Solana address an account acts as — and where its money is sent.
 *
 * FIVE call sites pay a user — paywall unlocks (content.ts), creator
 * subscription claims (subscription.ts), referral earnings (referral.ts),
 * prediction winnings (predictions.ts) and escrow releases (escrow.ts) — and
 * each one read `user.wallet_address` inline with its own error string. Five
 * copies of a rule is five places to change and four places to forget, which is
 * the same reason `server/lib/premium-entitlement.ts` exists.
 *
 * ## The bug this fixes
 *
 * `user.wallet_address` mirrors the PRIMARY of up to 15 linked wallets, and its
 * own schema comment says it is null for an account whose only wallet is
 * external EVM — that wallet genuinely has no Solana address. Every payout path
 * then hard-failed with "no wallet on file" for a user who demonstrably has
 * wallets. Nobody has hit it yet (measured 2026-08-19: 22 linked wallets, 20
 * accounts, zero EVM) but the login screen leads with Sign in with Base, so the
 * first Base-only creator who earns anything would have.
 *
 * ## Solana only, deliberately
 *
 * All five paths settle in SOL or USDC on Solana — `verifySolPayment`,
 * `transferUsdcFromTreasury`, and escrow's `new PublicKey(...)`. Handing any of
 * them a `0x` address produces a crash or, worse, a transfer built against a
 * malformed key. The mirror is NOT safe to trust here on its own: it went
 * chain-agnostic when multichain accounts landed, and EVM addresses have been
 * observed in it (see the note in lib/wallet/assets-webhook.ts), so its FORMAT
 * is checked rather than assumed.
 *
 * ## Where the receiving-wallet setting plugs in
 *
 * This is the seam. When users can choose a receiving wallet and whether to
 * receive privately, both questions get answered HERE — one function, five
 * callers already wired — rather than being threaded through five files.
 */

import { and, asc, desc, eq, or, isNull } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema/auth/user";
import { linkedWallets } from "@/db/schema/auth/linked-wallets";
import { isAddressFormat } from "@/lib/chains/address";

/**
 * The Solana address this account acts as, or null when it has none.
 *
 * Used for every "this user's wallet" question that is NOT a payout: which
 * address to invalidate asset caches for, which to read NFTs from, which to
 * check a signature against.
 *
 * Preference order, and each step is load-bearing:
 *   1. the mirrored primary, IF it is actually a Solana address
 *   2. their primary linked wallet, then their oldest — a wallet whose
 *      `chain_kind` is null (the generated multichain wallet, whose
 *      `linked_wallets.address` IS its Solana address) or "solana"
 *   3. null, which every caller must still handle: an account really can have
 *      no Solana address at all.
 */
export async function solanaAddressFor(
    userId: string,
    /**
     * The caller's already-loaded `user.wallet_address`, when it has one.
     *
     * Callers inside a request usually do: it rides on the session. Passing it
     * makes the common case cost ZERO queries — the mirror is correct for every
     * account whose primary is a Solana wallet, which today is all of them.
     * Only the case this function exists for (a NULL or non-Solana mirror) pays
     * for a lookup. Without this, fixing a bug that currently affects nobody
     * would have added a round trip to hot paths like asset invalidation and
     * getNfts, which is a bad trade.
     */
    knownMirror?: string | null,
): Promise<string | null> {
    if (knownMirror && isAddressFormat("solana", knownMirror)) return knownMirror;

    if (knownMirror === undefined) {
        const [row] = await db
            .select({ mirror: user.wallet_address })
            .from(user)
            .where(eq(user.id, userId))
            .limit(1);
        if (row?.mirror && isAddressFormat("solana", row.mirror)) return row.mirror;
    }

    const [linked] = await db
        .select({ address: linkedWallets.address })
        .from(linkedWallets)
        .where(and(
            eq(linkedWallets.user_id, userId),
            or(isNull(linkedWallets.chain_kind), eq(linkedWallets.chain_kind, "solana")),
        ))
        // Their chosen primary first; oldest as the tiebreak so the answer is
        // stable rather than whatever the planner returns first.
        .orderBy(desc(linkedWallets.is_primary), asc(linkedWallets.created_at))
        .limit(1);

    return linked?.address && isAddressFormat("solana", linked.address) ? linked.address : null;
}

/**
 * Where to SEND this user's money.
 *
 * Identical to `solanaAddressFor` today and deliberately a separate name: when
 * the receiving-wallet setting lands, "which wallet am I" and "where do I get
 * paid" stop being the same question, and only this one changes. Five callers
 * already point here, so that becomes a one-file edit instead of a five-file
 * hunt.
 */
export async function payoutDestinationFor(
    userId: string,
    knownMirror?: string | null,
): Promise<string | null> {
    return solanaAddressFor(userId, knownMirror);
}
