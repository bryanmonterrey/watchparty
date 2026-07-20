import { TRPCError } from "@trpc/server";
import { getRpcUrl } from "@/lib/chains/solana/subscriptions/constants";

// Shared "did a one-time USDC transfer to our treasury actually happen"
// check — the pattern predictions.ts already proved out for bet placement.
// Verifies on-chain, independent of anything the client claims: fetch the
// confirmed transaction and look for a real SPL transfer of >= `expected`
// USDC base units into `treasuryAta`. Never trust a bare signature string.

export async function verifyUsdcPaymentToTreasury(
    txSignature: string,
    expected: bigint,
    treasuryAta: string,
): Promise<void> {
    const res = await fetch(getRpcUrl(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getTransaction",
            params: [txSignature, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }],
        }),
    });
    const tx = (await res.json())?.result;
    if (!tx) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found yet — wait a moment and retry" });
    if (tx.meta?.err) throw new TRPCError({ code: "BAD_REQUEST", message: "Transaction failed on-chain" });
    if (tx.blockTime && Date.now() / 1000 - tx.blockTime > 2 * 60 * 60) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Payment too old to redeem" });
    }

    type ParsedIx = { program?: string; parsed?: { type?: string; info?: Record<string, unknown> } };
    const instructions: ParsedIx[] = [
        ...(tx.transaction?.message?.instructions ?? []),
        ...((tx.meta?.innerInstructions ?? []) as { instructions: ParsedIx[] }[]).flatMap((i) => i.instructions),
    ];
    const paid = instructions.some((ix) => {
        if (ix.program !== "spl-token") return false;
        const { type, info } = ix.parsed ?? {};
        if ((type !== "transfer" && type !== "transferChecked") || !info) return false;
        if (info.destination !== treasuryAta) return false;
        const raw = type === "transfer"
            ? (info.amount as string | undefined)
            : (info.tokenAmount as { amount?: string } | undefined)?.amount;
        return !!raw && BigInt(raw) >= expected;
    });
    if (!paid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No matching USDC payment to the treasury in that transaction" });
    }
}

/** The treasury's USDC associated token account, base58. */
export async function getTreasuryUsdcAta(treasuryOwner: string): Promise<string> {
    const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");
    const { PublicKey } = await import("@solana/web3.js");
    const { USDC_MINT } = await import("@/lib/premium/tiers");
    return getAssociatedTokenAddressSync(new PublicKey(USDC_MINT), new PublicKey(treasuryOwner), true).toBase58();
}
