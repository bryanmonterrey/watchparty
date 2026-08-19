/**
 * Is this accrual worth the gas it costs to collect?
 *
 * The EVM send fee is the only fee on the platform that needs its own
 * transaction to collect, and that transaction is signed from the USER's
 * wallet — so the gas comes out of their balance, not ours. Without a floor
 * the sweep will happily spend more of a user's ETH than the fee is worth: a
 * $10 mainnet send accrues $0.05, and a plain transfer at 20 gwei costs well
 * over a dollar. That is not a rounding error against the fee, it is 20x the
 * fee, and to the user it looks like their wallet leaking gas for no reason.
 *
 * So a group is swept only once it clears GAS_MULTIPLE times the estimated
 * cost of sweeping it. The rule is self-tuning rather than a hardcoded
 * minimum: the cheap L2s clear it almost immediately, mainnet waits until the
 * accrual is actually worth moving, and neither needs a per-chain constant
 * that goes stale when gas moves.
 *
 * Unknown value never sweeps. If a token has no price we cannot show that the
 * fee beats the gas, and spending a user's gas on an assumption is the exact
 * failure this module exists to prevent — the rows stay pending, which costs
 * nothing and is reversible.
 */

import { formatUnits } from "viem";
import { getChain } from "../registry";
import type { ChainId } from "../types";
import { getNativePrice, getTokenPrices } from "../assets/prices";
import { estimateEvmFee } from "./evm";
import type { PendingFeeGroup } from "./fees";

/** How many times the gas cost the fee must be worth before it is collected. */
export const GAS_MULTIPLE = 5;

export interface SweepVerdict {
    worth: boolean;
    /** Human-readable, recorded against the row so a skip is never a mystery. */
    reason: string;
}

/**
 * ERC-20 decimals, read from the chain. Cached for the isolate's life — a
 * token's decimals cannot change.
 */
const decimalsCache = new Map<string, number>();

async function tokenDecimals(chainId: ChainId, contract: string): Promise<number | null> {
    const key = `${chainId}:${contract.toLowerCase()}`;
    const hit = decimalsCache.get(key);
    if (hit !== undefined) return hit;

    const chain = getChain(chainId);
    if (!chain?.rpcUrl) return null;

    try {
        const { createPublicClient, http, erc20Abi } = await import("viem");
        const client = createPublicClient({ transport: http(chain.rpcUrl) });
        const value = await client.readContract({
            address: contract as `0x${string}`,
            abi: erc20Abi,
            functionName: "decimals",
        });
        const decimals = Number(value);
        if (!Number.isFinite(decimals)) return null;
        decimalsCache.set(key, decimals);
        return decimals;
    } catch {
        return null;
    }
}

export async function worthSweeping(group: PendingFeeGroup): Promise<SweepVerdict> {
    const chain = getChain(group.chain);
    if (!chain || chain.kind !== "evm") return { worth: false, reason: "not an EVM chain" };

    let gasCost: bigint;
    try {
        const estimate = await estimateEvmFee(group.chain as ChainId, {
            chain: group.chain as ChainId,
            to: "0x0000000000000000000000000000000000000000",
            amount: group.total.toString(),
            contract: group.contract ?? undefined,
        });
        gasCost = BigInt(estimate.fee);
    } catch (err: any) {
        return { worth: false, reason: `gas estimate failed: ${err?.message ?? "unknown"}` };
    }

    // Native accrual: fee and gas are the same asset, so no price is involved
    // and the comparison cannot be wrong.
    if (!group.contract) {
        const floor = gasCost * BigInt(GAS_MULTIPLE);
        return group.total >= floor
            ? { worth: true, reason: `native ${group.total} >= ${floor}` }
            : { worth: false, reason: `native ${group.total} below gas floor ${floor}` };
    }

    // Token accrual: the fee is in one asset and the gas in another, so both
    // have to be priced before they can be compared.
    const [native, tokens, decimals] = await Promise.all([
        getNativePrice(group.chain as ChainId),
        getTokenPrices(group.chain as ChainId, [group.contract]),
        tokenDecimals(group.chain as ChainId, group.contract),
    ]);

    const tokenPrice = tokens[group.contract] ?? tokens[group.contract.toLowerCase()];
    if (!native?.price || !tokenPrice?.price || decimals === null) {
        return { worth: false, reason: "no price for the token or the gas — not spending gas on a guess" };
    }

    const gasUsd = Number(formatUnits(gasCost, chain.nativeCurrency.decimals)) * native.price;
    const feeUsd = Number(formatUnits(group.total, decimals)) * tokenPrice.price;

    return feeUsd >= gasUsd * GAS_MULTIPLE
        ? { worth: true, reason: `$${feeUsd.toFixed(4)} >= ${GAS_MULTIPLE}x $${gasUsd.toFixed(4)} gas` }
        : { worth: false, reason: `$${feeUsd.toFixed(4)} below ${GAS_MULTIPLE}x $${gasUsd.toFixed(4)} gas` };
}
