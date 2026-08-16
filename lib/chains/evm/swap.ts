// EVM buy quotes — what makes a Base row on the board actually fillable.
//
// Solana buys route through Jupiter (`wallet.getQuote`). Every other chain had
// no equivalent, so the board's Buy cell opened GeckoTerminal: the one button
// that names an action handed the user to a different product to perform it.
// This is the missing half.
//
// LI.FI rather than 0x or 1inch specifically because it quotes with NO API KEY
// at this tier. Both of those now gate quotes behind a provisioned key, and a
// buy path that cannot execute until someone signs up for a service is the same
// dead end as the redirect it replaces. Measured against Base on 2026-08-16:
// 0.001 ETH -> 1.876 USDC, routed via 1inch, quote returned keyless.
//
// It also returns a ready-to-send `transactionRequest` AND the destination
// token's `decimals`/USD values, so ONE round trip both executes and renders a
// real "you receive" figure. Jupiter returns neither, which is why the Solana
// side of the dialog shows no estimate.

const LIFI_QUOTE_URL = "https://li.quest/v1/quote";

/** LI.FI's sentinel for "the chain's own coin" (ETH on Base). */
export const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000";

/**
 * Board networks that can fill through this path.
 *
 * Solana is deliberately ABSENT — it routes through Jupiter — so
 * `evmChainId(network) !== null` is the whole routing test, and adding a chain
 * here is what makes its rows buyable. Only the networks actually enabled in
 * `lib/coin-feed/networks.ts` are worth listing.
 */
export const EVM_CHAIN_IDS: Record<string, number> = { base: 8453 };

export const evmChainId = (network: string): number | null =>
    EVM_CHAIN_IDS[network] ?? null;

/** Hex chain id for `wallet_switchEthereumChain`, which takes hex, not decimal. */
export const hexChainId = (id: number): string => `0x${id.toString(16)}`;

/**
 * An EIP-1193-shaped transaction, ready to hand to the wallet.
 *
 * `gas`, not `gasLimit`: LI.FI returns the latter but `eth_sendTransaction`
 * specifies the former, and a wallet that honours the spec strictly will price
 * the transaction itself (or reject it) when handed an unknown key.
 */
export type EvmSwapTx = {
    to: string;
    data: string;
    value: string;
    gas?: string;
    from: string;
    chainId: number;
};

export type EvmBuyQuote = {
    chainId: number;
    /** Already scaled by the token's decimals — a display number, not base units. */
    receiveAmount: number;
    /** Worst case once slippage is applied, same scaling. */
    receiveMin: number;
    receiveSymbol: string;
    receiveDecimals: number;
    /** LI.FI's own USD figures; null when it declines to price a side. */
    spendUsd: number | null;
    receiveUsd: number | null;
    /** Which venue actually fills (1inch, odos, …) — shown so the route isn't a black box. */
    tool: string;
    tx: EvmSwapTx;
};

const num = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

/**
 * Scale a base-unit integer string to display units.
 *
 * Done on the STRING rather than via `Number(raw) / 10 ** decimals` because a
 * token with 18 decimals overflows the 2^53 integer range long before it
 * overflows a float: 1 whole token is 1e18, and `Number("1234...")` for a
 * mid-sized balance silently loses low-order digits. Splitting first keeps
 * every digit that matters and only then converts a small, safe quotient.
 */
function scaleUnits(raw: string, decimals: number): number {
    if (!/^\d+$/.test(raw)) return 0;
    if (decimals <= 0) return Number(raw);
    const padded = raw.padStart(decimals + 1, "0");
    const whole = padded.slice(0, padded.length - decimals);
    const frac = padded.slice(padded.length - decimals);
    return Number(`${whole}.${frac}`);
}

export class EvmQuoteError extends Error {}

/**
 * Quote a native-coin -> token buy on an EVM chain.
 *
 * Native input is the reason this needs no approval step: an ERC-20 input would
 * require a separate `approve` transaction (and a second wallet prompt) before
 * the swap could land, which is a materially different flow. Buying with the
 * chain's own coin is one signature, so the dialog stays one confirm.
 */
export async function fetchEvmBuyQuote(opts: {
    chainId: number;
    tokenAddress: string;
    /** Native coin amount in whole units (ETH), the unit the UI speaks. */
    amount: number;
    fromAddress: string;
    slippageBps: number;
}): Promise<EvmBuyQuote> {
    const { chainId, tokenAddress, amount, fromAddress, slippageBps } = opts;

    // 18 decimals for every EVM gas coin we support. Built as a string for the
    // same overflow reason as scaleUnits: 0.05 ETH is 5e16, and formatting a
    // float that large reaches exponential notation, which the API rejects.
    const wei = BigInt(Math.round(amount * 1e9)) * BigInt(1e9);

    const qs = new URLSearchParams({
        fromChain: String(chainId),
        toChain: String(chainId),
        fromToken: NATIVE_TOKEN,
        toToken: tokenAddress,
        fromAmount: wei.toString(),
        fromAddress,
        slippage: String(slippageBps / 10_000),
    });

    const res = await fetch(`${LIFI_QUOTE_URL}?${qs}`, {
        headers: { Accept: "application/json" },
    });

    if (!res.ok) {
        // LI.FI puts the useful part in the body — "no route found" and "amount
        // too small" are both 404s, and the status alone can't tell them apart.
        let detail = "";
        try {
            const body = (await res.json()) as { message?: string };
            detail = body?.message ?? "";
        } catch {
            /* non-JSON error body — the status is all we get */
        }
        throw new EvmQuoteError(
            detail || `Quote failed (${res.status}). This coin may have no route on-chain.`,
        );
    }

    const q = (await res.json()) as {
        tool?: string;
        estimate?: {
            toAmount?: string;
            toAmountMin?: string;
            fromAmountUSD?: string;
            toAmountUSD?: string;
        };
        action?: { toToken?: { symbol?: string; decimals?: number } };
        transactionRequest?: {
            to?: string;
            data?: string;
            value?: string;
            gasLimit?: string;
        };
    };

    const tr = q.transactionRequest;
    const toToken = q.action?.toToken;
    if (!tr?.to || !tr.data || !tr.value || typeof toToken?.decimals !== "number") {
        throw new EvmQuoteError("Quote came back without a usable route.");
    }

    const decimals = toToken.decimals;

    return {
        chainId,
        receiveAmount: scaleUnits(q.estimate?.toAmount ?? "0", decimals),
        receiveMin: scaleUnits(q.estimate?.toAmountMin ?? "0", decimals),
        receiveSymbol: toToken.symbol ?? "",
        receiveDecimals: decimals,
        spendUsd: num(q.estimate?.fromAmountUSD),
        receiveUsd: num(q.estimate?.toAmountUSD),
        tool: q.tool ?? "",
        tx: {
            to: tr.to,
            data: tr.data,
            value: tr.value,
            gas: tr.gasLimit,
            from: fromAddress,
            chainId,
        },
    };
}
