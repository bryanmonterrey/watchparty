import "server-only";

import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import type { CoinFeedTrader } from "@/db/schema/content/coin-feed";
import { linkedWallets } from "@/db/schema/auth/linked-wallets";
import { walletAddresses } from "@/db/schema/auth/wallet-addresses";
import { user } from "@/db/schema/auth/user";

/**
 * Map wallet addresses back to watchparty accounts.
 *
 * This is the thing a pure market board can't do: everyone else's holder and
 * trade tables are lists of addresses, because an address is all they have.
 * Where a wallet belongs to someone here, we can show the person instead.
 *
 * Checks both wallet tables — linked_wallets (the Swig wallet and any linked
 * Solana extensions) and wallet_addresses (the derived per-chain-kind
 * addresses). Unknown wallets come back address-only; the address is never
 * rendered, only used as a stable seed for the placeholder avatar.
 *
 * Lifted out of lib/coin-feed/clusters.ts, which had it private to the alert
 * cron. The coin page's trades table needs exactly the same lookup, and a
 * second copy would have drifted — this module carries no cron dependencies, so
 * importing it doesn't pull the alert pipeline along.
 */
export async function resolveTraders(addresses: string[]): Promise<Map<string, CoinFeedTrader>> {
    const out = new Map<string, CoinFeedTrader>();
    for (const a of addresses) out.set(a, { address: a });
    if (addresses.length === 0) return out;

    try {
        const [linked, derived] = await Promise.all([
            db
                .select({
                    address: linkedWallets.address,
                    userId: user.id,
                    username: user.username,
                    avatarUrl: user.avatar_url,
                })
                .from(linkedWallets)
                .innerJoin(user, eq(user.id, linkedWallets.user_id))
                .where(inArray(linkedWallets.address, addresses)),
            db
                .select({
                    address: walletAddresses.address,
                    userId: user.id,
                    username: user.username,
                    avatarUrl: user.avatar_url,
                })
                .from(walletAddresses)
                .innerJoin(user, eq(user.id, walletAddresses.user_id))
                .where(inArray(walletAddresses.address, addresses)),
        ]);

        for (const row of [...linked, ...derived]) {
            out.set(row.address, {
                address: row.address,
                userId: row.userId,
                username: row.username,
                avatarUrl: row.avatarUrl,
            });
        }
    } catch {
        // Identity is a nicety — a failed lookup must not drop the row.
    }
    return out;
}
