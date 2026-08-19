import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema/auth/user";
import { linkedWallets, MAX_LINKED_WALLETS } from "@/db/schema/auth/linked-wallets";
import { getEvmAssetsBatch } from "@/lib/chains/assets/evm";
import { BASE, BNB, ETHEREUM, POLYGON } from "@/lib/chains/registry";
import { withCache } from "@/lib/cache";

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
    /**
     * The native balance for an EXTERNAL EVM wallet, and only that case.
     *
     * Identity queries should not do network I/O, and this one does — on
     * purpose. A Solana wallet's balance already arrives through the header's
     * existing getWalletAssets query; an external EVM wallet has no such path,
     * and making the chip issue a second round trip after learning the chain is
     * how it would paint SOL, then blank, then ETH. use-header-wallet spends
     * real effort eliminating exactly that flicker. One cached number here
     * costs less than reintroducing it.
     *
     * `null` means "asked and don't know" (no indexer key, upstream down) —
     * distinct from 0, which the chip must render differently.
     */
    native?: { symbol: string; balance: number; chainId: number } | null;
};

/** The EVM chains Alchemy's portfolio endpoint covers, in one request. */
const EVM_BALANCE_CHAINS = [ETHEREUM, BASE, POLYGON, BNB];

/**
 * Native balance for an external EVM wallet, AND the chain it is on.
 *
 * It used to read Ethereum mainnet unconditionally, reasoning that the EVM
 * networks share one address and one native symbol. That is true of the
 * ADDRESS and false of the BALANCE: someone who signs in with Base and holds
 * ETH on Base was shown their Ethereum balance, which is almost always zero.
 * The wrong chain badge was the visible half of a wrong number.
 *
 * So the chain is resolved from where the user actually holds value, ranked by
 * USD rather than by raw amount — comparing 0.5 BNB against 0.4 ETH on the
 * number alone picks the wrong one.
 *
 * This costs nothing extra: `getEvmAssetsBatch` is Alchemy's portfolio
 * endpoint, so four networks is the same single request one network was.
 *
 * `signInChainId` is the fallback for a wallet holding nothing anywhere, so a
 * fresh Base account still reads as Base instead of defaulting to Ethereum.
 */
async function evmNativeBalance(
    address: string,
    signInChainId: number | null,
): Promise<{ symbol: string; balance: number; chainId: number } | null> {
    const fallbackChain =
        EVM_BALANCE_CHAINS.find((c) => c.chainId === signInChainId) ?? ETHEREUM;

    try {
        return await withCache(`active-wallet-native:${address}:${signInChainId ?? "x"}`, 30, async () => {
            const batch = await getEvmAssetsBatch(address, EVM_BALANCE_CHAINS);
            if (!batch) return null;

            let best: { symbol: string; balance: number; chainId: number; rank: number } | null = null;
            for (const chain of EVM_BALANCE_CHAINS) {
                const native = batch.get(chain.id)?.assets.find((a) => a.isNative);
                if (!native || native.balance <= 0 || !chain.chainId) continue;
                // usdValue is absent when the price lookup missed; the raw
                // balance is a poor cross-asset comparison but a fine tiebreak
                // against nothing.
                const rank = native.usdValue ?? native.balance;
                if (!best || rank > best.rank) {
                    best = { symbol: native.symbol, balance: native.balance, chainId: chain.chainId, rank };
                }
            }

            if (best) return { symbol: best.symbol, balance: best.balance, chainId: best.chainId };

            // Holds nothing anywhere: report zero ON THE FALLBACK CHAIN rather
            // than null, which would render as "don't know" when we do know.
            const fallbackNative = batch.get(fallbackChain.id)?.assets.find((a) => a.isNative);
            return {
                symbol: fallbackNative?.symbol ?? fallbackChain.nativeCurrency.symbol,
                balance: 0,
                chainId: fallbackChain.chainId!,
            };
        });
    } catch (err) {
        console.error("[wallet] evmNativeBalance failed:", err, (err as { cause?: unknown })?.cause ?? "");
        return null;
    }
}

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
            chainId: linkedWallets.chain_id,
            label: linkedWallets.label,
        })
        .from(linkedWallets)
        .where(and(eq(linkedWallets.user_id, userId), eq(linkedWallets.is_primary, true)))
        .limit(1);

    if (primary) {
        const { chainId, ...rest } = primary;
        const wallet = rest as ActiveWallet;
        if (wallet.chainKind === "evm") {
            wallet.native = await evmNativeBalance(wallet.address, chainId ?? null);
        }
        return wallet;
    }

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
            chainId: linkedWallets.chain_id,
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
