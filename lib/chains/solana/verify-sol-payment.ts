import { TRPCError } from "@trpc/server";
import { getRpcUrl } from "@/lib/chains/solana/subscriptions/constants";

// Native-SOL sibling of verify-usdc-payment.ts, for the peer-to-peer features
// priced in lamports (paywalled posts, DM unlocks) instead of USDC-to-treasury.
// Same contract: fetch the confirmed transaction and independently confirm a
// real SystemProgram transfer of >= `expectedLamports` landed at `destination`
// — never trust a bare signature string the client hands over.

export async function verifySolPayment(
    txSignature: string,
    expectedLamports: number,
    destination: string,
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
        if (ix.program !== "system") return false;
        const { type, info } = ix.parsed ?? {};
        if (type !== "transfer" || !info) return false;
        if (info.destination !== destination) return false;
        const lamports = info.lamports as number | undefined;
        return typeof lamports === "number" && lamports >= expectedLamports;
    });
    if (!paid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No matching SOL payment to the recipient in that transaction" });
    }
}
