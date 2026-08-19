import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema/auth/user";
import { linkedWallets, MAX_LINKED_WALLETS } from "@/db/schema/auth/linked-wallets";

/**
 * Wallet reads for the account picker and the header.
 *
 * Lives here rather than inline in server/routers/wallet.ts because that router
 * is long past the file-size guard's line; the guard is what forced the split,
 * and it was right to.
 *
 * The model these encode: a WALLET IS NOT AN ADDRESS. The generated ("swig")
 * wallet is ONE wallet holding an address on every chain kind — its per-kind
 * addresses live in `wallet_addresses` — so its `chainKind` is null, meaning
 * multichain. An external wallet is one wallet on one chain and names it.
 * Signing in with Base, then generating, then linking MetaMask is three wallets.
 */

export type ActiveWallet = {
    address: string;
    source: "swig" | "extension";
    /** null = the multichain generated wallet. */
    chainKind: "solana" | "evm" | "bitcoin" | "sui" | null;
    label: string | null;
};

/**
 * The wallet in use, and what chain it is on.
 *
 * Exists because `user.wallet_address` cannot answer this. That column is the
 * SOLANA mirror of the primary wallet, so for an account whose only wallet is
 * an external Base or MetaMask one it is null — and every surface reading it
 * concluded "no wallet" when the truth is "a wallet, on a chain this column
 * cannot represent".
 *
 * Falls back to the legacy column for accounts that predate linked_wallets, so
 * this is safe to read everywhere rather than only on new accounts.
 */
export async function resolveActiveWallet(userId: string): Promise<ActiveWallet | null> {
    const [primary] = await db
        .select({
            address: linkedWallets.address,
            source: linkedWallets.source,
            chainKind: linkedWallets.chain_kind,
            label: linkedWallets.label,
        })
        .from(linkedWallets)
        .where(and(eq(linkedWallets.user_id, userId), eq(linkedWallets.is_primary, true)))
        .limit(1);

    if (primary) return primary as ActiveWallet;

    const [row] = await db
        .select({ address: user.wallet_address })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);

    if (!row?.address) return null;
    return { address: row.address, source: "swig", chainKind: null, label: null };
}

/** Every wallet on the account, primary first. */
export async function listWalletsForUser(userId: string) {
    const rows = await db
        .select({
            id: linkedWallets.id,
            address: linkedWallets.address,
            source: linkedWallets.source,
            chainKind: linkedWallets.chain_kind,
            label: linkedWallets.label,
            isPrimary: linkedWallets.is_primary,
            createdAt: linkedWallets.created_at,
        })
        .from(linkedWallets)
        .where(eq(linkedWallets.user_id, userId));

    return {
        wallets: rows.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
        max: MAX_LINKED_WALLETS,
    };
}
