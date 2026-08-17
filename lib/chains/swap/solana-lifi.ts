// Signing the Solana half of a LI.FI route.
//
// A route OUT of Solana quotes fine (SOL -> BNB via Relay, measured), but its
// `transactionRequest` is `{ data }` alone: a base64 SERIALIZED SOLANA
// TRANSACTION, not an EVM call. `executeLifiSwap` signs with viem and cannot
// touch it, which is why `crossChainSupport` refused Solana as a source until
// this existed.
//
// Nothing here is novel to the app — `use-quick-buy` already deserializes and
// signs exactly this shape for Jupiter. The only new part is that the signing
// happens SERVER-side from the derived seed, matching how every other chain in
// `lib/chains/swap` executes.

import { getRpcUrl } from "@/lib/chains/solana/subscriptions/constants";
import { deriveSolana } from "../derive";
import type { SwapQuote, SwapResult } from "./types";

/**
 * Sign and broadcast a LI.FI Solana transaction.
 *
 * web3.js is imported dynamically: it is a large dependency and the EVM paths
 * — which are most swaps — must not pay for it, on a worker already close to
 * its bundle ceiling.
 */
export async function executeLifiSolanaSwap(
    seed: Uint8Array,
    quote: SwapQuote,
): Promise<SwapResult> {
    const raw = quote.transactionRequest?.data;
    if (!raw) throw new Error("Quote has no transaction to execute");

    const { Connection, Keypair, VersionedTransaction, Transaction } = await import(
        "@solana/web3.js"
    );

    const derived = deriveSolana(seed);
    // `fromSeed`, NOT `fromSecretKey`: SLIP-0010 ed25519 derivation yields the
    // 32-byte SEED, while fromSecretKey expects the expanded 64-byte key.
    // Passing one to the other throws, or worse, signs as a different account.
    const keypair = Keypair.fromSeed(derived.privateKey);

    // Cheap assertion against a whole class of silent disaster: if this key
    // does not match the address the quote was built for, the swap would be
    // signed by an account that never held the funds. Deriving twice and
    // comparing costs microseconds.
    if (keypair.publicKey.toBase58() !== derived.address) {
        throw new Error("Derived Solana key does not match its own address");
    }

    const bytes = Buffer.from(raw, "base64");

    // LI.FI returns legacy OR versioned transactions depending on the bridge it
    // routes through, and there is no field saying which. Versioned parses
    // first because its deserializer is the stricter of the two.
    let signed: Uint8Array;
    try {
        const tx = VersionedTransaction.deserialize(bytes);
        tx.sign([keypair]);
        signed = tx.serialize();
    } catch {
        const tx = Transaction.from(bytes);
        tx.partialSign(keypair);
        signed = tx.serialize();
    }

    const connection = new Connection(getRpcUrl(), "confirmed");
    const signature = await connection.sendRawTransaction(signed, {
        // The blockhash came from LI.FI moments ago; preflight against a
        // slightly different node mostly produces false failures here.
        skipPreflight: true,
        maxRetries: 3,
    });

    return {
        txId: signature,
        explorerUrl: `https://solscan.io/tx/${signature}`,
        crossChain: quote.toChain !== quote.chain,
    };
}
