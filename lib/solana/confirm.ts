import type { Connection, Finality, RpcResponseAndContext, SignatureResult, TransactionConfirmationStatus } from "@solana/web3.js";

// Confirm a signature by POLLING getSignatureStatuses.
//
// web3.js's `connection.confirmTransaction` learns that a transaction landed
// from the WEBSOCKET `onSignature` subscription and only polls the block
// height — so on a connection that has no websocket it never hears the
// confirmation and reports "block height exceeded" for a transaction that
// finalized fine. That is every browser connection here: they go through
// /api/rpc, which is HTTP only. On 2026-10-04 the owner's $BRYAN launch hit
// exactly that — the config transaction finalized on-chain, the client threw,
// the second transaction was never sent, and 0.006 SOL of rent was spent on a
// config nothing would use.
//
// Same return shape as confirmTransaction so call sites swap one-for-one.
// Expiry is still honoured: once the block height passes lastValidBlockHeight
// one last status check decides (landed vs. genuinely dropped).

export class SignatureExpiredError extends Error {
    constructor(readonly signature: string) {
        super(`Transaction ${signature} was not confirmed before its blockhash expired`);
        this.name = "SignatureExpiredError";
    }
}

type Strategy = { signature: string; blockhash?: string; lastValidBlockHeight?: number };

const RANK: Record<TransactionConfirmationStatus, number> = { processed: 0, confirmed: 1, finalized: 2 };
const POLL_MS = 1500;
/** Without a lastValidBlockHeight (signature-only callers) give up after this long. */
const FALLBACK_TIMEOUT_MS = 90_000;

export async function confirmSignature(
    connection: Connection,
    strategyOrSignature: Strategy | string,
    commitment: Finality = "confirmed",
): Promise<RpcResponseAndContext<SignatureResult>> {
    const strategy = typeof strategyOrSignature === "string" ? { signature: strategyOrSignature } : strategyOrSignature;
    const { signature, lastValidBlockHeight } = strategy;
    const want = RANK[commitment];
    const started = Date.now();

    const check = async (searchHistory = false) => {
        const res = await connection.getSignatureStatuses([signature], { searchTransactionHistory: searchHistory });
        const st = res.value[0];
        if (!st) return null;
        if (st.err) return { context: res.context, value: { err: st.err } };
        if (st.confirmationStatus && RANK[st.confirmationStatus] >= want) return { context: res.context, value: { err: null } };
        return null;
    };

    for (;;) {
        const done = await check();
        if (done) return done;

        if (lastValidBlockHeight != null) {
            const height = await connection.getBlockHeight(commitment);
            if (height > lastValidBlockHeight) {
                // The blockhash is dead, but the transaction may still have
                // landed in its last valid slots — ask once more, with history.
                const last = await check(true);
                if (last) return last;
                throw new SignatureExpiredError(signature);
            }
        } else if (Date.now() - started > FALLBACK_TIMEOUT_MS) {
            const last = await check(true);
            if (last) return last;
            throw new SignatureExpiredError(signature);
        }

        await new Promise((r) => setTimeout(r, POLL_MS));
    }
}
