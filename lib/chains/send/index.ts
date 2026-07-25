// Send router — dispatches by chain kind.
//
// Solana is absent by design: it signs through FROST/Swig
// (server/routers/wallet.ts frostSign + relaySwigTransaction), which never
// reconstructs a private key. The chains here cannot use that path because
// FROST is ed25519-only, so they sign from the seed instead.

import { getChain } from "../registry";
import type { ChainId } from "../types";
import { estimateBitcoinFee, sendBitcoin } from "./bitcoin";
import { estimateEvmFee, sendEvm, validateEvmAddress } from "./evm";
import { estimateSuiFee, sendSui, validateSuiAddress } from "./sui";
import type { FeeEstimate, SendRequest, SendResult } from "./types";

export * from "./types";

/** True when this chain sends through here rather than through FROST/Swig. */
export function hasSendProvider(chainId: string): boolean {
  const chain = getChain(chainId);
  return !!chain && chain.kind !== "solana";
}

export function validateAddress(chainId: ChainId, address: string): boolean {
  const chain = getChain(chainId);
  if (!chain) return false;

  switch (chain.kind) {
    case "evm":
      return validateEvmAddress(address);
    case "sui":
      return validateSuiAddress(address);
    case "bitcoin":
      // Accept bech32 (native segwit) and legacy base58 forms.
      return /^(bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(address);
    default:
      return false;
  }
}

export async function sendOnChain(
  seed: Uint8Array,
  request: SendRequest
): Promise<SendResult> {
  const chain = getChain(request.chain);
  if (!chain) throw new Error(`Unknown chain: ${request.chain}`);

  if (!validateAddress(request.chain, request.to)) {
    throw new Error(`Not a valid ${chain.name} address`);
  }

  switch (chain.kind) {
    case "evm":
      return sendEvm(seed, request);
    case "bitcoin":
      return sendBitcoin(seed, request);
    case "sui":
      return sendSui(seed, request);
    default:
      throw new Error(`${chain.name} sends through FROST/Swig, not here`);
  }
}

export async function estimateFee(
  chainId: ChainId,
  request: SendRequest,
  fromAddress: string
): Promise<FeeEstimate> {
  const chain = getChain(chainId);
  if (!chain) throw new Error(`Unknown chain: ${chainId}`);

  switch (chain.kind) {
    case "evm":
      return estimateEvmFee(chainId, request);
    case "bitcoin":
      return estimateBitcoinFee(fromAddress, request);
    case "sui":
      return estimateSuiFee();
    default:
      throw new Error(`No fee estimator for ${chain.name}`);
  }
}
