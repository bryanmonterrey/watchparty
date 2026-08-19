// Swaps via LI.FI — covering all six of our EVM chains (Ethereum, Base,
// Polygon, BNB, HyperEVM 999, Robinhood Chain 4663) and, CROSS-CHAIN, any
// destination LI.FI reaches including Solana and Bitcoin.
//
// Works keyless; LIFI_API_KEY only raises the rate limits. The platform fee is
// a separate thing from the key — see LIFI_INTEGRATOR below.
//
// Cross-chain is the same endpoint with a different `toChain`: LI.FI is a
// bridge aggregator, and a bridged route still comes back as ONE transaction to
// sign on the SOURCE chain. That is why routing everywhere needs no new signing
// code here — only the destination changes.
//
// The signing half is still EVM-only. A Solana-source route returns a
// `transactionRequest` of `{ data }` alone — a base64 serialized Solana
// transaction, not an EVM call — so it needs the Solana signer rather than
// viem, and `swapSupport` refuses it rather than pretending.

import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  http,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bytesToHex, deriveEvm } from "../derive";
import { getChain } from "../registry";
import type { ChainId } from "../types";
import { NATIVE_TOKEN, type SwapQuote, type SwapQuoteRequest, type SwapResult } from "./types";
import { PLATFORM_FEE_BPS } from "../fee-bps";

const LIFI_API = "https://li.quest/v1";

/**
 * The key our fee registration is filed under at portal.li.fi. Changing this
 * string does not change a label — it silently stops the fee being collected,
 * because LI.FI only bills integrators it recognises.
 */
const LIFI_INTEGRATOR = "watchparty";

/**
 * The API key is for rate limits, NOT for fees — measured 2026-08-19, the 1%
 * is collected identically with and without it. So a missing key degrades
 * throughput and nothing else, and the header is simply omitted.
 */
function lifiHeaders(): Record<string, string> {
  const key = process.env.LIFI_API_KEY;
  return {
    accept: "application/json",
    ...(key ? { "x-lifi-api-key": key } : {}),
  };
}

/**
 * LI.FI's own chain ids for the non-EVM chains.
 *
 * EVM chains use their real numeric chain id, but Solana and Bitcoin have no
 * such number, so LI.FI assigns synthetic ones. Verified against
 * `GET /v1/chains?chainTypes=EVM,SVM,UTXO` on 2026-08-16.
 */
const LIFI_NON_EVM_IDS: Record<string, number> = {
  solana: 1151111081099710,
  bitcoin: 20000000000001,
};

/** The id LI.FI knows a chain by, or null when it doesn't reach it at all. */
function lifiChainId(chain: { id: string; kind: string; chainId?: number }): number | null {
  if (chain.kind === "evm") return chain.chainId ?? null;
  return LIFI_NON_EVM_IDS[chain.id] ?? null;
}

/**
 * Any chain LI.FI can ROUTE, EVM or not.
 *
 * Quoting and signing have different requirements and conflating them is what
 * broke Solana: `evmChainOrThrow` was used for both, so asking for a quote FROM
 * Solana threw "solana does not swap through LI.FI" even though LI.FI quotes it
 * happily (SOL -> BNB via Relay, measured) and `executeLifiSolanaSwap` can sign
 * it. Quoting needs only an id LI.FI recognises; only the EVM SIGNER needs an
 * EVM chain.
 */
function routableChainOrThrow(id: ChainId) {
  const chain = getChain(id);
  if (!chain) throw new Error(`unknown chain: ${id}`);
  if (lifiChainId(chain) === null) {
    throw new Error(`${chain.name} is not reachable through LI.FI`);
  }
  return chain;
}

function evmChainOrThrow(id: ChainId) {
  const chain = getChain(id);
  if (!chain || chain.kind !== "evm") throw new Error(`${id} cannot be signed as an EVM chain`);
  return chain;
}

function viemChain(id: ChainId) {
  const c = evmChainOrThrow(id);
  return {
    id: c.chainId!,
    name: c.name,
    nativeCurrency: {
      name: c.name,
      symbol: c.nativeCurrency.symbol,
      decimals: c.nativeCurrency.decimals,
    },
    rpcUrls: { default: { http: [c.rpcUrl!] } },
  } as const;
}

/**
 * Token metadata by contract — what the swap procs need BEFORE quoting: a
 * quote's fromAmount is base units, so converting the user's human amount
 * needs the token's decimals first. Keyless, same API as the quotes.
 */
export async function getLifiTokenInfo(
  chainId: ChainId,
  token: string
): Promise<{ address: string; symbol: string; name: string; decimals: number; priceUSD?: string }> {
  const chain = routableChainOrThrow(chainId);
  const params = new URLSearchParams({ chain: String(lifiChainId(chain)), token });
  const res = await fetch(`${LIFI_API}/token?${params}`, { headers: lifiHeaders() });
  if (!res.ok) throw new Error(`Token not found on ${chain.name} (${res.status})`);
  const t = (await res.json()) as any;
  if (typeof t?.decimals !== "number") throw new Error(`Token metadata incomplete on ${chain.name}`);
  return { address: t.address, symbol: t.symbol, name: t.name ?? t.symbol, decimals: t.decimals, priceUSD: t.priceUSD };
}

export async function getLifiQuote(
  request: SwapQuoteRequest,
  fromAddress: string,
  /** Destination address. Required when bridging to a chain whose address
   *  format differs from the source's — an EVM address cannot receive on
   *  Solana, and LI.FI rejects the route rather than guessing. */
  toAddress?: string
): Promise<SwapQuote> {
  const chain = routableChainOrThrow(request.chain);
  const destId = request.toChain ?? request.chain;
  const dest = getChain(destId);
  if (!dest) throw new Error(`unknown destination chain: ${destId}`);
  const destLifiId = lifiChainId(dest);
  if (destLifiId === null) throw new Error(`${dest.name} is not reachable through LI.FI`);

  const params = new URLSearchParams({
    // The SOURCE id through the same resolver as the destination — Solana's is
    // synthetic, not `chain.chainId`, which is undefined for it.
    fromChain: String(lifiChainId(chain)),
    toChain: String(destLifiId),
    fromToken: request.fromToken,
    toToken: request.toToken,
    fromAddress,
    fromAmount: request.fromAmount,
    slippage: String(request.slippage ?? 0.005),
    // The platform's cut on every EVM and cross-chain swap. Both params are
    // required together: `fee` alone is ignored, and `integrator` alone just
    // labels the request. LI.FI 400s the pair outright until the integrator is
    // registered with a fee wallet at portal.li.fi ("Integrator 'watchparty' is
    // not configured for collecting fees"), which is why this shipped without
    // them and earned nothing until 2026-08-19.
    //
    // `integrator` must stay exactly "watchparty" — it is the key the portal
    // registration is filed under, and a typo silently reverts to no fee.
    // The rate is a FRACTION here, not bps, hence the /10000.
    integrator: LIFI_INTEGRATOR,
    fee: String(PLATFORM_FEE_BPS / 10_000),
  });
  // Only meaningful when bridging; on a same-chain swap the source address is
  // already the recipient and sending it changes nothing.
  if (toAddress && destId !== request.chain) params.set("toAddress", toAddress);

  const res = await fetch(`${LIFI_API}/quote?${params}`, {
    headers: lifiHeaders(),
  });

  if (!res.ok) {
    const body = await res.text();
    // LI.FI explains *why* a route failed (no liquidity, amount too small).
    // Passing it through beats a generic "swap unavailable".
    let message = `LI.FI returned ${res.status}`;
    try {
      const parsed = JSON.parse(body);
      if (parsed?.message) message = parsed.message;
    } catch {
      /* keep the status message */
    }
    throw new Error(message);
  }

  const q = (await res.json()) as any;

  return {
    chain: request.chain,
    toChain: destId,
    fromToken: {
      address: q.action.fromToken.address,
      symbol: q.action.fromToken.symbol,
      decimals: q.action.fromToken.decimals,
    },
    toToken: {
      address: q.action.toToken.address,
      symbol: q.action.toToken.symbol,
      decimals: q.action.toToken.decimals,
    },
    fromAmount: q.action.fromAmount,
    toAmount: q.estimate.toAmount,
    toAmountMin: q.estimate.toAmountMin,
    tool: q.tool,
    estimatedGas: q.estimate.gasCosts?.[0]?.estimate,
    approvalAddress: q.estimate.approvalAddress,
    transactionRequest: q.transactionRequest
      ? {
          to: q.transactionRequest.to,
          data: q.transactionRequest.data,
          value: q.transactionRequest.value,
          gasLimit: q.transactionRequest.gasLimit,
          gasPrice: q.transactionRequest.gasPrice,
        }
      : undefined,
  };
}

export async function executeLifiSwap(
  seed: Uint8Array,
  quote: SwapQuote
): Promise<SwapResult> {
  const chain = evmChainOrThrow(quote.chain);
  if (!quote.transactionRequest) throw new Error("Quote has no transaction to execute");

  const derived = deriveEvm(seed);
  const account = privateKeyToAccount(`0x${bytesToHex(derived.privateKey)}`);
  const transport = http(chain.rpcUrl);
  const wallet = createWalletClient({ account, chain: viemChain(quote.chain), transport });
  const publicClient = createPublicClient({ chain: viemChain(quote.chain), transport });

  // ERC-20 inputs need an allowance for the router first. Native inputs don't.
  const isNative = quote.fromToken.address.toLowerCase() === NATIVE_TOKEN;
  if (!isNative && quote.approvalAddress) {
    const needed = BigInt(quote.fromAmount);
    const current = await publicClient.readContract({
      address: quote.fromToken.address as Address,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account.address, quote.approvalAddress as Address],
    });

    if (current < needed) {
      const approvalHash = await wallet.writeContract({
        address: quote.fromToken.address as Address,
        abi: erc20Abi,
        functionName: "approve",
        args: [quote.approvalAddress as Address, needed],
      });
      // The swap reverts if it lands before the approval is mined.
      await publicClient.waitForTransactionReceipt({ hash: approvalHash });
    }
  }

  const hash = await wallet.sendTransaction({
    to: quote.transactionRequest.to as Address,
    data: quote.transactionRequest.data as `0x${string}`,
    value: quote.transactionRequest.value ? BigInt(quote.transactionRequest.value) : undefined,
    gas: quote.transactionRequest.gasLimit ? BigInt(quote.transactionRequest.gasLimit) : undefined,
  });

  // The explorer is the SOURCE chain's: that is the only chain this hash exists
  // on. On a bridged route the destination transaction is a different hash we
  // do not have yet, which is exactly why `crossChain` is flagged — the caller
  // must not report delivery on the strength of this receipt.
  return {
    txId: hash,
    explorerUrl: `${chain.explorer}/tx/${hash}`,
    crossChain: quote.toChain !== quote.chain,
  };
}
