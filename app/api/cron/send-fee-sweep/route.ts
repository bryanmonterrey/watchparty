// Collect the 0.5% send fees accrued on EVM transfers.
//
// EVM sends can't carry the fee in the user's own transaction (a transfer pays
// exactly one address), so lib/chains/send/fees.ts records what's owed and this
// route collects it — one transaction per (wallet, chain, token) per run rather
// than a second transaction on every send. Everything else takes its fee
// in-transaction: Solana as an instruction, Bitcoin as an output.
//
// Signs from each user's seed-derived key, the same key sendOnChain uses. The
// gas for the sweep therefore comes out of that wallet, which is why the sweep
// is batched rather than per-send.
//
// Secret-guarded; schedule alongside premium-collect (see docs/premium-ops.md).
import { NextRequest, NextResponse } from "next/server";
import { sendOnChain } from "@/lib/chains/send";
import {
    markSweepFailed,
    markSwept,
    pendingFeeGroups,
} from "@/lib/chains/send/fees";
import { getSeedForUser } from "@/lib/wallet/seed";
import { getChain } from "@/lib/chains/registry";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
    if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const treasury = process.env.TREASURY_EVM_ADDRESS;
    if (!treasury) {
        return NextResponse.json({ skipped: "TREASURY_EVM_ADDRESS not configured" });
    }

    const groups = await pendingFeeGroups();
    let swept = 0;
    let failed = 0;
    const results: { chain: string; contract: string | null; txId?: string; error?: string }[] = [];

    for (const group of groups) {
        const chain = getChain(group.chain);
        if (!chain || chain.kind !== "evm") {
            // Nothing else should ever accrue, but a stale row must not wedge
            // the run for everyone behind it.
            await markSweepFailed(group.ids, `not an EVM chain: ${group.chain}`);
            failed++;
            continue;
        }

        try {
            const seed = await getSeedForUser(group.userId);
            const result = await sendOnChain(seed, {
                chain: chain.id,
                to: treasury,
                amount: group.total.toString(),
                contract: group.contract ?? undefined,
            });
            await markSwept(group.ids, result.txId);
            swept++;
            results.push({ chain: chain.id, contract: group.contract, txId: result.txId });
        } catch (err: any) {
            // Usually an empty gas balance. Rows stay pending so the next run
            // retries — writing them off here would forgive the fee.
            const reason = err?.message ?? "sweep failed";
            await markSweepFailed(group.ids, reason);
            failed++;
            results.push({ chain: chain.id, contract: group.contract, error: reason });
        }
    }

    return NextResponse.json({ groups: groups.length, swept, failed, results });
}
