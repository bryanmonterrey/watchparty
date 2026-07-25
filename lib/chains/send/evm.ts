// EVM transfers — native coin and ERC-20, across all five EVM chains.

import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  formatUnits,
  http,
  isAddress,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { deriveEvm, bytesToHex } from "../derive";
import { getChain } from "../registry";
import type { ChainId } from "../types";
import type { FeeEstimate, SendRequest, SendResult } from "./types";

function chainOrThrow(id: ChainId) {
  const chain = getChain(id);
  if (!chain || chain.kind !== "evm") throw new Error(`${id} is not an EVM chain`);
  return chain;
}

/** viem needs a chain object; ours carries the numeric id and native currency. */
function viemChain(id: ChainId) {
  const c = chainOrThrow(id);
  return {
    id: c.chainId!,
    name: c.name,
    nativeCurrency: { name: c.name, symbol: c.nativeCurrency.symbol, decimals: c.nativeCurrency.decimals },
    rpcUrls: { default: { http: [c.rpcUrl!] } },
  } as const;
}

export function validateEvmAddress(address: string): boolean {
  return isAddress(address);
}

export async function estimateEvmFee(chainId: ChainId, request: SendRequest): Promise<FeeEstimate> {
  const chain = chainOrThrow(chainId);
  const client = createPublicClient({ chain: viemChain(chainId), transport: http(chain.rpcUrl) });

  const gasPrice = await client.getGasPrice();
  // 21000 for a plain transfer; ERC-20 transfers are materially heavier.
  const gasUnits = request.contract ? BigInt(65000) : BigInt(21000);
  const fee = gasPrice * gasUnits;

  return {
    fee: fee.toString(),
    feeFormatted: Number(formatUnits(fee, chain.nativeCurrency.decimals)),
    symbol: chain.nativeCurrency.symbol,
  };
}

export async function sendEvm(
  seed: Uint8Array,
  request: SendRequest
): Promise<SendResult> {
  const chain = chainOrThrow(request.chain);
  if (!isAddress(request.to)) throw new Error("Invalid EVM address");

  const derived = deriveEvm(seed);
  const account = privateKeyToAccount(`0x${bytesToHex(derived.privateKey)}`);

  const wallet = createWalletClient({
    account,
    chain: viemChain(request.chain),
    transport: http(chain.rpcUrl),
  });

  const amount = BigInt(request.amount);
  if (amount <= BigInt(0)) throw new Error("Amount must be positive");

  const hash = request.contract
    ? await wallet.writeContract({
        address: request.contract as Address,
        abi: erc20Abi,
        functionName: "transfer",
        args: [request.to as Address, amount],
      })
    : await wallet.sendTransaction({ to: request.to as Address, value: amount });

  return { txId: hash, explorerUrl: `${chain.explorer}/tx/${hash}` };
}
