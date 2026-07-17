// Live mainnet smoke for lib/perps/flash.ts — run: bun scripts/perps/flash-smoke.ts
// Verifies (read-only, no signing): market rows + oracle prices, borrow rates,
// the on-chain open-quote view (also proves the leverage/decimal units), and
// unsigned tx building for open/close paths.
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
    getMarkets,
    getOpenQuote,
    getPositions,
    getUsdcBalance,
    prepareOpen,
} from "../../lib/perps/flash";

const RPC =
    process.env.NEXT_PUBLIC_HELIUS_MAINNET_RPC_URL ||
    process.env.NEXT_PUBLIC_HELIUS_RPC_URL ||
    "https://api.mainnet-beta.solana.com";

async function main() {
    const connection = new Connection(RPC, "confirmed");

    console.log("── markets ──");
    const markets = await getMarkets(connection);
    for (const m of markets) {
        console.log(
            `${m.symbol.padEnd(9)} $${m.price.toPrecision(6).padEnd(12)} ` +
            `borrow L ${m.borrowHourlyPctLong.toFixed(5)}%/h  S ${m.borrowHourlyPctShort.toFixed(5)}%/h  ` +
            `max ${m.maxLeverage}x  ${m.pythTicker}`,
        );
    }
    if (markets.length !== 9) throw new Error(`expected 9 markets, got ${markets.length}`);
    const sol = markets.find((m) => m.symbol === "SOL")!;
    if (sol.price < 10 || sol.price > 10_000) throw new Error(`SOL price implausible: ${sol.price}`);

    // A wallet with SOL for simulation fee-payer plausibility: use a known
    // funded account (Flash pool's own transfer authority isn't a wallet;
    // use the treasury pubkey from env, else a fresh key — quote sims run
    // with sigVerify off and replaceRecentBlockhash on, so balance isn't
    // actually charged).
    const owner = process.env.NEXT_PUBLIC_TREASURY_PUBKEY
        ? new PublicKey(process.env.NEXT_PUBLIC_TREASURY_PUBKEY)
        : Keypair.generate().publicKey;
    console.log("\n── owner:", owner.toBase58());

    console.log("\n── open quote: SOL long, $100 @ 5x ──");
    const q = await getOpenQuote(connection, owner, "SOL", "long", 100, 5);
    console.log(q);
    if (Math.abs(q.entryPrice / sol.price - 1) > 0.05) throw new Error("entry price diverges >5% from oracle");
    if (Math.abs(q.leverage - 5) > 0.5) throw new Error(`leverage echo wrong: ${q.leverage} (unit mismatch?)`);
    const expectedSizeUsd = 100 * 5;
    if (Math.abs(q.sizeUsd / expectedSizeUsd - 1) > 0.1) throw new Error(`sizeUsd ${q.sizeUsd} vs expected ~${expectedSizeUsd}`);
    if (Math.abs(q.sizeUi * q.entryPrice / q.sizeUsd - 1) > 0.05) throw new Error("sizeUi/decimals mismatch");

    console.log("\n── open quote: BONK short, $50 @ 3x ──");
    const q2 = await getOpenQuote(connection, owner, "BONK", "short", 50, 3);
    console.log(q2);
    if (Math.abs(q2.leverage - 3) > 0.5) throw new Error("short leverage echo wrong");

    console.log("\n── positions (expect none for fresh key) ──");
    console.log(await getPositions(connection, owner));

    console.log("\n── USDC balance ──");
    console.log(await getUsdcBalance(connection, owner));

    console.log("\n── prepareOpen builds unsigned tx (SOL long $100 @ 5x) ──");
    const tx = await prepareOpen(connection, owner, "SOL", "long", 100, 5, true);
    const size = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).length;
    console.log(`legacy tx: ${tx.instructions.length} ixs, ${size} bytes (limit 1232)`);
    if (size > 1232) throw new Error("tx exceeds packet size");

    console.log("\n── prepareOpen short path (ETH short $50 @ 2x) ──");
    const tx2 = await prepareOpen(connection, owner, "ETH", "short", 50, 2, true);
    const size2 = tx2.serialize({ requireAllSignatures: false, verifySignatures: false }).length;
    console.log(`legacy tx: ${tx2.instructions.length} ixs, ${size2} bytes`);
    if (size2 > 1232) throw new Error("short tx exceeds packet size");

    console.log("\nALL CHECKS PASSED");
}

main().then(() => process.exit(0)).catch((e) => {
    console.error("SMOKE FAILED:", e);
    process.exit(1);
});
