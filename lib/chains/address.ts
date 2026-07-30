// Address shape checks, per chain kind.
//
// Deliberately dependency-free regex, so the send UI can validate a recipient
// without pulling viem or the Sui SDK into the drawer's bundle. This is a
// FORMAT check for UX only — `lib/chains/send` re-validates server-side with
// each chain's real SDK (viem's isAddress does checksum validation this can't),
// and that check is the authority before anything is signed.

import { getChain } from "./registry";
import type { ChainId, ChainKind } from "./types";

const PATTERNS: Record<ChainKind, RegExp> = {
  // base58, no checksum — same rule the Solana wallet UI has always used.
  solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  evm: /^0x[a-fA-F0-9]{40}$/,
  // bech32 (native segwit) and the legacy base58 forms.
  bitcoin: /^(bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/,
  sui: /^0x[0-9a-fA-F]{64}$/,
};

export function isAddressFormat(kind: ChainKind, address: string): boolean {
  return PATTERNS[kind].test(address.trim());
}

/** Format-check `address` for the chain it is about to be sent on. */
export function validateAddressFormat(chainId: ChainId | string, address: string): boolean {
  const chain = getChain(chainId);
  return !!chain && isAddressFormat(chain.kind, address);
}
