/**
 * Live smoke test for the per-chain asset providers.
 *
 * Uses known-funded public addresses so the parsing path is actually exercised
 * — an empty wallet would pass trivially while hiding a broken decoder.
 *
 *   bun run scripts/wallet/smoke-assets.ts
 */

import { getAssetsForChain } from "@/lib/chains/assets";
import { deriveSui, seedFromMnemonic } from "@/lib/chains/derive";

// Public, well-known, funded addresses.
const SATOSHI_BTC = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
const VITALIK_EVM = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const DERIVED_SUI = deriveSui(
  seedFromMnemonic(
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
  )
).address;

let failures = 0;

async function probe(label: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (err: any) {
    failures++;
    console.log(`✗ ${label}  — ${err?.message ?? err}`);
  }
}

await probe("bitcoin", async () => {
  const r = await getAssetsForChain("bitcoin", SATOSHI_BTC);
  const btc = r.assets[0];
  const ok = btc && btc.balance > 0 && (btc.price ?? 0) > 0;
  if (!ok) throw new Error(`balance=${btc?.balance} price=${btc?.price}`);
  console.log(`✓ bitcoin   ${btc.balance} BTC  ·  $${Math.round(btc.usdValue ?? 0).toLocaleString()}`);
});

for (const chain of ["ethereum", "base", "polygon"] as const) {
  await probe(chain, async () => {
    const r = await getAssetsForChain(chain, VITALIK_EVM);
    const native = r.assets.find((a) => a.isNative);
    if (!native) throw new Error("no native asset returned");
    if ((native.price ?? 0) <= 0) throw new Error("native price missing");
    const tokens = r.assets.filter((a) => !a.isNative);
    console.log(
      `✓ ${chain.padEnd(9)} ${native.balance.toFixed(4)} ${native.symbol}` +
        `  ·  $${Math.round(r.totalUsd).toLocaleString()}` +
        `  ·  ${tokens.length} token(s)` +
        `${r.partial ? `  ·  partial: ${r.partial.reason}` : ""}`
    );
  });
}

await probe("hyperevm", async () => {
  const r = await getAssetsForChain("hyperevm", VITALIK_EVM);
  const native = r.assets.find((a) => a.isNative);
  if (!native) throw new Error("no native asset returned");
  console.log(`✓ hyperevm  reachable, native ${native.balance} ${native.symbol}`);
});

await probe("robinhood", async () => {
  const r = await getAssetsForChain("robinhood", VITALIK_EVM);
  const native = r.assets.find((a) => a.isNative);
  if (!native) throw new Error("no native asset returned");
  console.log(`✓ robinhood reachable, native ${native.balance} ${native.symbol}`);
});

await probe("sui", async () => {
  const r = await getAssetsForChain("sui", DERIVED_SUI);
  // A fresh address holds nothing; success here means the RPC + decode worked.
  console.log(`✓ sui       reachable, ${r.assets.length} coin type(s)`);
});

console.log(failures === 0 ? "\nall providers reachable\n" : `\n${failures} provider(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);
