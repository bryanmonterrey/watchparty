/**
 * Live smoke test for swap quoting. Quotes only — nothing is signed or sent.
 *
 *   bun run scripts/wallet/smoke-swap.ts
 */

import { getSwapQuote, swapSupport, NATIVE_TOKEN } from "@/lib/chains/swap";
import { CHAINS } from "@/lib/chains/registry";

const HOLDER = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

// A liquid stablecoin per chain to quote against.
const TO_TOKEN: Record<string, string> = {
  ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
  polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // USDC
};

let failures = 0;

console.log("\nswap support matrix");
for (const chain of CHAINS) {
  const s = swapSupport(chain.id);
  console.log(
    `  ${chain.name.padEnd(16)} ${s.supported ? `✓ via ${s.provider}` : `— ${s.reason}`}`
  );
}

console.log("\nlive quotes (0.1 native → USDC)");
for (const [chainId, toToken] of Object.entries(TO_TOKEN)) {
  try {
    const quote = await getSwapQuote(
      {
        chain: chainId as any,
        fromToken: NATIVE_TOKEN,
        toToken,
        fromAmount: "100000000000000000", // 0.1
      },
      HOLDER
    );
    const out = Number(quote.toAmount) / 10 ** quote.toToken.decimals;
    console.log(
      `  ✓ ${chainId.padEnd(9)} 0.1 ${quote.fromToken.symbol} → ${out.toFixed(2)} ${quote.toToken.symbol}` +
        `  ·  via ${quote.tool}  ·  tx ${quote.transactionRequest ? "ready" : "MISSING"}`
    );
    if (!quote.transactionRequest) failures++;
  } catch (err: any) {
    failures++;
    console.log(`  ✗ ${chainId.padEnd(9)} ${err?.message ?? err}`);
  }
}

console.log(failures === 0 ? "\nswap quoting OK\n" : `\n${failures} failed\n`);
process.exit(failures === 0 ? 0 : 1);
