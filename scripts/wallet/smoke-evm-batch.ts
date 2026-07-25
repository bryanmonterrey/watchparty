/**
 * Verifies the batched EVM portfolio path against the per-chain path.
 *
 * The batched call is what the aggregated tokens list runs on every drawer
 * open, so it has to agree with the slower path it replaced — a batch that
 * silently returns less is a wallet that looks emptier than it is.
 *
 *   bun run scripts/wallet/smoke-evm-batch.ts
 */

import { getEvmAssetsBatch } from "@/lib/chains/assets/evm";
import { getAssetsForChain } from "@/lib/chains/assets";
import { CHAINS } from "@/lib/chains/registry";

const HOLDER = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const evmChains = CHAINS.filter((c) => c.kind === "evm");

console.time("batched");
const batched = await getEvmAssetsBatch(HOLDER, evmChains);
console.timeEnd("batched");

if (!batched) {
  console.log("\n✗ batch returned null (no ALCHEMY_API_KEY?) — falls back per chain\n");
  process.exit(1);
}

console.log(`\nbatched результат: ${batched.size} chain(s)\n`.replace("результат", "result"));
for (const [chainId, result] of batched) {
  const native = result.assets.find((a) => a.isNative);
  console.log(
    `  ${chainId.padEnd(10)} ${result.assets.length} asset(s)  ·  $${Math.round(result.totalUsd).toLocaleString()}` +
      `  ·  native ${native ? `${native.balance.toFixed(4)} ${native.symbol}` : "none"}`
  );
}

// Cross-check one chain against the per-chain provider.
console.log("\ncross-check vs per-chain path (ethereum)");
console.time("per-chain");
const single = await getAssetsForChain("ethereum", HOLDER);
console.timeEnd("per-chain");

const b = batched.get("ethereum");
const bNative = b?.assets.find((a) => a.isNative);
const sNative = single.assets.find((a) => a.isNative);
const nativeMatches = bNative?.rawBalance === sNative?.rawBalance;

console.log(`  native balance identical: ${nativeMatches ? "yes" : `NO (${bNative?.rawBalance} vs ${sNative?.rawBalance})`}`);
console.log(`  batched found ${b?.assets.length} assets, per-chain found ${single.assets.length}`);

process.exit(nativeMatches ? 0 : 1);
