import { getChain } from "@/lib/chains/registry";

// Which coins carry a verified mark.
//
// Two rules, and both are deliberate:
//
//   1. Every supported chain's OWN coin. SOL, ETH, BTC, POL, BNB, HYPE, SUI —
//      these are the assets the wallet derives an address for, so they are
//      verified by definition of being the network itself. Nothing to curate.
//
//   2. A curated allowlist of mints. There is no on-chain fact that makes a
//      memecoin legitimate, so this is a human decision and it lives here
//      rather than in a database column: it wants a code review, not a row
//      anyone with SQL access can add themselves to.
//
// The check is chain-qualified. The same contract address exists on several EVM
// chains (CREATE2 lands identical addresses), so a bare address match could
// verify an impostor on another network.

/** Curated verified mints, keyed by chain. Add with a review, not by hand in prod. */
const VERIFIED_MINTS: Partial<Record<string, ReadonlySet<string>>> = {
  // ansem
  solana: new Set(["9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump"]),
};

export interface VerifiableToken {
  /** Mint / contract. Absent or `native:<chain>` for a chain's own coin. */
  mint?: string | null;
  chain?: string | null;
  /** True for the chain's own coin, when the caller already knows. */
  isNative?: boolean;
}

export function isVerifiedToken(token: VerifiableToken): boolean {
  const chainId = token.chain ?? "solana";
  if (!getChain(chainId)) return false;

  const mint = token.mint ?? "";
  // A chain's own coin. `native:<chain>` is the synthesized id the aggregated
  // token list uses for coins that have no contract.
  if (token.isNative || !mint || mint.startsWith("native:")) return true;

  return VERIFIED_MINTS[chainId]?.has(mint) ?? false;
}
