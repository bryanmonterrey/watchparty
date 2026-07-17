// Live mainnet + ER smoke for lib/perps/flash.ts (v2) — run:
//   bun scripts/perps/flash-smoke.ts
// Read-only, no signing: market rows from ER oracles, account-state probe,
// ER open-quotes both directions, positions read, and base-layer setup/
// deposit tx building.
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
    getMarkets,
    getAccountState,
    getOpenQuote,
    getPositions,
    prepareSetup,
    prepareDeposit,
} from "../../lib/perps/flash";

const RPC =
    process.env.NEXT_PUBLIC_HELIUS_MAINNET_RPC_URL ||
    process.env.NEXT_PUBLIC_HELIUS_RPC_URL ||
    "https://api.mainnet-beta.solana.com";

async function main() {
    const connection = new Connection(RPC, "confirmed");

    console.log("── markets (ER oracles) ──");
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

    const owner = process.env.NEXT_PUBLIC_TREASURY_PUBKEY
        ? new PublicKey(process.env.NEXT_PUBLIC_TREASURY_PUBKEY)
        : Keypair.generate().publicKey;
    console.log("\n── owner:", owner.toBase58());

    console.log("\n── account state ──");
    const state = await getAccountState(connection, owner);
    console.log(state);

    console.log("\n── ER open quote: SOL long, $100 @ 5x ──");
    const q = await getOpenQuote(connection, owner, "SOL", "long", 100, 5);
    console.log(q);
    if (Math.abs(q.entryPrice / sol.price - 1) > 0.05) throw new Error("entry diverges >5% from oracle");
    if (Math.abs(q.sizeUsd / 500 - 1) > 0.1) throw new Error(`sizeUsd ${q.sizeUsd} vs ~500`);
    if (Math.abs((q.sizeUi * q.entryPrice) / q.sizeUsd - 1) > 0.05) throw new Error("sizeUi/decimals mismatch");

    console.log("\n── ER open quote: BONK short, $50 @ 3x ──");
    const q2 = await getOpenQuote(connection, owner, "BONK", "short", 50, 3);
    console.log(q2);
    if (Math.abs(q2.sizeUsd / 150 - 1) > 0.1) throw new Error("short sizeUsd off");

    console.log("\n── positions (basket read) ──");
    console.log(await getPositions(connection, owner));

    console.log("\n── prepareSetup builds base tx (or null if onboarded) ──");
    const setup = await prepareSetup(connection, owner);
    if (setup) {
        const size = setup.serialize({ requireAllSignatures: false, verifySignatures: false }).length;
        console.log(`setup tx: ${setup.instructions.length} ixs, ${size} bytes (limit 1232)`);
        if (size > 1232) throw new Error("setup tx exceeds packet size");
    } else {
        console.log("already onboarded — no setup tx");
    }

    console.log("\n── prepareDeposit builds base tx ($25) ──");
    const dep = await prepareDeposit(connection, owner, 25);
    const dsize = dep.serialize({ requireAllSignatures: false, verifySignatures: false }).length;
    console.log(`deposit tx: ${dep.instructions.length} ixs, ${dsize} bytes`);
    if (dsize > 1232) throw new Error("deposit tx exceeds packet size");

    console.log("\nALL CHECKS PASSED");
}

main().then(() => process.exit(0)).catch((e) => {
    console.error("SMOKE FAILED:", e);
    process.exit(1);
});
