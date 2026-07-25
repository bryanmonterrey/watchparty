/**
 * Live smoke test for the per-chain activity providers.
 *
 * Uses public addresses with real history — an empty address would pass while
 * hiding a broken decoder.
 *
 *   bun run scripts/wallet/smoke-activity.ts
 */

import { getActivityForChain } from "@/lib/chains/activity";

const SATOSHI_BTC = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
const VITALIK_EVM = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
// Sui Foundation-era address with public activity.
const ACTIVE_SUI = "0x0000000000000000000000000000000000000000000000000000000000000005";

let failures = 0;

async function probe(label: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (err: any) {
    failures++;
    console.log(`✗ ${label}  — ${err?.message ?? err}`);
  }
}

function summarize(label: string, rows: Awaited<ReturnType<typeof getActivityForChain>>) {
  if (rows.length === 0) {
    console.log(`· ${label.padEnd(9)} no history returned`);
    return;
  }
  const newest = rows[0];
  const ordered = rows.every((r, i) => i === 0 || rows[i - 1].timestamp >= r.timestamp);
  const dated = rows.filter((r) => r.timestamp > 0).length;
  console.log(
    `✓ ${label.padEnd(9)} ${rows.length} tx  ·  newest ${new Date(newest.timestamp * 1000)
      .toISOString()
      .slice(0, 10)} ${newest.isOutgoing ? "out" : "in"} ${newest.amount} ${newest.symbol}` +
      `  ·  ${dated}/${rows.length} timestamped  ·  ${ordered ? "ordered" : "UNORDERED"}`
  );
  if (!ordered) failures++;
}

await probe("bitcoin", async () => {
  summarize("bitcoin", await getActivityForChain("bitcoin", SATOSHI_BTC, 10));
});

for (const chain of ["ethereum", "base", "polygon"] as const) {
  await probe(chain, async () => {
    summarize(chain, await getActivityForChain(chain, VITALIK_EVM, 10));
  });
}

await probe("sui", async () => {
  summarize("sui", await getActivityForChain("sui", ACTIVE_SUI, 10));
});

console.log(failures === 0 ? "\nactivity providers OK\n" : `\n${failures} failed\n`);
process.exit(failures === 0 ? 0 : 1);
