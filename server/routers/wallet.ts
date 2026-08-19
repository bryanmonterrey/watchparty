import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "@/server/trpc";
import { createClient } from "@supabase/supabase-js";
import {
    logWalletAccess,
    checkRateLimit,
    getResetTime,
} from "@/lib/security/audit-logger";
import { headers } from "next/headers";
import { TRPCError } from "@trpc/server";
import { isHeliusQuotaError, alertHeliusQuota, alertSwigTreasury } from "@/lib/alerts/discord";
// web3.js and the Connection helper load lazily — this router rides into
// every tRPC isolate via the appRouter graph, and the eager SDK import was
// part of the Workers OOM headroom problem.
const web3 = () => import("@solana/web3.js");
async function serverConnection() {
    const { createServerConnection } = await import("@/lib/solana/server-connection");
    return createServerConnection();
}
import { resolveTraders } from "@/lib/coins/resolve-traders";
import { gtBase, gtHeaders } from "@/lib/coins/gecko-endpoint";
import { withCache, withSwrCache, invalidateCache, redis, TTL } from "@/lib/cache";
import { db } from "@/db";
import { listWalletsForUser, resolveActiveWallet } from "@/server/lib/active-wallet";
import { trades } from "@/db/schema/content";
import { nanoid } from "nanoid";
import { and, eq, isNull } from "drizzle-orm";
import { resolvePool } from "@/lib/tokens/udf-datafeed";
import { deriveWalletKey } from "@/lib/wallet/key-derivation";
import { getSeedForUser } from "@/lib/wallet/seed";
import { ensureEmbeddedWallet, makeWalletPrimary } from "@/lib/wallet/ensure-embedded";
import { linkedWallets, MAX_LINKED_WALLETS } from "@/db/schema";
import { ed25519 } from "@noble/curves/ed25519.js";
import {
    executeSwap,
    getSwapQuote,
    swapSupport,
    NATIVE_TOKEN as EVM_NATIVE_TOKEN,
    type SwapQuote,
} from "@/lib/chains/swap";
import {
    estimateFee,
    hasSendProvider,
    sendOnChain as sendOnChainTx,
    validateAddress,
} from "@/lib/chains/send";
import { accrueSendFee } from "@/lib/chains/send/fees";
import { getChain, CHAINS, CHAIN_KINDS } from "@/lib/chains/registry";
import { getAssetsForChain, hasAssetProvider, type ChainAsset } from "@/lib/chains/assets";
import { getNativePrice, getTokenPrices } from "@/lib/chains/assets/prices";
import { heliusQuotaOut, markHeliusQuotaOut } from "@/lib/helius/quota";
import { resolveFeeAccount, feeAccountForSwap } from "@/lib/jupiter/referral-fee";
import { PLATFORM_FEE_BPS } from "@/lib/chains/fee-bps";
import { getEvmAssetsBatch } from "@/lib/chains/assets/evm";
import {
    getActivityForChain,
    hasActivityProvider,
    type ChainActivity,
} from "@/lib/chains/activity";
import { seedFromMnemonic } from "@/lib/chains/derive";
import {
    LEGACY_SOLANA_PATH,
    getAddressesByKind,
    persistDerivedAddresses,
} from "@/lib/wallet/multichain";
import { getLifiTokenInfo } from "@/lib/chains/swap/lifi";

const subtle = globalThis.crypto?.subtle;

import { humanToBaseUnits } from "@/lib/wallet/base-units";

/** humanToBaseUnits with the router's error vocabulary — the lib throws
 *  RangeError so it stays unit-testable without tRPC in the graph. */
function toBaseUnitsOrBadRequest(human: string, decimals: number): string {
    try {
        return humanToBaseUnits(human, decimals);
    } catch (err) {
        throw new TRPCError({ code: "BAD_REQUEST", message: (err as Error).message });
    }
}

const evmSwapInput = z.object({
    chain: z.string(),
    /** Contract address, or the zero-address sentinel for the native coin. */
    fromToken: z.string(),
    toToken: z.string(),
    /** Human units ("0.25"), converted server-side — the client would need the
     *  token's decimals to build base units, and resolving those lives here. */
    amountHuman: z.string(),
    slippageBps: z.number().min(10).max(3000).default(100),
});

/** Shared by the quote query and the swap mutation: resolve the user's EVM
 *  address, convert the human amount via real decimals, quote through LI.FI. */
async function resolveEvmSwapQuote(userId: string, input: z.infer<typeof evmSwapInput>) {
    const chain = getChain(input.chain);
    if (!chain || swapSupport(input.chain).provider !== "lifi") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Swaps aren't available on this chain" });
    }
    const addresses = await getAddressesByKind(userId);
    const address = addresses[chain.kind];
    if (!address) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No wallet on this chain yet — open your wallet to set one up" });
    }
    const fromDecimals =
        input.fromToken === EVM_NATIVE_TOKEN
            ? chain.nativeCurrency.decimals
            : (
                  await withCache(`lifi-token:${chain.id}:${input.fromToken.toLowerCase()}`, 86_400, () =>
                      getLifiTokenInfo(chain.id, input.fromToken)
                  )
              ).decimals;
    const fromAmount = toBaseUnitsOrBadRequest(input.amountHuman, fromDecimals);
    if (BigInt(fromAmount) <= BigInt(0)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Amount is too small" });
    }
    const quote = await getSwapQuote(
        {
            chain: chain.id,
            fromToken: input.fromToken,
            toToken: input.toToken,
            fromAmount,
            slippage: input.slippageBps / 10_000,
        },
        address
    );
    return { chain, address, quote };
}


/**
 * Decrypts a wallet's private key bytes. If the wallet is v1 (no master key),
 * it is transparently re-encrypted with the master key and upgraded to v2.
 */
async function decryptWalletKey(walletData: any, userId: string): Promise<Uint8Array> {
  if (!subtle) throw new Error("Web Crypto API not available");

  const credentialId = walletData.passkey_credential_id || `social-${userId}`;
  const salt = Buffer.from(walletData.salt, "base64");
  const iv = Buffer.from(walletData.iv, "base64");
  const encryptedPrivKey = Buffer.from(walletData.encrypted_privkey, "base64");
  const keyVersion: number = walletData.key_version ?? 1;

  const decryptionKey = await deriveWalletKey(credentialId, salt, keyVersion, ["decrypt"]);

  let decrypted: ArrayBuffer;
  try {
    decrypted = await subtle.decrypt({ name: "AES-GCM", iv: iv as any }, decryptionKey, encryptedPrivKey as any);
  } catch {
    throw new Error("Failed to decrypt wallet — invalid credentials");
  }

  // Transparently migrate v1 wallets to v2 on first use
  if (keyVersion < 2) {
    try {
      const newIv = crypto.getRandomValues(new Uint8Array(12));
      const encKey = await deriveWalletKey(credentialId, salt, 2, ["encrypt"]);
      const reEncrypted = await subtle.encrypt({ name: "AES-GCM", iv: newIv as any }, encKey, decrypted);
      await supabase.from("encrypted_wallets").update({
        encrypted_privkey: Buffer.from(reEncrypted).toString("base64"),
        iv: Buffer.from(newIv).toString("base64"),
        key_version: 2,
        updated_at: new Date().toISOString(),
      }).eq("user_id", userId);
    } catch (migrationErr) {
      console.error("v1→v2 wallet migration failed (non-fatal):", migrationErr);
    }
  }

  return new Uint8Array(decrypted);
}

// Module-level singleton — avoids re-creating the client (and its underlying HTTP connection pool)
// on every tRPC request. Safe to share since the service-role key is read-only env config.
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const SOL_WSOL_MINT = "So11111111111111111111111111111111111111112";

/** All-ones mint: how native SOL is keyed in the wallet's own token lists. */
const SOL_NATIVE_MINT = "So11111111111111111111111111111111111111111";

/**
 * Drop a wallet's cached holdings after something we did changed them.
 *
 * Load-bearing now that holdings sit on a long window: they only move when a
 * transaction touches the wallet, so freshness comes from being TOLD, not from
 * asking often — the Helius webhook covers deposits from outside, and this
 * covers the sends and swaps we make ourselves. Without it our own transfer
 * would leave a stale balance on screen for the whole window.
 *
 * Clears the pre-split key too, so nothing cached under it outlives the deploy.
 */
function invalidateWalletAssets(address?: string | null): void {
    if (!address) return;
    void invalidateCache(`helius:holdings:${address}`);
    void invalidateCache(`helius:assets:${address}`);
}

// GeckoTerminal TTLs — now backed by Redis (see getChartData)
const GT_POOL_TTL  = 60 * 60 * 1000;  // kept for reference
const GT_OHLCV_TTL = 5  * 60 * 1000;  // kept for reference

/** Normalize a Helius DAS asset into a swap Token, hiding wSOL internals from the user. */
function normalizeSwapToken(asset: any) {
    const address = asset.id as string;
    const rawSymbol = asset.token_info?.symbol || asset.content?.metadata?.symbol || "UNKNOWN";
    const rawName   = asset.content?.metadata?.name || "Unknown Coin";
    const logoURI   = asset.content?.links?.image || asset.content?.files?.[0]?.uri || null;
    const decimals  = asset.token_info?.decimals ?? 9;

    // Present wSOL as plain "SOL" — Jupiter wraps/unwraps transparently
    if (address === SOL_WSOL_MINT) {
        return { address, symbol: "SOL", name: "Solana", decimals, logoURI };
    }
    return { address, symbol: rawSymbol, name: rawName, decimals, logoURI };
}


export const walletRouter = router({
    /**
     * Give this account an embedded Swig wallet if it lacks one, and make it
     * primary. Extension sign-ins land here: the wallet they arrived with stays
     * linked, the Swig wallet becomes the account's main address.
     *
     * Idempotent — returns created:false when one already exists. The mnemonic
     * comes back ONLY on creation, so the client can prompt a backup; it is
     * recoverable later through revealPhrase.
     */
    ensureEmbedded: protectedProcedure.mutation(async ({ ctx }) => {
        const result = await ensureEmbeddedWallet(ctx.user.id, { makePrimary: true });
        return {
            created: result.created,
            swigAddress: result.swigAddress,
            mnemonic: result.mnemonic,
            clientShare: result.clientShare,
            publicInfo: result.publicInfo,
            d2: result.d2,
        };
    }),

    /** Every wallet on the account, primary first. See server/lib/active-wallet.ts. */
    listLinkedWallets: protectedProcedure.query(({ ctx }) => listWalletsForUser(ctx.user.id)),

    /** The wallet in use, and the chain it is on. See server/lib/active-wallet.ts. */
    getActiveWallet: protectedProcedure.query(({ ctx }) => resolveActiveWallet(ctx.user.id)),

    getLinkNonce: protectedProcedure
        .input(z.object({ address: z.string().min(32) }))
        .mutation(async ({ ctx, input }) => {
            const nonce = nanoid(24);
            await redis.set(`link-nonce:${ctx.user.id}:${input.address}`, nonce, { ex: 300 });
            return {
                nonce,
                message: `watchparty: link this wallet to your account\n\nnonce: ${nonce}`,
            };
        }),

    /** Link a Solana wallet after verifying a signature over the issued nonce. */
    linkWallet: protectedProcedure
        .input(z.object({
            address: z.string().min(32),
            /** base64 ed25519 signature over the message from getLinkNonce. */
            signature: z.string().min(1),
            label: z.string().max(40).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const existing = await db
                .select({ id: linkedWallets.id })
                .from(linkedWallets)
                .where(eq(linkedWallets.user_id, ctx.user.id));

            if (existing.length >= MAX_LINKED_WALLETS) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: `You can link at most ${MAX_LINKED_WALLETS} wallets`,
                });
            }

            const key = `link-nonce:${ctx.user.id}:${input.address}`;
            const nonce = await redis.get<string>(key);
            if (!nonce) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Nonce expired — try again" });
            }

            const message = `watchparty: link this wallet to your account\n\nnonce: ${nonce}`;
            // Dynamic import mirrors the rest of this router — the worker
            // bundle has little headroom, so web3.js stays out of the top level.
            const { PublicKey: SolPublicKey } = await import("@solana/web3.js");
            let verified = false;
            try {
                verified = ed25519.verify(
                    Buffer.from(input.signature, "base64"),
                    new TextEncoder().encode(message),
                    new SolPublicKey(input.address).toBytes()
                );
            } catch {
                verified = false;
            }
            if (!verified) {
                throw new TRPCError({ code: "UNAUTHORIZED", message: "Signature does not match" });
            }

            // Single-use: burn it whether or not the insert below succeeds.
            await redis.del(key);

            try {
                await db.insert(linkedWallets).values({
                    id: nanoid(),
                    user_id: ctx.user.id,
                    address: input.address,
                    source: "extension",
                    label: input.label,
                    is_primary: false,
                });
            } catch {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: "That wallet is already linked to an account",
                });
            }

            return { linked: true };
        }),

    /** Switch which linked wallet is primary. user.wallet_address follows it. */
    setPrimaryWallet: protectedProcedure
        .input(z.object({ address: z.string().min(32) }))
        .mutation(async ({ ctx, input }) => {
            const [row] = await db
                .select({ source: linkedWallets.source, label: linkedWallets.label })
                .from(linkedWallets)
                .where(and(
                    eq(linkedWallets.user_id, ctx.user.id),
                    eq(linkedWallets.address, input.address)
                ))
                .limit(1);

            if (!row) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Wallet is not linked to you" });
            }

            await makeWalletPrimary(ctx.user.id, input.address, row.source, row.label ?? undefined);
            return { primary: input.address };
        }),

    /** Unlink a wallet. The Swig wallet stays — it is the account's own. */
    unlinkWallet: protectedProcedure
        .input(z.object({ address: z.string().min(32) }))
        .mutation(async ({ ctx, input }) => {
            const rows = await db
                .select({
                    address: linkedWallets.address,
                    source: linkedWallets.source,
                    isPrimary: linkedWallets.is_primary,
                })
                .from(linkedWallets)
                .where(eq(linkedWallets.user_id, ctx.user.id));

            const target = rows.find((r) => r.address === input.address);
            if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Wallet is not linked to you" });

            // The embedded wallet is the account's own and we custody its key
            // material; unlinking would strand it behind an account with no
            // way back to it.
            if (target.source === "swig") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Your watchparty wallet can't be unlinked",
                });
            }
            if (rows.length <= 1) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "You need at least one wallet" });
            }

            await db
                .delete(linkedWallets)
                .where(and(
                    eq(linkedWallets.user_id, ctx.user.id),
                    eq(linkedWallets.address, input.address)
                ));

            // Never leave the account without a primary.
            if (target.isPrimary) {
                const fallback = rows.find((r) => r.address !== input.address && r.source === "swig")
                    ?? rows.find((r) => r.address !== input.address)!;
                await makeWalletPrimary(ctx.user.id, fallback.address, fallback.source);
            }

            return { unlinked: true };
        }),

    /**
     * The user's derived address for every chain, keyed by chain kind.
     * Backfilled lazily: a wallet that predates wallet_addresses gets its rows
     * written on first read, so nobody is stuck without multichain addresses.
     */
    getChainAddresses: protectedProcedure.query(async ({ ctx }) => {
        const stored = await getAddressesByKind(ctx.user.id);
        if (Object.keys(stored).length >= CHAIN_KINDS.length) return stored;

        // Missing rows — derive them now from the stored phrase.
        try {
            const { data } = await supabase
                .from("encrypted_wallets")
                .select("salt, encrypted_mnemonic, mnemonic_iv, passkey_credential_id, key_version, swig_address")
                .eq("user_id", ctx.user.id)
                .single();
            if (!data?.encrypted_mnemonic || !data.mnemonic_iv) return stored;

            const key = await deriveWalletKey(
                data.passkey_credential_id || `social-${ctx.user.id}`,
                Buffer.from(data.salt, "base64"),
                data.key_version ?? 1,
                ["decrypt"]
            );
            const plain = await subtle!.decrypt(
                { name: "AES-GCM", iv: Buffer.from(data.mnemonic_iv, "base64") as any },
                key,
                Buffer.from(data.encrypted_mnemonic, "base64") as any
            );
            const seed = seedFromMnemonic(Buffer.from(plain).toString("utf-8"));

            await persistDerivedAddresses(ctx.user.id, seed, {
                solanaAddress: data.swig_address ?? undefined,
                solanaDerivationPath: data.swig_address ? LEGACY_SOLANA_PATH : undefined,
            });
            return getAddressesByKind(ctx.user.id);
        } catch (err) {
            console.error("getChainAddresses: lazy derive failed", err);
            return stored;
        }
    }),

    /**
     * Another user's receive address for one chain kind, so a send on a
     * non-Solana chain can target an @username the way a Solana send already
     * can — resolved on select, one recipient per call.
     *
     * Same class of data `user.search` already returns for Solana
     * (`wallet_address`): a receive address derived from the recipient's
     * account. Authenticated so it isn't an open address-book scrape. Returns
     * null for a wallet that predates wallet_addresses — we can't derive
     * someone else's rows, so the caller has to say "no address on file".
     */
    getUserChainAddress: protectedProcedure
        .input(z.object({ userId: z.string().min(1), kind: z.string() }))
        .query(async ({ input }) => {
            if (!CHAIN_KINDS.includes(input.kind as (typeof CHAIN_KINDS)[number])) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown chain kind" });
            }
            const addresses = await getAddressesByKind(input.userId);
            return { address: addresses[input.kind as (typeof CHAIN_KINDS)[number]] ?? null };
        }),

    /**
     * Holdings across every non-Solana chain, in one round trip.
     *
     * The tokens list is aggregated (one list, chain badge per row), so the
     * drawer would otherwise fire a query per chain on open. Fanned out here
     * with allSettled: one unreachable chain must not blank the whole list.
     */
    getAllChainAssets: protectedProcedure.query(async ({ ctx }) => {
        const addresses = await getAddressesByKind(ctx.user.id);
        const allTargets = CHAINS.filter((c) => c.kind !== "solana" && hasAssetProvider(c.id));

        // One batched Portfolio call covers the EVM chains Alchemy serves; the
        // rest still go per-chain. Without this the aggregated list costs
        // hundreds of RPC round trips on every drawer open.
        const evmAddress = addresses.evm;
        const batched = evmAddress
            ? await withCache(
                  `assets:evm-batch:${evmAddress}`,
                  30,
                  async () => {
                      const map = await getEvmAssetsBatch(
                          evmAddress,
                          allTargets.filter((c) => c.kind === "evm")
                      );
                      return map ? Object.fromEntries(map) : null;
                  }
              )
            : null;

        const targets = allTargets.filter((c) => !batched?.[c.id]);

        const settled = await Promise.allSettled(
            targets.map(async (chain) => {
                const address = addresses[chain.kind];
                if (!address) return null;
                return withCache(
                    `assets:${chain.id}:${address}`,
                    30,
                    async () => ({ ...(await getAssetsForChain(chain.id, address)), address })
                );
            })
        );

        const assets: ChainAsset[] = [];
        const partial: { chain: string; reason: string }[] = [];
        const failed: { chain: string; reason: string }[] = [];

        for (const result of Object.values(batched ?? {})) {
            if (result) assets.push(...result.assets);
        }

        settled.forEach((outcome, i) => {
            const chain = targets[i];
            if (outcome.status === "rejected") {
                // Surfaced, not swallowed — a chain we couldn't reach is not a
                // chain with no funds.
                failed.push({ chain: chain.id, reason: String(outcome.reason?.message ?? outcome.reason) });
                return;
            }
            if (!outcome.value) return;
            assets.push(...outcome.value.assets);
            if (outcome.value.partial) {
                partial.push({ chain: chain.id, reason: outcome.value.partial.reason });
            }
        });

        // A zero-balance row for every chain the user can actually RECEIVE on, so
        // a funded network never hides just because the balance is 0.
        //
        // It used to be every visible chain, address or not, on the reasoning
        // that the wallet should advertise which networks it supports. That reads
        // as a lie: an extension-only account has no mnemonic, so no derived
        // address exists for Base or BTC — offering those rows invites a deposit
        // to an address that was never created. Support belongs on a setup
        // prompt, not in the holdings list.
        const haveNative = new Set(assets.filter((a) => a.isNative).map((a) => a.chain));
        const missing = allTargets.filter((c) => !haveNative.has(c.id) && !!addresses[c.kind]);

        const prices = await Promise.all(
            missing.map((c) => getNativePrice(c.id).catch(() => null))
        );

        missing.forEach((chain, i) => {
            assets.push({
                chain: chain.id,
                contract: null,
                symbol: chain.nativeCurrency.symbol,
                name: chain.name,
                decimals: chain.nativeCurrency.decimals,
                balance: 0,
                rawBalance: "0",
                price: prices[i]?.price,
                priceChange24h: prices[i]?.priceChange24h,
                usdValue: 0,
                isNative: true,
            });
        });

        return {
            assets,
            totalUsd: assets.reduce((sum, a) => sum + (a.usdValue ?? 0), 0),
            partial,
            failed,
            /** True when no derived addresses exist — the wallet needs setting up. */
            noAddresses: Object.keys(addresses).length === 0,
        };
    }),

    /** Whether the active chain can swap, and through what. */
    getSwapSupport: protectedProcedure
        .input(z.object({ chain: z.string() }))
        .query(({ input }) => swapSupport(input.chain)),

    /** Swap quote on an EVM chain (LI.FI). Read-only — nothing is signed here. */
    getChainSwapQuote: protectedProcedure
        .input(z.object({
            chain: z.string(),
            fromToken: z.string(),
            toToken: z.string(),
            fromAmount: z.string().regex(/^\d+$/, "amount must be base units"),
            slippage: z.number().min(0).max(0.5).optional(),
        }))
        .query(async ({ ctx, input }) => {
            const chain = getChain(input.chain);
            if (!chain) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown chain" });

            const addresses = await getAddressesByKind(ctx.user.id);
            const from = addresses[chain.kind];
            if (!from) throw new TRPCError({ code: "BAD_REQUEST", message: "No address for chain" });

            try {
                return await getSwapQuote({ ...input, chain: chain.id }, from);
            } catch (err: any) {
                throw new TRPCError({ code: "BAD_REQUEST", message: err?.message ?? "Quote failed" });
            }
        }),

    /** Execute a previously fetched swap quote. Signs from the seed-derived key. */
    executeChainSwap: protectedProcedure
        .input(z.object({ quote: z.any() }))
        .mutation(async ({ ctx, input }) => {
            const headersList = await headers();
            const ipAddress = headersList.get("x-forwarded-for") || "unknown";
            const userAgent = headersList.get("user-agent") || "unknown";

            const quote = input.quote as SwapQuote;
            const chain = getChain(quote?.chain);
            if (!chain) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown chain" });

            if (!(await checkRateLimit(ctx.user.id, "sign_transaction"))) {
                throw new TRPCError({
                    code: "TOO_MANY_REQUESTS",
                    message: `Too many transactions. Try again after ${await getResetTime(ctx.user.id, "sign_transaction")}`,
                });
            }

            try {
                const seed = await getSeedForUser(ctx.user.id);
                const result = await executeSwap(seed, quote);
                await logWalletAccess({ userId: ctx.user.id, action: "sign_transaction", ipAddress, userAgent, success: true });

                const addresses = await getAddressesByKind(ctx.user.id);
                await invalidateCache(`assets:${chain.id}:${addresses[chain.kind]}`);
                return result;
            } catch (err: any) {
                await logWalletAccess({ userId: ctx.user.id, action: "sign_transaction", ipAddress, userAgent, success: false });
                throw new TRPCError({ code: "BAD_REQUEST", message: err?.message ?? "Swap failed" });
            }
        }),

    /**
     * Activity across every non-Solana chain, merged and newest-first.
     *
     * There is no network switcher — the wallet shows one list of everything —
     * so history has to aggregate the same way balances do.
     */
    getAllChainActivity: protectedProcedure
        .input(z.object({ limit: z.number().min(1).max(50).default(15) }).optional())
        .query(async ({ ctx, input }) => {
            const limit = input?.limit ?? 15;
            const addresses = await getAddressesByKind(ctx.user.id);
            const targets = CHAINS.filter((c) => c.kind !== "solana" && hasActivityProvider(c.id));

            const settled = await Promise.allSettled(
                targets.map(async (chain) => {
                    const address = addresses[chain.kind];
                    if (!address) return [] as ChainActivity[];
                    return withCache(
                        `activity:${chain.id}:${address}:${limit}`,
                        60,
                        () => getActivityForChain(chain.id, address, limit)
                    );
                })
            );

            const merged: ChainActivity[] = [];
            for (const outcome of settled) {
                // One unreachable chain must not empty the whole feed.
                if (outcome.status === "fulfilled") merged.push(...outcome.value);
            }

            return merged.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit * 2);
        }),

    /** Transaction history for one non-Solana chain. */
    getChainActivity: protectedProcedure
        .input(z.object({ chain: z.string(), limit: z.number().min(1).max(100).default(25) }))
        .query(async ({ ctx, input }) => {
            const chain = getChain(input.chain);
            if (!chain || !hasActivityProvider(chain.id)) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported chain" });
            }

            const addresses = await getAddressesByKind(ctx.user.id);
            const address = addresses[chain.kind];
            if (!address) return [] as ChainActivity[];

            return withCache(
                `activity:${chain.id}:${address}:${input.limit}`,
                60,
                async () => {
                    try {
                        return await getActivityForChain(chain.id, address, input.limit);
                    } catch (err) {
                        console.error(`getChainActivity(${chain.id}) failed`, err);
                        return [] as ChainActivity[];
                    }
                }
            );
        }),

    /** Fee quote for a non-Solana transfer, before the user commits. */
    estimateChainFee: protectedProcedure
        .input(z.object({
            chain: z.string(),
            to: z.string(),
            amount: z.string(),
            contract: z.string().optional(),
        }))
        .query(async ({ ctx, input }) => {
            const chain = getChain(input.chain);
            if (!chain || !hasSendProvider(chain.id)) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported chain" });
            }
            const addresses = await getAddressesByKind(ctx.user.id);
            const from = addresses[chain.kind];
            if (!from) throw new TRPCError({ code: "BAD_REQUEST", message: "No address for chain" });

            try {
                return await estimateFee(chain.id, { ...input, chain: chain.id }, from);
            } catch (err: any) {
                throw new TRPCError({ code: "BAD_REQUEST", message: err?.message ?? "Fee estimate failed" });
            }
        }),

    /**
     * Transfer on a non-Solana chain.
     *
     * Signs from the seed-derived key, because FROST is ed25519-only and cannot
     * produce secp256k1 signatures. Rate-limited and audit-logged like the
     * other key-touching routes.
     */
    sendOnChain: protectedProcedure
        .input(z.object({
            chain: z.string(),
            to: z.string().min(1),
            amount: z.string().regex(/^\d+$/, "amount must be base units"),
            contract: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const headersList = await headers();
            const ipAddress = headersList.get("x-forwarded-for") || "unknown";
            const userAgent = headersList.get("user-agent") || "unknown";

            const chain = getChain(input.chain);
            if (!chain || !hasSendProvider(chain.id)) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported chain" });
            }

            if (!(await checkRateLimit(ctx.user.id, "sign_transaction"))) {
                throw new TRPCError({
                    code: "TOO_MANY_REQUESTS",
                    message: `Too many transactions. Try again after ${await getResetTime(ctx.user.id, "sign_transaction")}`,
                });
            }

            if (!validateAddress(chain.id, input.to)) {
                throw new TRPCError({ code: "BAD_REQUEST", message: `Not a valid ${chain.name} address` });
            }

            try {
                const seed = await getSeedForUser(ctx.user.id);
                const result = await sendOnChainTx(seed, { ...input, chain: chain.id });

                // EVM can't carry the platform fee in the same transaction, so
                // it's recorded here and swept later. No-op on every other
                // chain, which takes its fee in-transaction.
                await accrueSendFee({
                    userId: ctx.user.id,
                    chain: chain.id,
                    contract: input.contract,
                    amount: input.amount,
                    sourceTx: result.txId,
                });

                await logWalletAccess({ userId: ctx.user.id, action: "sign_transaction", ipAddress, userAgent, success: true });
                await invalidateCache(`assets:${chain.id}:${(await getAddressesByKind(ctx.user.id))[chain.kind]}`);
                return result;
            } catch (err: any) {
                await logWalletAccess({ userId: ctx.user.id, action: "sign_transaction", ipAddress, userAgent, success: false });
                throw new TRPCError({ code: "BAD_REQUEST", message: err?.message ?? "Send failed" });
            }
        }),

    /**
     * Quote an EVM swap (LI.FI) against the signed-in user's derived address.
     * A query, so the coin page's trade panel can debounce it for live
     * estimates without spending a signature.
     */
    getEvmSwapQuote: protectedProcedure
        .input(evmSwapInput)
        .query(async ({ ctx, input }) => {
            const { quote } = await resolveEvmSwapQuote(ctx.user.id, input);
            return {
                toAmount: quote.toAmount,
                toAmountMin: quote.toAmountMin,
                toSymbol: quote.toToken.symbol,
                toDecimals: quote.toToken.decimals,
                fromSymbol: quote.fromToken.symbol,
                fromDecimals: quote.fromToken.decimals,
                tool: quote.tool,
            };
        }),

    /**
     * Execute an EVM swap. Re-quotes fresh server-side — a client-held quote
     * is never trusted — then signs from the seed-derived key, the same trust
     * model as sendOnChain. executeLifiSwap handles the ERC-20 allowance when
     * the input is a token rather than the native coin.
     */
    swapEvm: protectedProcedure
        .input(evmSwapInput)
        .mutation(async ({ ctx, input }) => {
            const headersList = await headers();
            const ipAddress = headersList.get("x-forwarded-for") || "unknown";
            const userAgent = headersList.get("user-agent") || "unknown";

            if (!(await checkRateLimit(ctx.user.id, "sign_transaction"))) {
                throw new TRPCError({
                    code: "TOO_MANY_REQUESTS",
                    message: `Too many transactions. Try again after ${await getResetTime(ctx.user.id, "sign_transaction")}`,
                });
            }

            try {
                const { chain, address, quote } = await resolveEvmSwapQuote(ctx.user.id, input);
                const seed = await getSeedForUser(ctx.user.id);
                const result = await executeSwap(seed, quote);

                await logWalletAccess({ userId: ctx.user.id, action: "sign_transaction", ipAddress, userAgent, success: true });
                await invalidateCache(`assets:${chain.id}:${address}`);
                return {
                    txId: result.txId,
                    explorerUrl: result.explorerUrl,
                    toAmount: quote.toAmount,
                    toDecimals: quote.toToken.decimals,
                    toSymbol: quote.toToken.symbol,
                };
            } catch (err: any) {
                await logWalletAccess({ userId: ctx.user.id, action: "sign_transaction", ipAddress, userAgent, success: false });
                if (err instanceof TRPCError) throw err;
                throw new TRPCError({ code: "BAD_REQUEST", message: err?.message ?? "Swap failed" });
            }
        }),

    /**
     * Balances for one non-Solana chain. Solana keeps using getWalletAssets —
     * that path has Helius, NFTs, spam filtering and hidden-token handling.
     */
    getChainAssets: protectedProcedure
        .input(z.object({ chain: z.string() }))
        .query(async ({ ctx, input }) => {
            const chain = getChain(input.chain);
            if (!chain) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown chain" });
            if (!hasAssetProvider(chain.id)) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: `${chain.name} assets come from getWalletAssets`,
                });
            }

            const addresses = await getAddressesByKind(ctx.user.id);
            const address = addresses[chain.kind];
            if (!address) {
                return {
                    assets: [] as ChainAsset[],
                    totalUsd: 0,
                    address: null as string | null,
                    partial: undefined as { reason: string } | undefined,
                };
            }

            return withCache(
                `assets:${chain.id}:${address}`,
                30,
                async () => ({ ...(await getAssetsForChain(chain.id, address)), address })
            );
        }),

    /**
     * Get or create a Swig smart wallet + session key for the authenticated user.
     *
     * On first call: creates the Swig wallet (via Swig API or treasury keypair),
     * decrypts the user's custodial private key to sign the session creation tx,
     * One-time FROST setup: generates a 2-of-2 FROST keypair, creates the Swig
     * smart wallet with the FROST group pubkey as root authority, and stores the
     * encrypted server share in the DB. Returns the client share (stored in
     * IndexedDB) and the Swig address.
     */
    // Lazily creates the Swig on-chain account on first outgoing transaction.
    // FROST keypair + Swig PDA are already computed at signup (free, no RPC).
    // This is the only step that hits the chain (treasury pays ~$0.30 once).
    /**
     * Create the caller's Swig account on-chain, if it isn't already.
     *
     * Split out of frostSetup, which only ever needed to decrypt a column.
     * Doing it there meant every visit to /messages loaded a chain SDK into a
     * request handler on a worker that already dies for exceededMemory on ~1%
     * of requests — and when it died, the client got an unparseable response
     * ("u is not iterable") and the messages page told embedded-wallet users to
     * connect a wallet they don't have.
     *
     * Call this from the paths that actually need an on-chain account: signing.
     * Reading messages does not.
     *
     * Idempotent and non-throwing on chain failure: it reports what happened
     * rather than taking the caller down. An empty fee-payer treasury alerts
     * (deduped) instead of failing silently, which is how it hid for a day.
     */
    ensureSwigAccount: protectedProcedure.mutation(async ({ ctx }) => {
        const { data: w } = await supabase
            .from("encrypted_wallets")
            .select("frost_public_key, swig_id, swig_account_created")
            .eq("user_id", ctx.user.id)
            .single();

        if (!w?.swig_id || !w.frost_public_key) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No embedded wallet" });
        }
        if (w.swig_account_created) return { created: false, ready: true };

        try {
            const { createSwigAccount } = await import("@/lib/swig/swig-server");
            await createSwigAccount(w.swig_id, w.frost_public_key);
        } catch (err: any) {
            const msg = err?.message ?? String(err);
            // A prior partial attempt already made it — that's success.
            if (!msg.includes("already in use")) {
                console.error("[ensureSwigAccount] failed", { userId: ctx.user.id, error: msg });
                alertSwigTreasury("wallet.ensureSwigAccount → createSwigAccount", msg);
                return { created: false, ready: false, error: msg };
            }
        }

        await supabase
            .from("encrypted_wallets")
            .update({ swig_account_created: true, updated_at: new Date().toISOString() })
            .eq("user_id", ctx.user.id);

        return { created: true, ready: true };
    }),

    frostSetup: protectedProcedure.mutation(async ({ ctx }) => {
        const { data: walletData, error } = await supabase
            .from("encrypted_wallets")
            .select("passkey_credential_id, salt, key_version, frost_public_key, frost_public_info, frost_server_share, frost_client_share_encrypted, frost_client_share_iv, swig_address, swig_id, swig_account_created")
            .eq("user_id", ctx.user.id)
            .single();

        if (error || !walletData) throw new TRPCError({ code: "NOT_FOUND", message: "Wallet not found" });
        if (!walletData.frost_public_key || !walletData.swig_id) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "FROST not initialized — re-create wallet" });
        }

        // NO Swig creation here. On purpose, and it took three wrong guesses
        // to land on why.
        //
        // This procedure's entire job is an AES decrypt of a column. It was also
        // pulling in @swig-wallet/classic + @solana/kit + web3.js to poke the
        // chain — hundreds of exports of SDK, loaded inside a request handler on
        // a worker that already gets killed for exceededMemory on ~1% of
        // requests (see CLAUDE.md). The client saw "u is not iterable" out of
        // TRPCClientError.from, which is the shape of a response the client
        // couldn't parse — an isolate dying mid-request, not a clean error.
        //
        // Proven NOT to be: the treasury (matcha's share decrypts fine — checked
        // against the real row), and not the module failing to load either (it
        // imports cleanly in a workerd probe, 303 exports). What's left is the
        // weight of doing it here at all.
        //
        // Creating the on-chain account is a SIGNING concern. It now lives in
        // ensureSwigAccount below, called when signing actually needs it, so
        // reading your messages never loads a chain SDK.

        // Recover the FROST client share if the server has an encrypted backup.
        // This restores signing capability when the user's IndexedDB has been cleared
        // or they're signing in on a new device for the first time.
        let clientShare: any = null;
        if (walletData.frost_client_share_encrypted && walletData.frost_client_share_iv) {
            try {
                const salt = Buffer.from(walletData.salt, "base64");
                const decKey = await deriveWalletKey(
                    walletData.passkey_credential_id || `social-${ctx.user.id}`,
                    salt,
                    walletData.key_version ?? 1,
                    ["decrypt"]
                );
                const shareBytes = await subtle!.decrypt(
                    { name: "AES-GCM", iv: Buffer.from(walletData.frost_client_share_iv, "base64") as any },
                    decKey,
                    Buffer.from(walletData.frost_client_share_encrypted, "base64") as any
                );
                clientShare = JSON.parse(Buffer.from(shareBytes).toString());
            } catch {
                // Non-fatal — client will surface a re-create wallet prompt if needed
            }
        }

        return {
            clientShare,
            publicInfo: JSON.parse(walletData.frost_public_info!),
            swigAddress: walletData.swig_address!,
        };
    }),

    /**
     * FROST Round 1 (commit) — message-independent.
     * For session creation: also builds the session tx, pre-signs with treasury,
     * stores everything in Redis with a 5-minute TTL.
     * For transaction signing: just commits and stores nonces.
     */
    frostCommit: protectedProcedure
        .input(z.object({
            signingSessionId: z.string().uuid(),
            purpose: z.enum(["session", "sessionAuthority", "tx", "copyEnable", "copyDisable", "copyUpdateCap"]),
            // For purpose='tx': the raw transaction to wrap in Swig execute instructions
            rawTransaction: z.string().optional(),
            // For purpose='copyEnable': the on-chain daily USDC cap (whole dollars)
            dailyUsdcCap: z.number().min(1).max(5_000).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const { data: walletData } = await supabase
                .from("encrypted_wallets")
                .select("passkey_credential_id, salt, key_version, frost_server_share, frost_server_share_iv, frost_public_key, frost_public_info, swig_address")
                .eq("user_id", ctx.user.id)
                .single();

            if (!walletData?.frost_server_share) throw new TRPCError({ code: "NOT_FOUND", message: "FROST not initialized" });

            // Decrypt server share
            const salt = Buffer.from(walletData.salt, "base64");
            const decKey = await deriveWalletKey(
                walletData.passkey_credential_id || `social-${ctx.user.id}`,
                salt,
                walletData.key_version ?? 1,
                ["decrypt"]
            );
            const shareBytes = await subtle!.decrypt(
                { name: "AES-GCM", iv: Buffer.from(walletData.frost_server_share_iv, "base64") as any },
                decKey,
                Buffer.from(walletData.frost_server_share, "base64") as any
            );
            const serverShare = JSON.parse(Buffer.from(shareBytes).toString());

            const { serverCommit } = await import("@/lib/frost/frost-server");
            const { nonces, serverCommitment } = serverCommit(serverShare);

            const { Redis } = await import("@upstash/redis");
            const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! });

            const redisKey = `frost:round1:${ctx.user.id}:${input.signingSessionId}`;

            if (input.purpose === "session") {
                const { prepareSessionTransaction } = await import("@/lib/swig/swig-server");
                const { txBase64, sessionKeypairBase64, slot } = await prepareSessionTransaction(
                    walletData.swig_address,
                    walletData.frost_public_key,
                );
                await redis.set(redisKey, { nonces, serverCommitment, txBase64, sessionKeypairBase64, slot, purpose: 'session' }, { ex: 300 });
                return { serverCommitment, txBase64 };
            } else if (input.purpose === "sessionAuthority") {
                // Root-signed add-authority that makes SESSIONS POSSIBLE AT ALL
                // on this Swig. The root is AuthorityType.Ed25519 (not
                // session-based), so CreateSessionV1 throws against it; this
                // adds a second, Ed25519Session authority carrying the same
                // FROST key. Relayed by frostSign's generic tx branch.
                const { prepareAddSessionAuthorityTransaction } = await import("@/lib/swig/swig-server");
                const { txBase64 } = await prepareAddSessionAuthorityTransaction(
                    walletData.swig_address,
                    walletData.frost_public_key,
                );
                await redis.set(redisKey, { nonces, serverCommitment, txBase64, purpose: 'tx' }, { ex: 300 });
                return { serverCommitment, txBase64 };
            } else if (input.purpose === "copyEnable") {
                // Root-signed add-authority granting the copy executor its
                // chain-capped role. Relayed by frostSign's generic tx branch.
                if (!input.dailyUsdcCap) throw new TRPCError({ code: "BAD_REQUEST", message: "dailyUsdcCap required" });
                const { prepareAddCopyAuthorityTransaction } = await import("@/lib/swig/swig-server");
                const { txBase64 } = await prepareAddCopyAuthorityTransaction(
                    walletData.swig_address,
                    walletData.frost_public_key,
                    BigInt(Math.round(input.dailyUsdcCap * 1e6)),
                );
                await redis.set(redisKey, { nonces, serverCommitment, txBase64, purpose: 'tx' }, { ex: 300 });
                return { serverCommitment, txBase64 };
            } else if (input.purpose === "copyUpdateCap") {
                if (!input.dailyUsdcCap) throw new TRPCError({ code: "BAD_REQUEST", message: "dailyUsdcCap required" });
                const { prepareUpdateCopyAuthorityTransaction } = await import("@/lib/swig/swig-server");
                const { txBase64 } = await prepareUpdateCopyAuthorityTransaction(
                    walletData.swig_address,
                    walletData.frost_public_key,
                    BigInt(Math.round(input.dailyUsdcCap * 1e6)),
                );
                await redis.set(redisKey, { nonces, serverCommitment, txBase64, purpose: 'tx' }, { ex: 300 });
                return { serverCommitment, txBase64 };
            } else if (input.purpose === "copyDisable") {
                const { prepareRemoveCopyAuthorityTransaction } = await import("@/lib/swig/swig-server");
                const { txBase64 } = await prepareRemoveCopyAuthorityTransaction(
                    walletData.swig_address,
                    walletData.frost_public_key,
                );
                await redis.set(redisKey, { nonces, serverCommitment, txBase64, purpose: 'tx' }, { ex: 300 });
                return { serverCommitment, txBase64 };
            } else {
                if (!input.rawTransaction) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: "rawTransaction required for purpose=tx" });
                }
                // Wrap the user's instructions in Swig execute instructions so the FROST root
                // authority can sign for them. Treasury pre-signs as fee payer.
                const { prepareSwigExecuteTransaction } = await import("@/lib/swig/swig-server");
                const { txBase64 } = await prepareSwigExecuteTransaction(
                    walletData.swig_address,
                    walletData.frost_public_key,
                    input.rawTransaction,
                );
                await redis.set(redisKey, { nonces, serverCommitment, txBase64, purpose: 'tx' }, { ex: 300 });
                return { serverCommitment, txBase64 };
            }
        }),

    /**
     * FROST Round 2 (sign + aggregate).
     * For session: aggregates FROST signature, adds treasury sig, submits, returns session keys.
     * For tx: aggregates FROST signature, treasury relay, returns tx signature.
     */
    frostSign: protectedProcedure
        .input(z.object({
            signingSessionId: z.string().uuid(),
            clientCommitment: z.object({ identifier: z.string(), hiding: z.string(), binding: z.string() }),
            clientSigShare: z.string(), // base64
            transaction: z.string().optional(), // base64, required for purpose='tx'
        }))
        .mutation(async ({ ctx, input }) => {
            const { data: walletData } = await supabase
                .from("encrypted_wallets")
                .select("passkey_credential_id, salt, key_version, frost_server_share, frost_server_share_iv, frost_public_key, frost_public_info, swig_address")
                .eq("user_id", ctx.user.id)
                .single();

            if (!walletData?.frost_server_share) throw new TRPCError({ code: "NOT_FOUND", message: "FROST not initialized" });

            const { Redis } = await import("@upstash/redis");
            const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! });

            const redisKey = `frost:round1:${ctx.user.id}:${input.signingSessionId}`;
            const stored = await redis.get<any>(redisKey);
            if (!stored) throw new TRPCError({ code: "NOT_FOUND", message: "Signing session expired" });
            await redis.del(redisKey);

            const { nonces, serverCommitment, txBase64, sessionKeypairBase64, slot, purpose: storedPurpose } = stored;

            // Decrypt server share
            const salt = Buffer.from(walletData.salt, "base64");
            const decKey = await deriveWalletKey(
                walletData.passkey_credential_id || `social-${ctx.user.id}`,
                salt,
                walletData.key_version ?? 1,
                ["decrypt"]
            );
            const shareBytes = await subtle!.decrypt(
                { name: "AES-GCM", iv: Buffer.from(walletData.frost_server_share_iv, "base64") as any },
                decKey,
                Buffer.from(walletData.frost_server_share, "base64") as any
            );
            const serverShare = JSON.parse(Buffer.from(shareBytes).toString());
            const publicInfo = JSON.parse(walletData.frost_public_info);

            const { serverSignAndAggregate, extractMessageBytes, insertFrostSignature } = await import("@/lib/frost/frost-server");

            const isSession = storedPurpose === 'session';
            const txToSign = txBase64; // always from server (Swig-wrapped for tx, session tx for session)
            if (!txToSign) throw new TRPCError({ code: "BAD_REQUEST", message: "Transaction missing from signing session" });

            const msgBytes = await extractMessageBytes(txToSign);
            const frostSig = serverSignAndAggregate(
                serverShare, publicInfo, nonces,
                input.clientCommitment, serverCommitment,
                input.clientSigShare, msgBytes,
            );

            const signedTx = await insertFrostSignature(txToSign, walletData.frost_public_key, frostSig);

            if (isSession) {
                const { submitSessionTransaction } = await import("@/lib/swig/swig-server");
                const sessionInfo = await submitSessionTransaction(signedTx, sessionKeypairBase64, slot);
                return { type: "session" as const, swigAddress: walletData.swig_address, ...sessionInfo };
            } else {
                // Treasury relay or Swig paymaster (if SWIG_API_KEY is set)
                const paymasterApiKey = process.env.SWIG_API_KEY;
                const paymasterPubkey = process.env.SWIG_PAYMASTER_PUBKEY;
                const txBytes = Buffer.from(signedTx, "base64");
                let sig: string;

                if (paymasterApiKey && paymasterPubkey) {
                    const { createPaymasterClient } = await import("@swig-wallet/paymaster-classic");
                    const paymaster = createPaymasterClient({
                        apiKey: paymasterApiKey,
                        paymasterPubkey,
                        baseUrl: "https://api.onswig.com",
                        network: (process.env.NEXT_PUBLIC_SOLANA_NETWORK as "mainnet" | "devnet") ?? "mainnet",
                    });
                    sig = await paymaster.signAndSendSerializedTransaction(txBytes);
                } else {
                    const { Keypair: KP, Transaction: Tx } = await import("@solana/web3.js");
                    const treasuryKey = process.env.SWIG_TREASURY_PRIVATE_KEY!;
                    const treasury = KP.fromSecretKey(Buffer.from(treasuryKey, "base64"));
                    const tx = Tx.from(txBytes);
                    tx.partialSign(treasury);
                    const conn = await serverConnection();
                    sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 0 });
                }
                // Balances changed — drop the SWR'd assets snapshot.
                if (ctx.user.wallet_address) invalidateWalletAssets(ctx.user.wallet_address);
                return { type: "tx" as const, signature: sig };
            }
        }),

    /**
     * Relay a Swig session-signed transaction.
     *
     * The client builds + partially signs the transaction with its session key.
     * This endpoint adds the treasury signature as fee payer and submits to
     * Helius. Users pay ZERO gas — the treasury covers all fees (~$0.0005/tx).
     *
     * If the Swig paymaster is configured it's used instead (Swig PRO plan).
     */
    relaySwigTransaction: protectedProcedure
        .input(z.object({ transaction: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const headersList = await headers();
            const ipAddress = headersList.get("x-forwarded-for") || "unknown";
            const userAgent = headersList.get("user-agent") || "unknown";

            // Verify this user actually has a Swig wallet
            const { data: walletData } = await supabase
                .from("encrypted_wallets")
                .select("swig_address")
                .eq("user_id", ctx.user.id)
                .single();

            if (!walletData?.swig_address) {
                throw new TRPCError({ code: "NOT_FOUND", message: "No Swig wallet found" });
            }

            const txBytes = Buffer.from(input.transaction, "base64");

            try {
                const connection = await serverConnection();
                let signature: string;

                const paymasterApiKey = process.env.SWIG_API_KEY;
                const paymasterPubkey = process.env.SWIG_PAYMASTER_PUBKEY;

                if (paymasterApiKey && paymasterPubkey) {
                    // Swig hosted paymaster path
                    const { createPaymasterClient } = await import("@swig-wallet/paymaster-classic");
                    const paymaster = createPaymasterClient({
                        apiKey: paymasterApiKey,
                        paymasterPubkey,
                        baseUrl: "https://api.onswig.com",
                        network: (process.env.NEXT_PUBLIC_SOLANA_NETWORK as "mainnet" | "devnet") ?? "mainnet",
                    });
                    signature = await paymaster.signAndSendSerializedTransaction(txBytes);
                } else {
                    // Treasury fee-payer path — free, fully on-chain
                    const treasuryKey = process.env.SWIG_TREASURY_PRIVATE_KEY;
                    if (!treasuryKey) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No fee payer configured" });

                    const { Keypair, Transaction } = await web3();
                    const treasury = Keypair.fromSecretKey(Buffer.from(treasuryKey, "base64"));
                    const tx = Transaction.from(txBytes);
                    tx.partialSign(treasury);

                    signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
                    await connection.confirmTransaction(signature, "confirmed");
                }

                await logWalletAccess({ userId: ctx.user.id, action: "sign_transaction", ipAddress, userAgent, success: true });
                // Balances changed — drop the SWR'd assets snapshot.
                if (ctx.user.wallet_address) invalidateWalletAssets(ctx.user.wallet_address);
                return { success: true, signature };
            } catch (error) {
                await logWalletAccess({
                    userId: ctx.user.id, action: "sign_transaction", ipAddress, userAgent,
                    success: false, errorMessage: error instanceof Error ? error.message : "Unknown",
                });
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: error instanceof Error ? error.message : "Failed to relay transaction",
                });
            }
        }),

    /**
     * Export private key for the user's wallet
     * Rate limited to 3 times per hour
     */
    exportKey: protectedProcedure.mutation(async ({ ctx }) => {
        const headersList = await headers();
        const ipAddress =
            headersList.get("x-forwarded-for") ||
            headersList.get("x-real-ip") ||
            "unknown";
        const userAgent = headersList.get("user-agent") || "unknown";

        // Check rate limit (stricter for private key export)
        if (await checkRateLimit(ctx.user.id, "export_key")) {
            const resetTime = await getResetTime(ctx.user.id, "export_key");
            await logWalletAccess({
                userId: ctx.user.id,
                action: "export_key",
                ipAddress,
                userAgent,
                success: false,
                errorMessage: "Rate limit exceeded",
            });

            throw new TRPCError({
                code: "TOO_MANY_REQUESTS",
                message: `Rate limit exceeded. You can only export your private key 3 times per hour. Please try again in ${Math.ceil(resetTime / 60)} minutes.`,
            });
        }

        // Check if user has a wallet
        if (!ctx.user.wallet_address) {
            throw new TRPCError({
                code: "NOT_FOUND",
                message: "No wallet found",
            });
        }

        try {
            console.log(`🔓 Exporting private key for user: ${ctx.user.id.slice(0, 8)}...`);

            // Retrieve encrypted wallet from Supabase
            const { data: walletData, error: fetchError } = await supabase
                .from("encrypted_wallets")
                .select("*")
                .eq("user_id", ctx.user.id)
                .single();

            if (fetchError || !walletData) {
                console.error("Failed to fetch wallet:", fetchError);
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Wallet not found",
                });
            }

            const privateKeyBytes = await decryptWalletKey(walletData, ctx.user.id);

            // Convert to base58 for display
            const bs58 = await import("bs58");
            const privateKeyBase58 = bs58.default.encode(privateKeyBytes);

            console.log(`✅ Private key exported for user: ${ctx.user.id.slice(0, 8)}...`);

            // Log successful export
            await logWalletAccess({
                userId: ctx.user.id,
                action: "export_key",
                ipAddress,
                userAgent,
                success: true,
            });

            return {
                success: true,
                privateKey: privateKeyBase58,
                address: walletData.address,
            };
        } catch (error) {
            console.error("❌ Failed to export private key:", error);

            // Log failed attempt
            await logWalletAccess({
                userId: ctx.user.id,
                action: "export_key",
                ipAddress,
                userAgent,
                success: false,
                errorMessage: error instanceof Error ? error.message : "Unknown error",
            });

            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error instanceof Error ? error.message : "Internal server error",
            });
        }
    }),

    /**
     * Store the client's PRF-encrypted d2 backup for device recovery.
     * Only the client can decrypt this (requires passkey PRF output).
     */
    storeD2Backup: protectedProcedure
        .input(z.object({
            encryptedD2: z.string(), // base64 AES-GCM ciphertext
            d2Iv: z.string(),        // base64 IV
        }))
        .mutation(async ({ ctx, input }) => {
            if (!ctx.user.wallet_address) {
                throw new TRPCError({ code: "NOT_FOUND", message: "No wallet found" });
            }

            const { error } = await supabase
                .from("encrypted_wallets")
                .update({
                    encrypted_d2_backup: input.encryptedD2,
                    d2_backup_iv: input.d2Iv,
                    updated_at: new Date().toISOString(),
                })
                .eq("user_id", ctx.user.id);

            if (error) {
                throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
            }

            return { success: true };
        }),

    /**
     * Return the encrypted d1 share to the authenticated client.
     * Used in Phase 4 client-side signing: client fetches d1, combines with
     * local d2, reconstructs the private key in the browser.
     */
    getEncryptedShare: protectedProcedure.query(async ({ ctx }) => {
        if (!ctx.user.wallet_address) {
            throw new TRPCError({ code: "NOT_FOUND", message: "No wallet found" });
        }

        const { data, error } = await supabase
            .from("encrypted_wallets")
            .select("encrypted_d1, encrypted_d1_iv, salt, key_version, address, encrypted_d2_backup, d2_backup_iv")
            .eq("user_id", ctx.user.id)
            .single();

        if (error || !data) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Wallet not found" });
        }

        if (!data.encrypted_d1) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Wallet not yet split — create a new wallet to enable this feature" });
        }

        return {
            encryptedD1: data.encrypted_d1,
            d1Iv: data.encrypted_d1_iv,
            salt: data.salt,
            keyVersion: data.key_version,
            address: data.address,
            encryptedD2Backup: data.encrypted_d2_backup,
            d2BackupIv: data.d2_backup_iv,
        };
    }),

    /**
     * Phase 4: Decrypt d1 share and return it to the authenticated client.
     * The client combines d1 with d2 (from IndexedDB) to reconstruct the
     * private key entirely in the browser — the server never signs.
     * Falls back gracefully: throws NOT_FOUND "Wallet not split" for old wallets,
     * so callers can fall back to signAndSendTransaction.
     */
    getDecryptedShare: protectedProcedure.mutation(async ({ ctx }) => {
        const headersList = await headers();
        const ipAddress = headersList.get("x-forwarded-for") || headersList.get("x-real-ip") || "unknown";
        const userAgent = headersList.get("user-agent") || "unknown";

        if (!ctx.user.wallet_address) {
            throw new TRPCError({ code: "NOT_FOUND", message: "No wallet found" });
        }

        if (await checkRateLimit(ctx.user.id, "sign_transaction")) {
            const resetTime = await getResetTime(ctx.user.id, "sign_transaction");
            throw new TRPCError({
                code: "TOO_MANY_REQUESTS",
                message: `Rate limit exceeded. Try again in ${Math.ceil(resetTime / 60)} minutes.`,
            });
        }

        const { data: walletData, error: fetchError } = await supabase
            .from("encrypted_wallets")
            .select("encrypted_d1, encrypted_d1_iv, salt, passkey_credential_id, key_version")
            .eq("user_id", ctx.user.id)
            .single();

        if (fetchError || !walletData) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Wallet not found" });
        }

        if (!walletData.encrypted_d1 || !walletData.encrypted_d1_iv) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Wallet not split" });
        }

        if (!subtle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Crypto unavailable" });

        const salt = Buffer.from(walletData.salt, "base64");
        const decryptionKey = await deriveWalletKey(
            walletData.passkey_credential_id,
            salt,
            walletData.key_version,
            ["decrypt"]
        );

        const d1 = await subtle.decrypt(
            { name: "AES-GCM", iv: Buffer.from(walletData.encrypted_d1_iv, "base64") as any },
            decryptionKey,
            Buffer.from(walletData.encrypted_d1, "base64") as any
        );

        await logWalletAccess({ userId: ctx.user.id, action: "sign_transaction", ipAddress, userAgent, success: true });

        return { d1: Buffer.from(d1).toString("base64") };
    }),

    /**
     * Phase 4: Submit a pre-signed transaction to Helius.
     * No decryption — the client signed it. Server is a pure relay + audit log.
     */
    submitSignedTransaction: protectedProcedure
        .input(z.object({ transaction: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const headersList = await headers();
            const ipAddress = headersList.get("x-forwarded-for") || headersList.get("x-real-ip") || "unknown";
            const userAgent = headersList.get("user-agent") || "unknown";

            if (!ctx.user.wallet_address) {
                throw new TRPCError({ code: "NOT_FOUND", message: "No wallet found" });
            }

            try {
                const connection = await serverConnection();
                const signature = await connection.sendRawTransaction(
                    Buffer.from(input.transaction, "base64"),
                    { skipPreflight: true, maxRetries: 0 }
                );

                await logWalletAccess({ userId: ctx.user.id, action: "sign_transaction", ipAddress, userAgent, success: true });
                // Balances changed — drop the SWR'd assets snapshot.
                invalidateWalletAssets(ctx.user.wallet_address);
                return { success: true, signature };
            } catch (error) {
                await logWalletAccess({
                    userId: ctx.user.id, action: "sign_transaction", ipAddress, userAgent,
                    success: false, errorMessage: error instanceof Error ? error.message : "Unknown error",
                });
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: error instanceof Error ? error.message : "Failed to submit transaction",
                });
            }
        }),

    /**
     * Sign and send a transaction using the user's custodial wallet
     */
    signAndSendTransaction: protectedProcedure
        .input(z.object({
            transaction: z.string(), // base64 encoded partial transaction
        }))
        .mutation(async ({ ctx, input }) => {
            const headersList = await headers();
            const ipAddress =
                headersList.get("x-forwarded-for") ||
                headersList.get("x-real-ip") ||
                "unknown";
            const userAgent = headersList.get("user-agent") || "unknown";

            if (!ctx.user.wallet_address) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "No wallet found",
                });
            }

            try {
                // Decrypt private key
                const { data: walletData, error: fetchError } = await supabase
                    .from("encrypted_wallets")
                    .select("*")
                    .eq("user_id", ctx.user.id)
                    .single();

                if (fetchError || !walletData) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Wallet not found",
                    });
                }

                const { Keypair, Transaction, VersionedTransaction } = await web3();
                const privateKeyBytes = await decryptWalletKey(walletData, ctx.user.id);
                const keypair = Keypair.fromSecretKey(privateKeyBytes);

                // Deserialize and Sign
                const txBuffer = Buffer.from(input.transaction, "base64");
                let rawTransaction: Uint8Array;

                const connection = await serverConnection();

                // Tier 3 only handles v1 custodial wallets where the custodial keypair IS
                // the fee payer / from-pubkey. For Swig wallets (v2) the first signer is
                // the Swig PDA — check BEFORE the inner try-catch so the error isn't
                // silently swallowed by the VersionedTransaction fallback.
                const firstSigner = Transaction.from(txBuffer).signatures[0]?.publicKey;
                if (firstSigner && !firstSigner.equals(keypair.publicKey)) {
                    throw new Error("Swig wallet transactions require a session or FROST signing path — please retry (Tier 1/2 both failed)");
                }

                try {
                    // Try parsing as legacy transaction
                    const transaction = Transaction.from(txBuffer);
                    // Always refresh the blockhash server-side — the client-provided one
                    // may have expired if Swig/FROST session creation ran first.
                    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
                    transaction.recentBlockhash = blockhash;
                    transaction.lastValidBlockHeight = lastValidBlockHeight;
                    transaction.feePayer = keypair.publicKey;
                    transaction.partialSign(keypair);
                    rawTransaction = transaction.serialize();
                } catch {
                    // Fallback to VersionedTransaction for Jupiter Swaps
                    const transaction = VersionedTransaction.deserialize(txBuffer);
                    transaction.sign([keypair]);
                    rawTransaction = transaction.serialize();
                }

                // Send via Helius staked connection. maxRetries: 0 is intentional —
                // Helius handles retries on their end; setting >0 causes duplicate sends.
                const signature = await connection.sendRawTransaction(rawTransaction, {
                    skipPreflight: true,
                    maxRetries: 0,
                });

                // Log success
                await logWalletAccess({
                    userId: ctx.user.id,
                    action: "sign_transaction",
                    ipAddress,
                    userAgent,
                    success: true,
                });

                // The tx changes balances — drop the SWR'd assets snapshot so
                // the next fetch reflects it instead of serving stale.
                invalidateWalletAssets(ctx.user.wallet_address);
                return { success: true, signature };
            } catch (error) {
                console.error("Failed to sign and send transaction:", error);

                await logWalletAccess({
                    userId: ctx.user.id,
                    action: "export_key" as any,
                    ipAddress,
                    userAgent,
                    success: false,
                    errorMessage: error instanceof Error ? error.message : "Unknown error",
                });

                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: error instanceof Error ? `Failed to sign and submit transaction: ${error.message}` : "Failed to sign and submit transaction",
                });
            }
        }),

    /**
     * Reveal recovery phrase for the user's wallet
     * Rate limited
     */
    revealPhrase: protectedProcedure.mutation(async ({ ctx }) => {
        const headersList = await headers();
        const ipAddress =
            headersList.get("x-forwarded-for") ||
            headersList.get("x-real-ip") ||
            "unknown";
        const userAgent = headersList.get("user-agent") || "unknown";

        // Check rate limit
        if (await checkRateLimit(ctx.user.id, "reveal_phrase")) {
            const resetTime = await getResetTime(ctx.user.id, "reveal_phrase");
            await logWalletAccess({
                userId: ctx.user.id,
                action: "reveal_phrase",
                ipAddress,
                userAgent,
                success: false,
                errorMessage: "Rate limit exceeded",
            });

            throw new TRPCError({
                code: "TOO_MANY_REQUESTS",
                message: `Rate limit exceeded. Please try again in ${Math.ceil(resetTime / 60)} minutes.`,
            });
        }

        // Check if user has a wallet
        if (!ctx.user.wallet_address) {
            throw new TRPCError({
                code: "NOT_FOUND",
                message: "No wallet found",
            });
        }

        try {
            console.log(
                `🔓 Revealing recovery phrase for user: ${ctx.user.id.slice(0, 8)}...`
            );

            // Retrieve encrypted wallet from Supabase
            const { data: walletData, error: fetchError } = await supabase
                .from("encrypted_wallets")
                .select("*")
                .eq("user_id", ctx.user.id)
                .single();

            if (fetchError || !walletData) {
                console.error("Failed to fetch wallet:", fetchError);
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Wallet not found",
                });
            }

            // Check if wallet has encrypted mnemonic (new wallets only)
            if (!walletData.encrypted_mnemonic || !walletData.mnemonic_iv) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message:
                        "Recovery phrase not available. This wallet was created before recovery phrase storage was implemented.",
                });
            }

            // Decrypt mnemonic
            if (!subtle) {
                throw new Error("Web Crypto API not available");
            }

            // Must go through deriveWalletKey: v2 wallets are encrypted with
            // WALLET_MASTER_KEY prepended to the credential. Deriving from the
            // credential alone (as this did) produces a different key, so the
            // decrypt below always threw and the phrase could never be revealed.
            const encryptionKeySource =
                walletData.passkey_credential_id || `social-${ctx.user.id}`;
            const salt = Buffer.from(walletData.salt, "base64");
            const encryptionKey = await deriveWalletKey(
                encryptionKeySource,
                salt,
                walletData.key_version ?? 1,
                ["decrypt"]
            );

            const mnemonicIv = Buffer.from(walletData.mnemonic_iv, "base64");
            const encryptedMnemonic = Buffer.from(
                walletData.encrypted_mnemonic,
                "base64"
            );

            const decrypted = await subtle.decrypt(
                {
                    name: "AES-GCM",
                    iv: mnemonicIv as any,
                },
                encryptionKey,
                encryptedMnemonic as any
            );

            const mnemonic = Buffer.from(decrypted).toString("utf-8");

            console.log(
                `✅ Recovery phrase revealed for user: ${ctx.user.id.slice(0, 8)}...`
            );

            // Log successful access
            await logWalletAccess({
                userId: ctx.user.id,
                action: "reveal_phrase",
                ipAddress,
                userAgent,
                success: true,
            });

            return {
                success: true,
                mnemonic,
            };
        } catch (error) {
            console.error("❌ Failed to reveal recovery phrase:", error);

            // Log failed attempt
            await logWalletAccess({
                userId: ctx.user.id,
                action: "reveal_phrase",
                ipAddress,
                userAgent,
                success: false,
                errorMessage: error instanceof Error ? error.message : "Unknown error",
            });

            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error instanceof Error ? error.message : "Internal server error",
            });
        }
    }),

    /**
     * Proxies verified Solana tokens via Helius DAS to bypass browser extension blockers.
     * Falls back to a static list so the swap view always has tokens.
     */
    getTokens: publicProcedure.query(async () => {
        const POPULAR_MINTS = [
            "So11111111111111111111111111111111111111112", // SOL (wSOL)
            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
            "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
            "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh", // WBTC
            "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",  // JUP
            "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // BONK
            "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs", // ETH (Wormhole)
            "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",  // mSOL
            "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1",  // bSOL
            "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3", // PYTH
            "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", // RAY
            "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",  // ORCA
        ];

        const STATIC_FALLBACK = [
            { address: "So11111111111111111111111111111111111111112", symbol: "SOL",  name: "Solana",         decimals: 9,  logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png" },
            { address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", name: "USD Coin",       decimals: 6,  logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png" },
            { address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", symbol: "USDT", name: "Tether USD",      decimals: 6,  logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg" },
            { address: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh", symbol: "WBTC", name: "Wrapped Bitcoin",  decimals: 8,  logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh/logo.png" },
            { address: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",  symbol: "JUP",  name: "Jupiter",          decimals: 6,  logoURI: "https://static.jup.ag/jup/icon.png" },
            { address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", symbol: "BONK", name: "Bonk",             decimals: 5,  logoURI: "https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I" },
            { address: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs", symbol: "WETH", name: "Wrapped Ether",    decimals: 8,  logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs/logo.png" },
            { address: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",  symbol: "mSOL", name: "Marinade SOL",    decimals: 9,  logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png" },
            { address: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", symbol: "RAY",  name: "Raydium",          decimals: 6,  logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png" },
            { address: "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",  symbol: "ORCA", name: "Orca",             decimals: 6,  logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE/logo.png" },
            { address: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3", symbol: "PYTH", name: "Pyth Network",    decimals: 6,  logoURI: "https://pyth.network/token.svg" },
            { address: "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1",  symbol: "bSOL", name: "BlazeStake SOL",  decimals: 9,  logoURI: "https://stake.solblaze.org/assets/bsol.png" },
        ];

        return withCache("helius:tokens:popular", TTL.TOKEN_METADATA, async () => {
            try {
                const heliusKey = process.env.HELIUS_API_KEY;
                const url = `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;
                const res = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ jsonrpc: "2.0", id: "getTokens", method: "getAssetBatch", params: { ids: POPULAR_MINTS } }),
                    signal: AbortSignal.timeout(10000),
                });
                if (!res.ok) throw new Error("Helius getAssetBatch failed");
                const json = await res.json();
                const results = (json.result || []).map((asset: any) => normalizeSwapToken(asset));
                return results.length > 0 ? results : STATIC_FALLBACK;
            } catch (error) {
                console.error("Failed to fetch tokens from Helius, using fallback:", error);
                return STATIC_FALLBACK;
            }
        });
    }),

    searchTokens: publicProcedure
        .input(z.object({ query: z.string() }))
        .query(async ({ input }) => {
            const q = input.query.trim();
            if (!q) return [];
            return withCache(`dexscreener:search:${q.toLowerCase()}`, TTL.TOKEN_SEARCH, async () => {
            try {
                const res = await fetch(
                    `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`,
                    { signal: AbortSignal.timeout(8000) }
                );
                if (!res.ok) throw new Error("DexScreener search failed");
                const json = await res.json();

                const seen = new Set<string>();
                const tokens: { address: string; symbol: string; name: string; decimals: number; logoURI?: string }[] = [];

                for (const pair of (json.pairs || [])) {
                    if (pair.chainId !== "solana") continue;

                    for (const side of ["baseToken", "quoteToken"] as const) {
                        const t = pair[side];
                        if (!t?.address || seen.has(t.address)) continue;
                        // Skip stablecoins/SOL as quote — they pollute results when searching other tokens
                        const qLower = q.toLowerCase();
                        const matchesSymbol = t.symbol?.toLowerCase().includes(qLower);
                        const matchesName   = t.name?.toLowerCase().includes(qLower);
                        const matchesAddr   = t.address.toLowerCase() === qLower;
                        if (!matchesSymbol && !matchesName && !matchesAddr) continue;
                        seen.add(t.address);
                        tokens.push({
                            address: t.address,
                            symbol: t.address === SOL_WSOL_MINT ? "SOL" : (t.symbol || "UNKNOWN"),
                            name:   t.address === SOL_WSOL_MINT ? "Solana" : (t.name || t.symbol || "Unknown Coin"),
                            decimals: 9,
                            logoURI: pair.info?.imageUrl || undefined,
                        });
                        if (tokens.length >= 30) break;
                    }
                    if (tokens.length >= 30) break;
                }

                return tokens;
            } catch (error) {
                console.error("Failed to search tokens via DexScreener:", error);
                return [];
            }
            });
        }),

    /**
     * Resolves metadata specifically for a given array of token IDs using Helius on-chain data
     */
    getTokensByMints: protectedProcedure
        .input(z.object({
            ids: z.array(z.string())
        }))
        .query(async ({ input }) => {
            if (input.ids.length === 0) return {};

            // Check cache per-mint, only fetch uncached ones
            const result: Record<string, any> = {};
            const uncached: string[] = [];

            await Promise.all(input.ids.slice(0, 1000).map(async (id) => {
                const { redis } = await import("@/lib/cache");
                const cached = await redis.get<any>(`helius:token:${id}`).catch(() => null);
                if (cached) result[id] = cached;
                else uncached.push(id);
            }));

            if (uncached.length === 0) return result;

            try {
                // Always use mainnet — token icons are mainnet assets
                const heliusKey = process.env.HELIUS_API_KEY;
                const url = `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: 'my-id',
                        method: 'getAssetBatch',
                        params: { ids: uncached }
                    })
                });

                if (!response.ok) throw new Error("Failed to fetch custom tokens from Helius");
                const json = await response.json();

                const { redis } = await import("@/lib/cache");
                if (json.result) {
                    await Promise.all(json.result.map(async (asset: any) => {
                        if (asset && asset.id) {
                            const meta = {
                                symbol: asset.token_info?.symbol || asset.content?.metadata?.symbol || "UNKNOWN",
                                name: asset.content?.metadata?.name || "Unknown Coin",
                                logoURI: asset.content?.links?.image || asset.content?.files?.[0]?.uri || null,
                                decimals: asset.token_info?.decimals,
                            };
                            result[asset.id] = meta;
                            await redis.set(`helius:token:${asset.id}`, meta, { ex: TTL.TOKEN_METADATA }).catch(() => {});
                        }
                    }));
                }

                return result;
            } catch (error) {
                console.error("Failed to fetch token metadata:", error);
                throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch coin metadata" });
            }
        }),

    getQuote: protectedProcedure
        .input(z.object({
            inputMint: z.string(),
            outputMint: z.string(),
            amount: z.number(),
            slippageBps: z.number().default(50)
        }))
        .mutation(async ({ input }) => {
            const feeBps = process.env.JUPITER_PLATFORM_FEE_BPS ?? String(PLATFORM_FEE_BPS);
            // Input side first, so a buy pays its fee in SOL/USDC rather than in
            // the coin; skipped when neither side has an account, because
            // Jupiter would build a transaction that reverts on-chain. Both
            // rules and their measurements: lib/jupiter/referral-fee.ts.
            const feeAccount = await resolveFeeAccount(input.inputMint, input.outputMint);
            const feeParam = feeAccount ? `&platformFeeBps=${feeBps}` : '';
            const qs = `inputMint=${input.inputMint}&outputMint=${input.outputMint}&amount=${input.amount}&slippageBps=${input.slippageBps}${feeParam}`;
            // Try primary then lite fallback — both are official Jupiter endpoints
            const endpoints = [
                `https://quote-api.jup.ag/v6/quote?${qs}`,
                `https://lite-api.jup.ag/swap/v1/quote?${qs}`,
            ];
            const headers = {
                "User-Agent": "Mozilla/5.0 (compatible; SidebarApp/1.0)",
                "Accept": "application/json",
            };

            let lastError: unknown;
            for (const url of endpoints) {
                try {
                    const response = await fetch(url, { headers });
                    if (!response.ok) {
                        const text = await response.text();
                        throw new Error(`Jupiter quote HTTP ${response.status}: ${text}`);
                    }
                    // Carry the account forward: the swap must not re-resolve it.
                    return { ...(await response.json()), platformFeeAccount: feeAccount ?? undefined };
                } catch (err) {
                    console.warn(`Jupiter quote attempt failed for ${url}:`, err);
                    lastError = err;
                }
            }

            console.error("All Jupiter quote endpoints failed:", lastError);
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch quote — Jupiter API unreachable" });
        }),

    getSwapTransaction: protectedProcedure
        .input(z.object({
            quoteResponse: z.any(),
            userPublicKey: z.string(),
            wrapAndUnwrapSol: z.boolean().default(true)
        }))
        .mutation(async ({ ctx, input }) => {
            const feeAccount = await feeAccountForSwap(input.quoteResponse);

            const body = JSON.stringify({
                quoteResponse: input.quoteResponse,
                userPublicKey: input.userPublicKey,
                wrapAndUnwrapSol: input.wrapAndUnwrapSol,
                ...(feeAccount && { feeAccount }),
            });
            const headers = {
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (compatible; SidebarApp/1.0)",
                "Accept": "application/json",
            };
            const endpoints = [
                "https://quote-api.jup.ag/v6/swap",
                "https://lite-api.jup.ag/swap/v1/swap",
            ];

            let lastError: unknown;
            for (const url of endpoints) {
                try {
                    const response = await fetch(url, { method: "POST", headers, body });
                    if (!response.ok) {
                        const text = await response.text();
                        throw new Error(`Jupiter swap HTTP ${response.status}: ${text}`);
                    }
                    const json = await response.json();

                    // Server-witnessed trade record (docs/exp-callouts.md §4a): the
                    // server knows the user, mints, and quoted amounts here — insert a
                    // pending row now; the client reports the signature after send and
                    // the trade-verify cron confirms on-chain. Never blocks the swap.
                    let tradeId: string | undefined;
                    try {
                        const q = input.quoteResponse ?? {};
                        tradeId = nanoid();
                        await db.insert(trades).values({
                            id: tradeId,
                            userId: ctx.user.id,
                            walletAddress: input.userPublicKey,
                            inputMint: String(q.inputMint ?? ""),
                            outputMint: String(q.outputMint ?? ""),
                            inAmountRaw: String(q.inAmount ?? "0"),
                            outAmountRaw: String(q.outAmount ?? "0"),
                            usdValue: Number(q.swapUsdValue) || null,
                        });
                    } catch {
                        tradeId = undefined;
                    }
                    return { ...json, tradeId };
                } catch (err) {
                    console.warn(`Jupiter swap attempt failed for ${url}:`, err);
                    lastError = err;
                }
            }

            console.error("All Jupiter swap endpoints failed:", lastError);
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch swap transaction — Jupiter API unreachable" });
        }),

    /**
     * Client best-effort callback after sending a swap: attach the signature
     * to the pending trade so the trade-verify cron can confirm it on-chain.
     * Amounts stay server-witnessed — this only ever sets the signature.
     */
    reportSwapSignature: protectedProcedure
        .input(z.object({ tradeId: z.string(), signature: z.string() }))
        .mutation(async ({ ctx, input }) => {
            try {
                await db
                    .update(trades)
                    .set({ txSignature: input.signature })
                    .where(and(
                        eq(trades.id, input.tradeId),
                        eq(trades.userId, ctx.user.id),
                        eq(trades.status, "pending"),
                        isNull(trades.txSignature),
                    ));
            } catch { /* duplicate signature or race — the cron reconciles */ }
            return { ok: true };
        }),

    getTokenInfo: protectedProcedure
        .input(z.object({ mint: z.string() }))
        .query(async ({ input }) => {
            const SOL_MINT_EXTERNAL = "So11111111111111111111111111111111111111112"; // Wrapped SOL for APIs
            const SOL_MINT_INTERNAL = "So11111111111111111111111111111111111111111"; // Internal identifier
            const effectiveMint = input.mint === SOL_MINT_INTERNAL ? SOL_MINT_EXTERNAL : input.mint;
            
            return withCache(`token:info:${effectiveMint}`, TTL.TOKEN_INFO, async () => {
            let description: string | undefined;
            let marketCap: number | undefined;
            let fdv: number | undefined;
            const links: Array<{ type: string; label?: string; url: string }> = [];

            // 1. Helius DAS — on-chain metadata (description + external_url)
            try {
                const heliusKey = process.env.HELIUS_API_KEY;
                const url = `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;
                const res = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        id: "tokenInfo",
                        method: "getAsset",
                        params: { id: effectiveMint },
                    }),
                });
                if (res.ok) {
                    const json = await res.json();
                    const asset = json.result;
                    if (asset) {
                        description = asset.content?.metadata?.description || undefined;
                        const externalUrl = asset.content?.links?.external_url;
                        if (externalUrl) links.push({ type: "website", label: "Website", url: externalUrl });
                    }
                }
            } catch {
                // ignore, fallback to CoinGecko
            }

            // 2. CoinGecko for description, social links, and market data (market cap / FDV)
            try {
                const cgUrl = effectiveMint === SOL_MINT_EXTERNAL
                    ? "https://api.coingecko.com/api/v3/coins/solana?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false"
                    : `https://api.coingecko.com/api/v3/coins/solana/contract/${effectiveMint}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`;

                const cgRes = await fetch(cgUrl, { headers: { "Accept": "application/json" } });
                if (cgRes.ok) {
                    const cg = await cgRes.json();
                    if (!description && cg.description?.en) description = cg.description.en;
                    if (cg.market_data?.market_cap?.usd) marketCap = Number(cg.market_data.market_cap.usd);
                    if (cg.market_data?.fully_diluted_valuation?.usd) fdv = Number(cg.market_data.fully_diluted_valuation.usd);
                    if (cg.links?.homepage?.[0] && !links.find(l => l.type === "website")) {
                        links.push({ type: "website", label: "Website", url: cg.links.homepage[0] });
                    }
                    if (cg.links?.twitter_screen_name) links.push({ type: "twitter", url: `https://twitter.com/${cg.links.twitter_screen_name}` });
                    if (cg.links?.telegram_channel_identifier) links.push({ type: "telegram", url: `https://t.me/${cg.links.telegram_channel_identifier}` });
                    if (cg.links?.subreddit_url && cg.links.subreddit_url !== "https://www.reddit.com/r/") links.push({ type: "reddit", url: cg.links.subreddit_url });
                    if (cg.links?.discord_url) links.push({ type: "discord", url: cg.links.discord_url });
                }
            } catch {
                // ignore
            }

            return { description, links, marketCap, fdv };
            });
        }),

    getPrices: protectedProcedure
        .input(z.object({
            ids: z.array(z.string())
        }))
        .query(async ({ input }) => {
            try {
                if (input.ids.length === 0) return { data: {} };

                const SOL_MINT_INTERNAL = "So11111111111111111111111111111111111111111";
                const SOL_MINT_EXTERNAL = "So11111111111111111111111111111111111111112";
                
                // Map internal to external for lookup
                const uniqueIds = [...new Set(input.ids)].map(id => id === SOL_MINT_INTERNAL ? SOL_MINT_EXTERNAL : id);
                const data: Record<string, { price: number; priceChange24h?: number; name?: string; symbol?: string; logoURI?: string; marketCap?: number; fdv?: number; description?: string; links?: Array<{ type: string; label?: string; url: string }> }> = {};

                // DexScreener price API max limit is 30 pairs per request, chunk it
                for (let i = 0; i < uniqueIds.length; i += 30) {
                    const chunk = uniqueIds.slice(i, i + 30);
                    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${chunk.join(',')}`);

                    if (!response.ok) {
                        console.warn("DexScreener chunk fetch failed:", response.status);
                        continue;
                    }

                    const json = await response.json();

                    if (json.pairs) {
                        for (const id of chunk) {
                            if (data[id]) continue;

                            const idLower = id.toLowerCase();
                            const pairsForId: any[] = (json.pairs || [])
                                .filter((p: any) => 
                                    p.baseToken?.address?.toLowerCase() === idLower || 
                                    p.quoteToken?.address?.toLowerCase() === idLower
                                )
                                .sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));

                            if (pairsForId.length === 0) continue;

                            const pairAsBase = pairsForId.find((p: any) => p.baseToken?.address?.toLowerCase() === idLower && p.priceUsd);
                            const pairAsQuote = pairsForId.find((p: any) => p.quoteToken?.address?.toLowerCase() === idLower && p.priceUsd && p.priceNative);

                            // Info (websites/socials) may live on a different pair than the one used for price
                            const pairWithInfo = pairsForId.find((p: any) =>
                                p.info?.websites?.length > 0 || p.info?.socials?.length > 0 || p.info?.description
                            );

                            let priceUsd = 0;
                            let metadata = undefined;

                            if (pairAsBase) {
                                priceUsd = Number(pairAsBase.priceUsd);
                                metadata = {
                                    name: pairAsBase.baseToken?.name,
                                    symbol: pairAsBase.baseToken?.symbol,
                                    logoURI: pairAsBase.info?.imageUrl || pairWithInfo?.info?.imageUrl,
                                };
                            } else if (pairAsQuote) {
                                const nativePrice = Number(pairAsQuote.priceNative);
                                if (nativePrice > 0) {
                                    priceUsd = Number(pairAsQuote.priceUsd) / nativePrice;
                                    metadata = {
                                        name: pairAsQuote.quoteToken?.name,
                                        symbol: pairAsQuote.quoteToken?.symbol,
                                        logoURI: pairAsQuote.info?.imageUrl || pairWithInfo?.info?.imageUrl,
                                    };
                                }
                            }

                            if (priceUsd > 0) {
                                const pricePair = pairAsBase ?? pairAsQuote;
                                const h24Change = pricePair?.priceChange?.h24;
                                const info = (pairWithInfo ?? pricePair)?.info;

                                const links: Array<{ type: string; label?: string; url: string }> = [];
                                for (const w of (info?.websites || [])) {
                                    if (w.url) links.push({ type: "website", label: w.label || "Website", url: w.url });
                                }
                                for (const s of (info?.socials || [])) {
                                    if (s.url) links.push({ type: (s.type || "link").toLowerCase(), url: s.url });
                                }

                                // Map back FROM external TO internal for the result key
                                const solExternalLower = SOL_MINT_EXTERNAL.toLowerCase();
                                const resultKey = id.toLowerCase() === solExternalLower ? SOL_MINT_INTERNAL : id;

                                data[resultKey] = {
                                    price: priceUsd,
                                    priceChange24h: h24Change !== undefined ? Number(h24Change) : undefined,
                                    marketCap: pricePair?.marketCap ? Number(pricePair.marketCap) : undefined,
                                    fdv: pricePair?.fdv ? Number(pricePair.fdv) : undefined,
                                    description: info?.description || undefined,
                                    links: links.length > 0 ? links : undefined,
                                    ...metadata,
                                };
                            }
                        }
                    }
                }

                return { data };
            } catch (error) {
                console.error("Failed to fetch prices:", error);
                throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch prices" });
            }
        }),

    getSolPrice: protectedProcedure.query(async () => {
        return withCache("dexscreener:price:sol", TTL.SOL_PRICE, async () => {
            try {
                const solAddress = "So11111111111111111111111111111111111111112";
                const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${solAddress}`);
                if (!response.ok) throw new Error("Failed to fetch SOL price");
                const json = await response.json();

                if (json.pairs && json.pairs.length > 0) {
                    const solAddressLower = solAddress.toLowerCase();
                    const pairs = [...json.pairs].sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
                    const pairAsBase = pairs.find((p: any) => p.baseToken?.address?.toLowerCase() === solAddressLower);
                    const pairAsQuote = pairs.find((p: any) => p.quoteToken?.address?.toLowerCase() === solAddressLower);

                    if (pairAsBase && pairAsBase.priceUsd) return Number(pairAsBase.priceUsd);
                    if (pairAsQuote && pairAsQuote.priceUsd && pairAsQuote.priceNative) {
                        const nativePrice = Number(pairAsQuote.priceNative);
                        if (nativePrice > 0) return Number(pairAsQuote.priceUsd) / nativePrice;
                    }
                }
                return 0;
            } catch (error) {
                console.error("Failed to fetch SOL price from DexScreener:", error);
                throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch SOL price" });
            }
        });
    }),

    getSolPriceHistory: protectedProcedure.query(async () => {
        // CoinGecko is frequently blocked or rate-limited. 
        // Returning empty array will cleanly omit the sparkline chart instead of breaking the UI.
        return [];
    }),

    /**
     * Generate a signed MoonPay Buy URL for the user's wallet
     */
    getMoonPayBuyUrl: protectedProcedure
        .input(z.object({
            amount: z.number().optional(),
        }))
        .query(async ({ ctx, input }) => {
            if (!ctx.user.wallet_address) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "No wallet found",
                });
            }

            const { constructMoonPayBuyUrl, signMoonPayUrl } = await import("@/lib/moonpay");

            const apiKey = (process.env.NEXT_PUBLIC_MOONPAY_API_KEY || "").trim();
            const secretKey = (process.env.MOONPAY_SECRET_KEY || "").trim();

            if (!apiKey || !secretKey) {
                console.error("MoonPay configuration missing");
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "MoonPay is not configured",
                });
            }

            const baseUrl = constructMoonPayBuyUrl(
                apiKey,
                ctx.user.wallet_address,
                input.amount
            );

            const signedUrl = signMoonPayUrl(baseUrl, secretKey);

            return { url: signedUrl };
        }),

    /**
     * Fetch recent transaction history for the user's wallet using Helius
     */
    getTransactions: protectedProcedure.query(async ({ ctx }) => {
        if (!ctx.user.wallet_address) {
            throw new TRPCError({
                code: "NOT_FOUND",
                message: "No wallet found",
            });
        }

        const walletAddress = ctx.user.wallet_address;
        try {
            const heliusKey = process.env.HELIUS_API_KEY;
            const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;

            // Fire the Supabase spam-preferences query in parallel with the cache lookup + tx processing
            const spamQueryPromise = supabase
                .from("user_nft_pins")
                .select("spam_transactions")
                .eq("user_id", ctx.user.id)
                .single();

            const SWAP_PROGRAMS: Record<string, string> = {
                "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4": "Jupiter",
                "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": "Jupiter",
                "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc": "Orca",
                "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": "Raydium",
                "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK": "Raydium",
                "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo": "Meteora",
                "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP": "Orca",
                "PhoeNiXZ8ByJGLkxNfZRnkkvxYqz8AAdwNjyFMkTGbj": "Phoenix",
            };

            const data = await withCache(`helius:txs:${walletAddress}`, TTL.TRANSACTIONS, async () => {
                // Step 1: get recent signatures
                const sigRes = await fetch(rpcUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress",
                        params: [walletAddress, { limit: 25, commitment: "finalized" }]
                    })
                });
                if (!sigRes.ok) {
                    const body = await sigRes.text().catch(() => "(unreadable)");
                    throw new Error(`Helius ${sigRes.status}: ${body}`);
                }
                const sigJson = await sigRes.json();
                const sigs: Array<{ signature: string; err: any }> = (sigJson.result || []).slice(0, 10);
                if (sigs.length === 0) return [];

                // Step 2: batch fetch parsed transactions in chunks to avoid rate limits
                const CHUNK_SIZE = 5;
                const txBatch: any[] = [];
                for (let i = 0; i < sigs.length; i += CHUNK_SIZE) {
                    const chunk = sigs.slice(i, i + CHUNK_SIZE);
                    const txRes = await fetch(rpcUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(chunk.map((s, j) => ({
                            jsonrpc: "2.0", id: i + j, method: "getTransaction",
                            params: [s.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "finalized" }]
                        })))
                    });
                    if (!txRes.ok) {
                        const body = await txRes.text().catch(() => "(unreadable)");
                        throw new Error(`Helius ${txRes.status}: ${body}`);
                    }
                    const chunkResults = await txRes.json();
                    txBatch.push(...(Array.isArray(chunkResults) ? chunkResults : [chunkResults]));
                    if (i + CHUNK_SIZE < sigs.length) await new Promise(r => setTimeout(r, 200));
                }

                return txBatch.map((rpcResp: any, i: number) => {
                    const tx = rpcResp?.result;
                    if (!tx) return null;
                    const meta = tx.meta;
                    const message = tx.transaction?.message;
                    const accountKeys: string[] = (message?.accountKeys || []).map((k: any) =>
                        typeof k === "string" ? k : k.pubkey
                    );

                    // Flatten all instructions (top-level + inner)
                    const allIxs = [
                        ...(message?.instructions || []),
                        ...(meta?.innerInstructions || []).flatMap((ii: any) => ii.instructions || [])
                    ];
                    const programIds: string[] = allIxs.map((ix: any) => ix.programId).filter(Boolean);

                    // Detect transaction type
                    let type = "UNKNOWN";
                    let source = "Unknown";
                    for (const pid of programIds) {
                        if (SWAP_PROGRAMS[pid]) { type = "SWAP"; source = SWAP_PROGRAMS[pid]; break; }
                    }
                    if (type === "UNKNOWN") {
                        const hasToken = programIds.some((p) =>
                            p === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" ||
                            p === "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
                        );
                        type = (hasToken || programIds.includes("11111111111111111111111111111111")) ? "TRANSFER" : "UNKNOWN";
                    }

                    // Native transfers from parsed system program instructions
                    const nativeTransfers = allIxs
                        .filter((ix: any) => ix.program === "system" && ix.parsed?.type === "transfer")
                        .map((ix: any) => ({
                            fromUserAccount: ix.parsed.info.source,
                            toUserAccount: ix.parsed.info.destination,
                            amount: ix.parsed.info.lamports
                        }));

                    // Token transfers from pre/post token balance deltas (includes owner addresses)
                    const preTB = new Map<string, number>();
                    const postTB = new Map<string, number>();
                    const mintToSymbol = new Map<string, string>();
                    (meta?.preTokenBalances || []).forEach((b: any) => {
                        const owner = b.owner ?? accountKeys[b.accountIndex] ?? "";
                        preTB.set(`${b.mint}:${owner}`, parseFloat(b.uiTokenAmount?.uiAmountString || "0"));
                    });
                    (meta?.postTokenBalances || []).forEach((b: any) => {
                        const owner = b.owner ?? accountKeys[b.accountIndex] ?? "";
                        postTB.set(`${b.mint}:${owner}`, parseFloat(b.uiTokenAmount?.uiAmountString || "0"));
                        if (b.uiTokenAmount?.symbol) mintToSymbol.set(b.mint, b.uiTokenAmount.symbol);
                    });

                    const mintDeltas = new Map<string, Map<string, number>>();
                    for (const key of new Set([...preTB.keys(), ...postTB.keys()])) {
                        const colonIdx = key.indexOf(":");
                        const mint = key.slice(0, colonIdx);
                        const owner = key.slice(colonIdx + 1);
                        const delta = (postTB.get(key) ?? 0) - (preTB.get(key) ?? 0);
                        if (Math.abs(delta) > 1e-9) {
                            if (!mintDeltas.has(mint)) mintDeltas.set(mint, new Map());
                            mintDeltas.get(mint)!.set(owner, delta);
                        }
                    }

                    const tokenTransfers: any[] = [];
                    mintDeltas.forEach((ownerDeltas, mint) => {
                        const senders = [...ownerDeltas.entries()].filter(([, d]) => d < 0);
                        const receivers = [...ownerDeltas.entries()].filter(([, d]) => d > 0);
                        senders.forEach(([from]) => {
                            receivers.forEach(([to, toDelta]) => {
                                tokenTransfers.push({
                                    fromUserAccount: from,
                                    toUserAccount: to,
                                    mint,
                                    tokenSymbol: mintToSymbol.get(mint) || "",
                                    tokenAmount: Math.abs(toDelta)
                                });
                            });
                        });
                    });

                    return {
                        signature: sigs[i].signature,
                        timestamp: tx.blockTime,
                        type,
                        feePayer: accountKeys[0] || "",
                        tokenTransfers,
                        nativeTransfers,
                        fee: meta?.fee,
                        transactionError: meta?.err,
                        description: "",
                        source
                    };
                }).filter(Boolean);
            });

            const mappedTxs = (data || []).map((tx: any) => {
                const userAddress = ctx.user.wallet_address!;
                const isOutgoing = tx.feePayer === userAddress;
                const type = tx.type || "UNKNOWN";
                const isSwap = type.includes("SWAP");

                // Collect all transfers involving the user
                const userTokenTransfers = (tx.tokenTransfers || []).filter((t: any) => 
                    t.fromUserAccount === userAddress || t.toUserAccount === userAddress
                );
                const userNativeTransfers = (tx.nativeTransfers || []).filter((t: any) => 
                    t.fromUserAccount === userAddress || t.toUserAccount === userAddress
                );

                const getTransfersDelta = (transfers: any[], isNative: boolean) => {
                    return transfers.map(t => ({
                        symbol: isNative ? "SOL" : t.tokenSymbol,
                        // Helius v0: native amount is lamports, tokenAmount is decimal
                        amount: isNative ? t.amount / 1_000_000_000 : (t.tokenAmount || 0),
                        isIncoming: t.toUserAccount === userAddress,
                        mint: isNative ? "So11111111111111111111111111111111111111112" : t.mint
                    }));
                };

                const allInvolved = [
                    ...getTransfersDelta(userTokenTransfers, false),
                    ...getTransfersDelta(userNativeTransfers, true)
                ];

                // For swaps, we want to find the assets that actually constitute the swap
                // Significant = non-SOL if possible, or larger SOL amounts
                // Improved asset selection for Swaps
                // We want to find the most "significant" assets involved
                const getPriceRef = (symbol: string) => (symbol === "SOL" ? 1 : 0.5); // Rough heuristic

                const getBestAsset = (assets: any[]) => {
                    if (assets.length === 0) return null;
                    // Prefer non-SOL tokens, or the largest SOL transfer
                    return assets.sort((a, b) => {
                        const aScore = (a.symbol !== "SOL" ? 10 : 0) + a.amount * getPriceRef(a.symbol);
                        const bScore = (b.symbol !== "SOL" ? 10 : 0) + b.amount * getPriceRef(b.symbol);
                        return bScore - aScore;
                    })[0];
                };

                const primary = isSwap ? getBestAsset(allInvolved.filter(t => t.isIncoming)) : getBestAsset(allInvolved);
                const secondary = isSwap ? getBestAsset(allInvolved.filter(t => !t.isIncoming)) : null;

                // Ensure they are different if possible
                let finalPrimary = primary;
                let finalSecondary = secondary;
                if (isSwap && finalPrimary && finalSecondary && finalPrimary.mint === finalSecondary.mint) {
                    const fallbackOther = allInvolved.find(t => t.mint !== finalPrimary.mint);
                    if (fallbackOther) finalSecondary = fallbackOther;
                }

                // Only return a confirmed icon for SOL — everything else is resolved by DAS/Jupiter backfill below
                const getIcon = (mint: string): string => {
                    if (mint === "So11111111111111111111111111111111111111112" || mint === "So11111111111111111111111111111111111111111") {
                        return "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png";
                    }
                    return `https://img.jup.ag/tokens/${mint}`;
                };

                // Improve description
                let description = tx.description || "";
                if (description && !isSwap) {
                    if (isOutgoing && description.includes(" transferred ") && description.includes(" to ")) {
                        const parts = description.split(" to ");
                        if (parts.length > 1) description = `To ${parts[1]}`;
                    } else if (!isOutgoing && description.includes(" transferred ") && description.includes(" to ")) {
                        const parts = description.split(" transferred ");
                        if (parts.length > 0) description = `From ${parts[0]}`;
                    }
                    description = description.replace(/[1-9A-HJ-NP-Za-km-z]{32,44}/g, (addr: string) => {
                        return addr.slice(0, 4) + "...." + addr.slice(-4);
                    });
                } else if (isSwap) {
                    description = tx.source || "Jupiter";
                }

                // Counterparty address from transfers (not relevant for swaps)
                let counterpartyAddress: string | undefined;
                if (!isSwap) {
                    const allTransfers = [...userTokenTransfers, ...userNativeTransfers];
                    const counterpartyTransfer = isOutgoing
                        ? allTransfers.find((t: any) => t.fromUserAccount === userAddress && t.toUserAccount !== userAddress)
                        : allTransfers.find((t: any) => t.toUserAccount === userAddress && t.fromUserAccount !== userAddress);
                    counterpartyAddress = isOutgoing
                        ? counterpartyTransfer?.toUserAccount
                        : counterpartyTransfer?.fromUserAccount;
                }

                return {
                    signature: tx.signature,
                    timestamp: tx.timestamp * 1000,
                    type: isSwap ? "SWAP" : type,
                    status: tx.transactionError ? "failed" : "success",
                    isOutgoing,
                    amount: finalPrimary?.amount || 0,
                    description: description || `${type} Transaction`,
                    source: tx.source || "Unknown",
                    tokenSymbol: finalPrimary?.symbol,
                    tokenMint: finalPrimary?.mint,
                    tokenIcon: finalPrimary?.mint ? getIcon(finalPrimary.mint) : undefined,
                    counterpartyAddress,
                    networkFee: tx.fee ? tx.fee / 1_000_000_000 : undefined,
                    secondaryTokenSymbol: finalSecondary?.symbol,
                    secondaryTokenMint: finalSecondary?.mint,
                    secondaryAmount: finalSecondary?.amount,
                    secondaryTokenIcon: finalSecondary?.mint ? getIcon(finalSecondary.mint) : undefined,
                };
            });

            // Resolve symbols AND icons for all mints via Helius DAS getAssetBatch
            // Collect every unique non-SOL mint across all transactions
            const SOL_MINTS = new Set([
                "So11111111111111111111111111111111111111111",
                "So11111111111111111111111111111111111111112",
            ]);
            const allMints = new Set<string>();
            for (const tx of mappedTxs) {
                if (tx.tokenMint && !SOL_MINTS.has(tx.tokenMint)) allMints.add(tx.tokenMint);
                if (tx.secondaryTokenMint && !SOL_MINTS.has(tx.secondaryTokenMint)) allMints.add(tx.secondaryTokenMint);
            }

            if (allMints.size > 0) {
                const mintMeta: Record<string, { symbol?: string; icon?: string }> = {};

                // Step 1: Helius DAS getAssetBatch — always use mainnet since getTransactions is mainnet-only
                try {
                    const heliusKey = process.env.HELIUS_API_KEY;
                    const heliusRpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;
                    const batchRes = await fetch(heliusRpcUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            jsonrpc: "2.0",
                            id: "txMetaLookup",
                            method: "getAssetBatch",
                            params: { ids: [...allMints].slice(0, 100) },
                        }),
                        signal: AbortSignal.timeout(5000),
                    });
                    if (batchRes.ok) {
                        const batchJson = await batchRes.json();
                        for (const asset of (batchJson.result || [])) {
                            if (asset?.id) {
                                mintMeta[asset.id] = {
                                    symbol: asset.token_info?.symbol || asset.content?.metadata?.symbol || undefined,
                                    icon: asset.content?.links?.image || asset.content?.files?.[0]?.uri || undefined,
                                };
                            }
                        }
                    }
                } catch (err) {
                    console.warn("DAS getAssetBatch failed:", err);
                }

                // Step 2: Jupiter token API for mints DAS couldn't resolve a symbol or icon for
                const stillMissingSymbol = [...allMints].filter(m => !mintMeta[m]?.symbol || !mintMeta[m]?.icon);
                if (stillMissingSymbol.length > 0) {
                    const jupResults = await Promise.allSettled(
                        stillMissingSymbol.map(mint =>
                            fetch(`https://lite-api.jup.ag/tokens/v1/token/${mint}?strict=false`, {
                                signal: AbortSignal.timeout(4000),
                            }).then(r => r.ok ? r.json() : null)
                        )
                    );
                    stillMissingSymbol.forEach((mint, i) => {
                        const res = jupResults[i];
                        if (res.status === "fulfilled" && res.value?.symbol) {
                            mintMeta[mint] = {
                                symbol: res.value.symbol,
                                icon: mintMeta[mint]?.icon || res.value.logoURI,
                            };
                        }
                    });
                }

                // Backfill symbols (where missing) and icons (always prefer DAS/Jupiter over CDN guess)
                for (const tx of mappedTxs) {
                    if (tx.tokenMint && mintMeta[tx.tokenMint]) {
                        const meta = mintMeta[tx.tokenMint];
                        if (!tx.tokenSymbol && meta.symbol) tx.tokenSymbol = meta.symbol;
                        if (meta.icon) tx.tokenIcon = meta.icon;
                    }
                    if (tx.secondaryTokenMint && mintMeta[tx.secondaryTokenMint]) {
                        const meta = mintMeta[tx.secondaryTokenMint];
                        if (!tx.secondaryTokenSymbol && meta.symbol) tx.secondaryTokenSymbol = meta.symbol;
                        if (meta.icon) tx.secondaryTokenIcon = meta.icon;
                    }
                }
            }

            // Await the spam preferences (fired earlier in parallel with tx processing)
            const { data: txPinData } = await spamQueryPromise;

            const spamSignatures = new Set<string>(txPinData?.spam_transactions || []);
            const finalTxs = mappedTxs.map((tx: any) =>
                spamSignatures.has(tx.signature) ? { ...tx, isSpam: true } : tx
            );

            return finalTxs;
        } catch (error) {
            console.error("Failed to fetch transaction history:", error);
            // Return empty array instead of crashing UI
            return [];
        }
    }),

    /**
     * Fetch NFTs for the user's wallet using Helius
     */
    getNfts: protectedProcedure.query(async ({ ctx }) => {
        if (!ctx.user.wallet_address) {
            throw new TRPCError({
                code: "NOT_FOUND",
                message: "No wallet found",
            });
        }

        const nftWallet = ctx.user.wallet_address!;
        try {
            const heliusKey = process.env.HELIUS_API_KEY;
            const url = `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;

            const nftData = await withCache(`helius:nfts:${nftWallet}`, TTL.NFTS, async () => {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: "getNfts",
                    method: "getAssetsByOwner",
                    params: {
                        ownerAddress: nftWallet,
                        page: 1,
                        limit: 100,
                        displayOptions: {
                            showCollectionMetadata: true,
                            showUnverifiedCollections: false,
                        },
                    },
                }),
            });

            if (!response.ok) throw new Error("Failed to fetch NFTs from Helius");
            return response.json();
            });

            const data = nftData;
            if (!data.result || !data.result.items) return { nfts: [], hiddenCollections: [] };

            const FUNGIBLE_INTERFACES = new Set(["FungibleToken", "FungibleAsset"]);

            const candidates = data.result.items.filter((nft: any) =>
                !FUNGIBLE_INTERFACES.has(nft.interface) && !nft.burnt
            );

            // Step 1: filter using on-asset Helius signals — no extra API calls needed.
            // Signals derived from testing against real wallet data.
            const SPAM_NAME = /^[\$#!]|🎁|🎀|💎|claim|airdrop|voucher|lucky.?box|lucky.?ticket|token.?ticket|drop.?box|limited.?drop|limited.?card|\d{3,}\s*to\s*\d{3,}/i;
            const CYRILLIC  = /[\u0400-\u04FF]/;

            // Known spam factory creator wallets — same addresses appear across dozens of collections
            const SPAM_CREATORS = new Set([
                "ErpMXKkPGRJUURpvgwMWAhTV9nBuBN9bnfNw2ECaRcKd",
                "4AuVuuzh7NA8b8jCcJzARdUALum4MxG9tPYA7QxTPHqo",
                "AXQPUfHW1GjD7Qt8RAfHovpYv2c9sV5SatM7SW6YyJm5",
                "5iqhjZBsiFuECYVrrppmQuERRuDTxbYgLhqmznVF1PEM",
                "5PRUDJzTGx35QaPBS2swEn8WxuSgniEMWBiDquKxQw4T",
                "7kCL2HxbcvoVvJaF7awjznm36CkPbz11mKk9wn6oySQQ",
                "EzKSEiavP4jaGpCA7rBpwQq8etASzeLfoQgJgotGXi4A",
                "CdDvU91h95rnKMj1yWvz4vQzBUbKiPsJ6HNdqeWDsLZH",
                "52qN7jaqcZ65UNnGYd9V1efduGyizBnZXmdHLeuhFpp7",
                "AriKmy1oDedDwehYoA9aE5LUnoPheXfdkfF8QKM3KLSh",
            ]);

            const filtered = candidates.filter((nft: any) => {
                const name = nft.content?.metadata?.name || "";
                const collectionGroup = nft.grouping?.find((g: any) => g.group_key === "collection");
                const collectionName = collectionGroup?.collection_metadata?.name || "";

                // Name-based signals — check both token name and collection name
                if (SPAM_NAME.test(name) || SPAM_NAME.test(collectionName)) return false;
                if (CYRILLIC.test(name) || CYRILLIC.test(collectionName)) return false;

                // No collection grouping at all → likely airdrop spam
                if (!collectionGroup) return false;

                // Known spam factory creator → block regardless of other signals
                const creators: any[] = nft.creators ?? [];
                if (creators.some((c: any) => SPAM_CREATORS.has(c.address))) return false;

                // Spam factory fingerprint: verified collection + exactly 5.5% royalty + empty collection image.
                // Real data showed every spam factory uses this exact combination; no legit project matched it.
                // NOTE: collection.verified being true does NOT mean legitimate — spammers verify too.
                const royaltyPct = nft.royalty?.percent ?? 0;
                const collectionImage = collectionGroup?.collection_metadata?.image || "";
                if (collectionGroup.verified && Math.abs(royaltyPct - 0.055) < 0.001 && !collectionImage) return false;

                // Triple-zero: verified collection with no creators, no royalty, no collection image.
                // Legitimate projects have at least one of these. Catches scam "drop pass" style NFTs.
                if (creators.length === 0 && royaltyPct === 0 && !collectionImage) return false;

                // Require primary sale to have occurred — NFTs minted directly to wallet
                // (airdrops, free passes) have this as false. Purchased NFTs are always true.
                const primarySaleHappened = nft.royalty?.primary_sale_happened ?? false;
                if (!primarySaleHappened) return false;

                // Verified collection that passed all checks above → show
                if (collectionGroup.verified) return true;

                // Unverified collection: require both non-zero royalty and a real collection image
                if (royaltyPct > 0 && collectionImage) return true;

                return false;
            });

            // Steps 2 + 4: Fetch ME collection stats (one call per unique collection, not per NFT)
            // and user DB preferences in parallel.
            // Previously this made N per-NFT ME token calls just to get the collection slug.
            // Now we pick one representative NFT per collection, get the slug once, then fetch stats.
            const collectionRepresentatives = new Map<string, string>(); // collectionAddress → nft.id
            for (const nft of filtered) {
                const collectionAddr = nft.grouping?.find((g: any) => g.group_key === "collection")?.group_value;
                if (collectionAddr && !collectionRepresentatives.has(collectionAddr)) {
                    collectionRepresentatives.set(collectionAddr, nft.id);
                }
            }
            const collectionAddressArray = [...collectionRepresentatives.keys()];

            const [representativeTokenData, { data: pinData }] = await Promise.all([
                Promise.all(
                    collectionAddressArray.map(collectionAddr =>
                        fetch(`https://api-mainnet.magiceden.dev/v2/tokens/${collectionRepresentatives.get(collectionAddr)}`, {
                            signal: AbortSignal.timeout(5000),
                        })
                            .then(r => r.ok ? r.json() : null)
                            .catch(() => null)
                    )
                ),
                supabase
                    .from("user_nft_pins")
                    .select("pinned_nfts, pinned_collections, hidden_collections, spam_nfts")
                    .eq("user_id", ctx.user.id)
                    .single(),
            ]);

            // collectionAddress → ME slug
            const collectionSlugMap = new Map<string, string>();
            collectionAddressArray.forEach((addr, i) => {
                const slug = representativeTokenData[i]?.collection;
                if (slug) collectionSlugMap.set(addr, slug);
            });

            // nft.id → ME slug (via the collection address)
            const tokenData = new Map<string, string | null>(
                filtered.map((nft: any) => {
                    const collectionAddr = nft.grouping?.find((g: any) => g.group_key === "collection")?.group_value;
                    return [nft.id, collectionAddr ? (collectionSlugMap.get(collectionAddr) ?? null) : null];
                })
            );

            const symbols = [...new Set([...collectionSlugMap.values()])] as string[];
            const statsResults = await Promise.all(
                symbols.map(symbol =>
                    fetch(`https://api-mainnet.magiceden.dev/v2/collections/${symbol}/stats`, {
                        signal: AbortSignal.timeout(5000),
                    })
                        .then(r => r.ok ? r.json().then((s: any) => ({ symbol, floor: s?.floorPrice ?? 0, lastSale: s?.lastSale ?? 0, holders: s?.holders ?? 0 })) : { symbol, floor: 0, lastSale: 0, holders: 0 })
                        .catch(() => ({ symbol, floor: 0, lastSale: 0, holders: 0 }))
                )
            );

            const pinnedNfts = new Set(pinData?.pinned_nfts || []);
            const pinnedCollections = new Set(pinData?.pinned_collections || []);
            const hiddenCollections = new Set(pinData?.hidden_collections || []);
            const spamNfts = new Set(pinData?.spam_nfts || []);

            const nfts = filtered
            .filter((nft: any) => {
                if (spamNfts.has(nft.id)) return false;
                const collectionId = nft.grouping?.find((g: any) => g.group_key === "collection")?.group_value;
                if (collectionId && hiddenCollections.has(collectionId)) return false;
                return true;
            })
            .map((nft: any) => {
                const symbol = tokenData.get(nft.id);
                const stats = statsResults.find(s => s.symbol === symbol);

                const collectionId = nft.grouping?.find((g: any) => g.group_key === "collection")?.group_value;
                const isPinned = pinnedNfts.has(nft.id) || (collectionId && pinnedCollections.has(collectionId));

                return {
                    mint: nft.id,
                    name: nft.content?.metadata?.name || "Unnamed NFT",
                    image: nft.content?.links?.image || nft.content?.files?.[0]?.uri || "",
                    collectionId: nft.grouping?.find((g: any) => g.group_key === "collection")?.group_value,
                    collectionName: nft.content?.metadata?.collection?.name
                        || nft.grouping?.find((g: any) => g.group_key === "collection")?.collection_metadata?.name
                        || symbol,
                    description: nft.content?.metadata?.description,
                    attributes: nft.content?.metadata?.attributes,
                    floorPrice: stats?.floor ? stats.floor / 1_000_000_000 : 0,
                    lastSalePrice: stats?.lastSale ? stats.lastSale / 1_000_000_000 : 0,
                    totalReturn: (stats?.floor && stats?.lastSale) ? (stats.floor - stats.lastSale) / 1_000_000_000 : undefined,
                    uniqueHolders: stats?.holders || 0,
                    network: "Solana",
                    isPinned,
                };
            });

            return { nfts, hiddenCollections: [...hiddenCollections] };
        } catch (error) {
            console.error("Failed to fetch NFTs:", error);
            return { nfts: [], hiddenCollections: [] };
        }
    }),

    /**
     * Toggles the pin state for an NFT and/or Collection in the database.
     */
    toggleNftPin: protectedProcedure
        .input(z.object({
            mint: z.string().optional(),
            collectionId: z.string().optional(),
            pin: z.boolean(),
        }))
        .mutation(async ({ ctx, input }) => {
            if (!input.mint && !input.collectionId) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Must provide either mint or collectionId to pin/unpin",
                });
            }

            // Fetch current pin state
            const { data: pinData } = await supabase
                .from("user_nft_pins")
                .select("pinned_nfts, pinned_collections")
                .eq("user_id", ctx.user.id)
                .single();

            let newPinnedNfts: string[] = [...(pinData?.pinned_nfts || [])];
            let newPinnedCols: string[] = [...(pinData?.pinned_collections || [])];

            if (input.mint) {
                if (input.pin && !newPinnedNfts.includes(input.mint)) {
                    newPinnedNfts.push(input.mint);
                } else if (!input.pin) {
                    newPinnedNfts = newPinnedNfts.filter(m => m !== input.mint);
                }
            }

            if (input.collectionId) {
                if (input.pin && !newPinnedCols.includes(input.collectionId)) {
                    newPinnedCols.push(input.collectionId);
                } else if (!input.pin) {
                    newPinnedCols = newPinnedCols.filter(c => c !== input.collectionId);
                }
            }

            const { error: upsertError } = await supabase
                .from("user_nft_pins")
                .upsert({
                    user_id: ctx.user.id,
                    pinned_nfts: newPinnedNfts,
                    pinned_collections: newPinnedCols,
                    updated_at: new Date().toISOString(),
                }, { onConflict: "user_id" });

            if (upsertError) {
                console.error("Failed to update pins:", upsertError);
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to save pin preferences",
                });
            }

            return { success: true };
        }),

    /**
     * Toggle hidden state for a collection.
     */
    toggleHideCollection: protectedProcedure
        .input(z.object({ collectionId: z.string(), hidden: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            const { data } = await supabase
                .from("user_nft_pins")
                .select("hidden_collections")
                .eq("user_id", ctx.user.id)
                .single();

            let updated: string[] = [...(data?.hidden_collections || [])];
            if (input.hidden && !updated.includes(input.collectionId)) {
                updated.push(input.collectionId);
            } else if (!input.hidden) {
                updated = updated.filter(c => c !== input.collectionId);
            }

            const { error } = await supabase
                .from("user_nft_pins")
                .upsert({ user_id: ctx.user.id, hidden_collections: updated, updated_at: new Date().toISOString() }, { onConflict: "user_id" });

            if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to save" });
            return { success: true };
        }),

    /**
     * Report an NFT as spam.
     */
    reportSpamNft: protectedProcedure
        .input(z.object({ mint: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const { data } = await supabase
                .from("user_nft_pins")
                .select("spam_nfts")
                .eq("user_id", ctx.user.id)
                .single();

            const updated: string[] = [...(data?.spam_nfts || [])];
            if (!updated.includes(input.mint)) updated.push(input.mint);

            const { error } = await supabase
                .from("user_nft_pins")
                .upsert({ user_id: ctx.user.id, spam_nfts: updated, updated_at: new Date().toISOString() }, { onConflict: "user_id" });

            if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to save" });
            return { success: true };
        }),

    /**
     * Report a transaction as spam.
     */
    reportSpamTransaction: protectedProcedure
        .input(z.object({ signature: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const { data } = await supabase
                .from("user_nft_pins")
                .select("spam_transactions")
                .eq("user_id", ctx.user.id)
                .single();

            const updated: string[] = [...(data?.spam_transactions || [])];
            if (!updated.includes(input.signature)) updated.push(input.signature);

            const { error } = await supabase
                .from("user_nft_pins")
                .upsert({ user_id: ctx.user.id, spam_transactions: updated, updated_at: new Date().toISOString() }, { onConflict: "user_id" });

            if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to save" });
            return { success: true };
        }),

    /**
     * Toggle hidden state for a token.
     */
    toggleHideToken: protectedProcedure
        .input(z.object({ mint: z.string(), hidden: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            const { data } = await supabase
                .from("user_nft_pins")
                .select("hidden_tokens")
                .eq("user_id", ctx.user.id)
                .single();

            let updated: string[] = [...(data?.hidden_tokens || [])];
            if (input.hidden && !updated.includes(input.mint)) {
                updated.push(input.mint);
            } else if (!input.hidden) {
                updated = updated.filter(m => m !== input.mint);
            }

            const { error } = await supabase
                .from("user_nft_pins")
                .upsert({ user_id: ctx.user.id, hidden_tokens: updated, updated_at: new Date().toISOString() }, { onConflict: "user_id" });

            if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to save" });
            // Bust the Redis cache so the next getWalletAssets fetch reflects the updated list
            if (ctx.user.wallet_address) invalidateWalletAssets(ctx.user.wallet_address);
            return { success: true };
        }),

    /**
     * Consolidated assets fetch (Fungible Tokens + Native SOL)
     * Fetches balances, metadata, and prices from Helius DAS
     */
    getWalletAssets: protectedProcedure
        .input(z.object({ address: z.string().optional() }))
        .query(async ({ ctx, input }) => {
            const address = input.address || ctx.user.wallet_address;
            
            if (!address) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "No wallet address provided",
                });
            }

        try {
            // Run the Helius+DexScreener cache lookup and the Supabase hidden-tokens query in parallel.
            // hiddenTokenMints are user-specific preferences that must not be baked into the shared cache.
            const hiddenTokensPromise = supabase
                .from("user_nft_pins")
                .select("hidden_tokens")
                .eq("user_id", ctx.user.id)
                .single();

            // HOLDINGS ONLY — no prices in here.
            //
            // What's in this blob changes only when a transaction touches the
            // wallet, and a Helius webhook already tells us when that happens
            // (app/api/webhooks/helius-assets busts this key and nudges the
            // client). Prices change every block and are the SAME for everyone,
            // so bundling them in forced a per-user Helius refresh every 30
            // seconds just to keep a number fresh that isn't per-user at all.
            // That, times every open tab, is what emptied the key.
            //
            // Now: balances are refreshed on a long window and on the webhook,
            // prices are layered on at read time from a shared per-mint cache
            // (free/keyless — DexScreener + CoinGecko, no Helius credits).
            const tokenDataPromise = withSwrCache(`helius:holdings:${address}`, TTL.WALLET_HOLDINGS, TTL.WALLET_HOLDINGS_STALE, async () => {
            // Key already refused? Don't spend a request finding out again.
            if (await heliusQuotaOut()) {
                throw new TRPCError({
                    code: "TOO_MANY_REQUESTS",
                    message: "Wallet data is temporarily unavailable (upstream quota).",
                });
            }
            const heliusKey = process.env.HELIUS_API_KEY;
            const url = `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;

            // A failed upstream must not look like an empty wallet.
            //
            // This used to be `.catch(() => ({ result: null }))`, which turned
            // every Helius failure into `items: []` and `nativeBalance: 0` — a
            // confident, cached, WRONG zero. When the quota ran out on
            // 2026-08-04 every balance in the app read empty and nothing
            // anywhere said why.
            //
            // Quota refusals now alert (deduped) and throw, so withSwrCache
            // never stores the zero and the UI can show an error instead of a
            // number that isn't true.
            const heliusPost = async (id: string, body: object) => {
                let res: Response;
                try {
                    res = await fetch(url, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        signal: AbortSignal.timeout(10000),
                        body: JSON.stringify({ jsonrpc: "2.0", id, ...body }),
                    });
                } catch {
                    // Network/timeout: transient, and the SWR layer still has
                    // the previous good value to serve. Don't alert on these.
                    return { result: null };
                }

                if (!res.ok) {
                    const text = await res.text().catch(() => "");
                    if (isHeliusQuotaError(res.status, text)) {
                        alertHeliusQuota(`wallet.getWalletAssets (${id})`, res.status, text);
                        // Trip the breaker so the next caller fails fast rather
                        // than spending another request to be told the same.
                        await markHeliusQuotaOut();
                        throw new TRPCError({
                            code: "TOO_MANY_REQUESTS",
                            message: "Wallet data is temporarily unavailable (upstream quota).",
                        });
                    }
                    return { result: null };
                }

                return res.json().catch(() => ({ result: null }));
            };

            // 1. Fetch all fungible assets (native balance included via showNativeBalance) and raw token accounts in parallel.
            // showNativeBalance: true returns lamports inside assetsData.result.nativeBalance — eliminates a separate getBalance call.
            const [assetsData, tokenAccountsData] = await Promise.all([
                heliusPost("getAssets", {
                    method: "getAssetsByOwner",
                    params: {
                        ownerAddress: address,
                        page: 1,
                        limit: 100,
                        displayOptions: { showFungible: true, showNativeBalance: true, showZeroBalance: true },
                    },
                }),
                heliusPost("getTokenAccounts", {
                    method: "getTokenAccountsByOwner",
                    params: [address, { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" }, { encoding: "jsonParsed" }],
                }),
            ]);

            // A null result means the UPSTREAM gave us nothing — not that the
            // wallet is empty. Left to fall through it becomes `items: []` and
            // `nativeBalance: 0`, and withSwrCache then stores that for the full
            // stale window: a confident, cached, wrong zero. Reported as the
            // balance chip "flickering to 0 for 20-30 seconds", which is
            // TTL.WALLET_ASSETS almost exactly.
            //
            // The quota path already throws for this reason. But three other
            // paths in heliusPost return { result: null } and reach here the
            // same way — a network error, a 10s timeout, and any non-quota HTTP
            // failure — so the fix only ever covered one of four.
            //
            // Throwing is what keeps the real balance on screen: a background
            // SWR refresh that throws is swallowed and the previous good value
            // keeps serving, and on a cold miss the client holds its last data
            // rather than painting a zero.
            if (!assetsData?.result) {
                throw new TRPCError({
                    code: "SERVICE_UNAVAILABLE",
                    message: "Wallet balances are temporarily unavailable.",
                });
            }

            const items = assetsData.result?.items || [];

            const SOL_MINT_NATIVE = "So11111111111111111111111111111111111111111"; // Native SOL (used for display/balances)
            const SOL_MINT_WSOL = "So11111111111111111111111111111111111111112";   // Wrapped SOL (used for market pricing)
            const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

            const nativeSolBalance = (assetsData.result?.nativeBalance?.lamports || 0) / 1e9;

            // No price fetching in here — see the note on the cache key. What
            // survives is the price Helius already handed us inside the SAME
            // response (`price_info`), kept as a per-mint fallback for anything
            // the market source doesn't cover. It costs nothing extra and it's
            // the only price that would otherwise be lost by moving pricing out.
            const heliusPrices: Record<string, number> = {};
            const formattedTokens: any[] = [];

            // Process DAS items — fungible tokens only (skip NFTs)
            const NFT_INTERFACES = new Set(["V1_NFT", "V2_NFT", "ProgrammableNFT", "Custom", "Inscription", "MplCoreAsset", "MplCoreCollection"]);
            items.forEach((item: any) => {
                // Skip non-fungible assets returned by DAS
                if (NFT_INTERFACES.has(item.interface)) return;

                const info = item.token_info;

                if (item.id === SOL_MINT_WSOL && info?.price_info?.price_per_token) {
                    heliusPrices[SOL_MINT_WSOL] = info.price_info.price_per_token;
                }

                // Skip WSOL and native SOL placeholders — we inject native SOL manually below
                if (item.id === SOL_MINT_WSOL || item.id === SOL_MINT_NATIVE) return;

                const tokenDecimals = info?.decimals ?? 9;
                const balance = (info?.balance || 0) / Math.pow(10, tokenDecimals);
                if (balance <= 0) return; // skip sold/empty tokens

                if (info?.price_info?.price_per_token) heliusPrices[item.id] = info.price_info.price_per_token;

                formattedTokens.push({
                    mint: item.id,
                    symbol: info?.symbol || item.content?.metadata?.symbol || "UNKNOWN",
                    name: item.content?.metadata?.name || info?.symbol || "Unknown Coin",
                    icon: item.content?.links?.image || item.content?.files?.[0]?.uri || undefined,
                    balance,
                    decimals: tokenDecimals,
                    marketCap: info?.price_info?.market_cap,
                    fdv: info?.price_info?.fully_diluted_valuation,
                });
            });

            // The extra getAsset call that used to run when Helius returned no
            // SOL price is gone: SOL is priced from the shared native-price
            // cache now (CoinGecko, with an Alchemy fallback), which every
            // chain in the wallet already uses. One less Helius request per
            // cold fetch, on the request that runs for every user.

            // Supplement with raw on-chain token accounts to catch newly launched coins not yet in DAS
            if (tokenAccountsData?.result?.value) {
                try {
                    const rawAccounts: any[] = tokenAccountsData.result.value || [];
                    const knownMints = new Set(formattedTokens.map((t: any) => t.mint));
                    knownMints.add(SOL_MINT_WSOL);
                    knownMints.add(SOL_MINT_NATIVE);

                    const newMints: string[] = [];
                    const newMintBalances: Record<string, { uiAmount: number; decimals: number }> = {};

                    for (const { account } of rawAccounts) {
                        const parsed = account?.data?.parsed?.info;
                        if (!parsed) continue;
                        const mint = parsed.mint;
                        const uiAmount = parsed.tokenAmount?.uiAmount || 0;
                        if (knownMints.has(mint) || uiAmount === 0) continue;
                        newMints.push(mint);
                        newMintBalances[mint] = { uiAmount, decimals: parsed.tokenAmount?.decimals ?? 9 };
                    }

                    // Batch-fetch metadata for new mints via Helius DAS getAssetBatch
                    if (newMints.length > 0) {
                        const batchData = await heliusPost("getAssetBatch", {
                            method: "getAssetBatch",
                            params: { ids: newMints.slice(0, 50) },
                        });

                        const batchAssets: Record<string, any> = {};
                        for (const asset of (batchData.result || [])) {
                            if (asset?.id) batchAssets[asset.id] = asset;
                        }

                        for (const mint of newMints) {
                            const asset = batchAssets[mint];
                            const { uiAmount, decimals } = newMintBalances[mint];
                            if (asset?.token_info?.price_info?.price_per_token) {
                                heliusPrices[mint] = asset.token_info.price_info.price_per_token;
                            }
                            formattedTokens.push({
                                mint,
                                symbol: asset?.token_info?.symbol || asset?.content?.metadata?.symbol || "UNKNOWN",
                                name: asset?.content?.metadata?.name || asset?.token_info?.symbol || "Unknown Coin",
                                icon: asset?.content?.links?.image || asset?.content?.files?.[0]?.uri || undefined,
                                balance: uiAmount,
                                decimals,
                                marketCap: asset?.token_info?.price_info?.market_cap,
                                fdv: asset?.token_info?.price_info?.fully_diluted_valuation,
                            });
                        }
                    }
                } catch (e) {
                    console.error("Failed to supplement with raw token accounts:", e);
                }
            }

            // Prepend Native SOL explicitly. Unpriced here — priced below, with
            // everything else.
            formattedTokens.unshift({
                mint: SOL_MINT_NATIVE,
                symbol: "SOL",
                name: "Solana",
                icon: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
                balance: nativeSolBalance,
                decimals: 9,
            });

            return { tokens: formattedTokens, heliusPrices };
            }); // end withSwrCache

            const [tokenResult, { data: pinDataAssets }] = await Promise.all([
                tokenDataPromise,
                hiddenTokensPromise,
            ]);

            // ── Prices, layered on at read time ──────────────────────────────
            //
            // Shared, not per-wallet: two people holding the same coin now hit
            // one cached quote instead of each paying for their own lookup
            // inside their own blob. Both sources are free and keyless, so a
            // price refresh costs no Helius credits at all — which is what lets
            // the holdings above sit on a long window without the numbers going
            // stale on screen.
            const held: any[] = tokenResult.tokens ?? [];
            // WSOL rides along in the batch whether or not the wallet holds it:
            // it's how SOL gets a market price if CoinGecko is rate-limiting,
            // and it costs nothing to ask for in a request already going out.
            // Without it, a wallet with no WSOL position had no fallback at all
            // and SOL would have priced at 0 — the whole balance reading $0.00.
            const contractMints = [
                SOL_WSOL_MINT,
                ...held.map((t) => t.mint).filter((m: string) => m !== SOL_NATIVE_MINT),
            ];

            const [nativeQuote, tokenQuotes] = await Promise.all([
                getNativePrice("solana"),
                getTokenPrices("solana", contractMints),
            ]);

            // CoinGecko (carries the 24h change) → DexScreener's WSOL pool →
            // whatever Helius quoted alongside the holdings.
            const wsolQuote = tokenQuotes[SOL_WSOL_MINT];
            const solQuote = nativeQuote ??
                wsolQuote ??
                (tokenResult.heliusPrices?.[SOL_WSOL_MINT]
                    ? { price: tokenResult.heliusPrices[SOL_WSOL_MINT] }
                    : undefined);
            const solPrice = solQuote?.price ?? 0;

            const tokens = held.map((t) => {
                const isSol = t.mint === SOL_NATIVE_MINT;
                // Market quote first (fresh), then the price Helius happened to
                // carry with the holdings (up to the holdings window old), then
                // nothing — never a made-up 0 dressed as a quote.
                const quote = isSol ? solQuote : tokenQuotes[t.mint];
                const price = quote?.price ?? tokenResult.heliusPrices?.[t.mint] ?? 0;
                return {
                    ...t,
                    price,
                    usdValue: (t.balance ?? 0) * price,
                    priceChange24h: quote?.priceChange24h,
                };
            });

            // Biggest holdings first — the list's own order, restored here now
            // that USD value is only known at this point.
            tokens.sort((a, b) => (b.usdValue || 0) - (a.usdValue || 0));

            const hiddenTokenMints: string[] = pinDataAssets?.hidden_tokens || [];
            return { tokens, solPrice, hiddenTokenMints };
        } catch (error) {
            console.error("Failed to fetch wallet assets:", error);
            // The upstream-unavailable and quota throws above are deliberate,
            // typed answers ("we don't know", not "we broke"). Flattening them
            // into a 500 here threw away the only signal that says which.
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch wallet assets",
            });
        }
    }),

    /**
     * Fetches OHLCV chart data from GeckoTerminal.
     * Pool addresses cached 1h, OHLCV results cached 5min.
     *
     * Key fixes vs prior implementation:
     * - Detects whether our token is the base or quote of the pool and passes `token=base|quote`
     *   so GT returns the correct token's price (not the counterpart's).
     * - 1H uses 5-minute candles (aggregate=5, limit=12) — minute data is often unindexed for
     *   newer/smaller pools, while 5-min data has far broader coverage.
     * - ALL timeframe fetches two pages (365 + 365 daily candles) to cover >1 year of history.
     */
    getChartData: protectedProcedure
        .input(z.object({ mint: z.string(), timeframe: z.string() }))
        .query(async ({ input }) => {
            const GT = `${gtBase()}/networks/solana`;
            const gtHeaders = { Accept: "application/json;version=20230302" };

            // [unit, aggregate, limit]
            // 1H: 12 × 5-min candles — 5-min is indexed for far more pools than 1-min
            const ytdDays = Math.max(1, Math.ceil((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 86_400_000));
            const tfConfig: Record<string, [string, number, number]> = {
                "1H":  ["minute", 5,   12],
                "1D":  ["hour",   1,   24],
                "1W":  ["hour",   1,  168],
                "1M":  ["day",    1,   30],
                "YTD": ["day",    1,  ytdDays],
                "ALL": ["day",    1,  365],
            };
            const [unit, aggregate, limit] = tfConfig[input.timeframe] ?? tfConfig["1D"];

            // Native SOL isn't indexed by GeckoTerminal — remap to wSOL
            const mint = input.mint === "So11111111111111111111111111111111111111111"
                ? "So11111111111111111111111111111111111111112"
                : input.mint;

            const ohlcvKey = `gt:ohlcv:${mint}:${input.timeframe}`;

            try {
                return await withCache(ohlcvKey, TTL.CHART_OHLCV, async () => {
                    // Get pool address + which side our token is on (cached 1h via Redis)
                    const { address: poolAddress, tokenSide } = await withCache(
                        `gt:pool:${mint}`,
                        TTL.CHART_POOL,
                        async () => {
                            const poolsRes = await fetch(
                                `${GT}/tokens/${mint}/pools?sort=h24_volume_usd_liquidity_desc&limit=1`,
                                { headers: gtHeaders, signal: AbortSignal.timeout(8000) }
                            );
                            if (!poolsRes.ok) throw new Error(`pools ${poolsRes.status}`);
                            const poolsJson = await poolsRes.json();
                            const pool = poolsJson.data?.[0];
                            if (!pool) throw new Error("no pool found");

                            const address = pool.attributes?.address as string;
                            if (!address) throw new Error("no pool address");

                            const baseId: string = pool.relationships?.base_token?.data?.id ?? "";
                            const tokenSide: "base" | "quote" = baseId.endsWith(`_${mint}`) ? "base" : "quote";
                            return { address, tokenSide };
                        }
                    );

                    // Fetch a page of OHLCV candles
                    const fetchPage = async (beforeTimestamp?: number) => {
                        const url = new URL(`${GT}/pools/${poolAddress}/ohlcv/${unit}`);
                        url.searchParams.set("aggregate", String(aggregate));
                        url.searchParams.set("limit", "365");
                        url.searchParams.set("currency", "usd");
                        url.searchParams.set("token", tokenSide);
                        if (beforeTimestamp) url.searchParams.set("before_timestamp", String(beforeTimestamp));

                        const res = await fetch(url.toString(), { headers: gtHeaders, signal: AbortSignal.timeout(8000) });
                        if (!res.ok) throw new Error(`ohlcv ${res.status}`);
                        const json = await res.json();
                        const candles: number[][] = json.data?.attributes?.ohlcv_list ?? [];
                        // GeckoTerminal ohlcv_list rows: [time, open, high, low, close, volume].
                        // Keep `value` (close) for backward compat with the area chart that reads d.value.
                        return candles.map(([time, open, high, low, close, volume]) => ({
                            time: time as number,
                            open,
                            high,
                            low,
                            close,
                            volume: volume ?? 0,
                            value: close,
                        }));
                    };

                    let data: { time: number; open: number; high: number; low: number; close: number; volume: number; value: number }[];

                    if (input.timeframe === "ALL") {
                        const page1 = await fetchPage();
                        let combined = page1;
                        if (page1.length === 365) {
                            const oldestTs = page1[page1.length - 1]?.time;
                            if (oldestTs) {
                                const page2 = await fetchPage(oldestTs - 1);
                                combined = [...page2, ...page1];
                            }
                        }
                        data = combined.sort((a, b) => a.time - b.time);
                    } else {
                        const url = new URL(`${GT}/pools/${poolAddress}/ohlcv/${unit}`);
                        url.searchParams.set("aggregate", String(aggregate));
                        url.searchParams.set("limit", String(limit));
                        url.searchParams.set("currency", "usd");
                        url.searchParams.set("token", tokenSide);

                        const res = await fetch(url.toString(), { headers: gtHeaders, signal: AbortSignal.timeout(8000) });
                        if (!res.ok) throw new Error(`ohlcv ${res.status}`);
                        const json = await res.json();
                        const candles: number[][] = json.data?.attributes?.ohlcv_list ?? [];
                        data = candles
                            .sort((a, b) => a[0] - b[0])
                            .map(([time, open, high, low, close, volume]) => ({
                                time: time as number,
                                open,
                                high,
                                low,
                                close,
                                volume: volume ?? 0,
                                value: close,
                            }));
                    }

                    // Deduplicate timestamps (can occur at page boundaries)
                    const seen = new Set<number>();
                    return data.filter(d => {
                        if (seen.has(d.time)) return false;
                        seen.add(d.time);
                        return true;
                    });
                });
            } catch (err) {
                console.error("getChartData failed:", err);
                return [];
            }
        }),

    /**
     * Recent on-chain trades for a token, from GeckoTerminal's pool trades feed.
     * Reuses the cached `gt:pool:{mint}` lookup. Side (buy/sell) and token amount
     * are resolved relative to OUR mint (which may be base or quote of the pool).
     */
    getTokenTrades: protectedProcedure
        .input(z.object({ mint: z.string() }))
        .query(async ({ input }) => {
            const GT = `${gtBase()}/networks/solana`;
            const gtHeaders = { Accept: "application/json;version=20230302" };
            try {
                return await withCache(`gt:trades:${input.mint}`, 30, async () => {
                    const pool = await resolvePool(input.mint);
                    if (!pool) return [];

                    const res = await fetch(
                        `${GT}/pools/${pool.address}/trades?trade_volume_in_usd_greater_than=0`,
                        { headers: gtHeaders, signal: AbortSignal.timeout(8000) }
                    );
                    if (!res.ok) throw new Error(`trades ${res.status}`);
                    const json = await res.json();
                    const rows: { attributes: Record<string, string | number> }[] = json.data ?? [];

                    // Resolve wallets to watchparty accounts in ONE batched
                    // lookup, so the table can show a person instead of an
                    // address wherever we know one. This is the thing a pure
                    // market board can't do — everyone else has only the
                    // address.
                    const addresses = Array.from(
                        new Set(rows.map((r) => String(r.attributes.tx_from_address ?? "")).filter(Boolean)),
                    );
                    const identities = await resolveTraders(addresses);

                    return rows.map((row) => {
                        const a = row.attributes;
                        const fromAddr = String(a.from_token_address ?? "");
                        const buysOurToken = String(a.to_token_address ?? "") === input.mint;
                        const sellsOurToken = fromAddr === input.mint;
                        // Fall back to GT's `kind` when neither side matches the raw mint.
                        const isBuy = buysOurToken ? true : sellsOurToken ? false : a.kind === "buy";
                        const tokenAmount = buysOurToken
                            ? Number(a.to_token_amount ?? 0)
                            : Number(a.from_token_amount ?? 0);

                        const account = String(a.tx_from_address ?? "");
                        const who = identities.get(account);

                        return {
                            account,
                            username: who?.username ?? null,
                            avatarUrl: who?.avatarUrl ?? null,
                            isBuy,
                            usdValue: Number(a.volume_in_usd ?? 0),
                            tokenAmount,
                            ts: a.block_timestamp ? Math.floor(Date.parse(String(a.block_timestamp)) / 1000) : 0,
                            txHash: String(a.tx_hash ?? ""),
                        };
                    });
                });
            } catch (err) {
                console.error("getTokenTrades failed:", err);
                return [];
            }
        }),
});
