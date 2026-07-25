// EVM swaps via LI.FI — keyless, and it covers all five of our EVM chains
// (Ethereum, Base, Polygon, HyperEVM 999, Robinhood Chain 4663).

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

const LIFI_API = "https://li.quest/v1";

function evmChainOrThrow(id: ChainId) {
  const chain = getChain(id);
  if (!chain || chain.kind !== "evm") throw new Error(`${id} does not swap through LI.FI`);
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

export async function getLifiQuote(
  request: SwapQuoteRequest,
  fromAddress: string
): Promise<SwapQuote> {
  const chain = evmChainOrThrow(request.chain);

  const params = new URLSearchParams({
    fromChain: String(chain.chainId),
    toChain: String(chain.chainId),
    fromToken: request.fromToken,
    toToken: request.toToken,
    fromAddress,
    fromAmount: request.fromAmount,
    slippage: String(request.slippage ?? 0.005),
  });

  const res = await fetch(`${LIFI_API}/quote?${params}`, {
    headers: { accept: "application/json" },
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

  return { txId: hash, explorerUrl: `${chain.explorer}/tx/${hash}` };
}
