'use client';

import {
    fetchSwig,
    getSignInstructions,
} from '@swig-wallet/classic';
import {
    Connection,
    ComputeBudgetProgram,
    PublicKey,
    Transaction,
    TransactionInstruction,
    VersionedTransaction,
    TransactionMessage,
} from '@solana/web3.js';
import type { ActiveSession } from './session-storage';
import { getRecommendedMicrolamports } from '@/lib/solana/priority-fees';

/**
 * Build the Swig-wrapped instruction set for a transaction.
 * The session keypair authenticates; the fee payer is supplied separately
 * (either the Swig paymaster pubkey or the platform treasury pubkey).
 *
 * Returns a base64-encoded transaction signed by the session key but NOT
 * yet signed by the fee payer — the server relay adds that signature.
 */
export async function buildSwigTransaction(
    session: ActiveSession,
    transactionBase64: string,
    feePayer: PublicKey,
    connection: Connection
): Promise<string> {
    const txBytes = Buffer.from(transactionBase64, 'base64');

    // Extract inner instructions from the provided partial transaction
    let innerInstructions: TransactionInstruction[];
    try {
        const vTx = VersionedTransaction.deserialize(txBytes);
        const msg = TransactionMessage.decompile(vTx.message);
        innerInstructions = msg.instructions;
    } catch {
        const legacyTx = Transaction.from(txBytes);
        innerInstructions = legacyTx.instructions;
    }

    // Strip ComputeBudget — we add our own outside the Swig boundary
    const userInstructions = innerInstructions.filter(
        ix => !ix.programId.equals(ComputeBudgetProgram.programId)
    );

    const swig = await fetchSwig(connection, new PublicKey(session.swigAddress));
    const sessionRole = swig.findRoleBySessionKey(session.keypair.publicKey);
    if (!sessionRole) throw new Error('Session key not found on Swig wallet — session may have expired');

    const signIxs = await getSignInstructions(
        swig,
        sessionRole.id,
        userInstructions,
        false,
        { payer: feePayer },
    );

    const microLamports = await getRecommendedMicrolamports([session.swigAddress]);

    // ComputeBudget must be OUTSIDE Swig-signed instructions
    const tx = new Transaction();
    tx.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
        ...signIxs,
    );
    tx.feePayer = feePayer;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    // Session key signs its Swig authority proof
    tx.partialSign(session.keypair);

    return tx.serialize({ requireAllSignatures: false }).toString('base64');
}
