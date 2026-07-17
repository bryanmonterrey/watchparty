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

    // Strip ComputeBudget — we add our own outside the Swig boundary. But if
    // the inner tx requested a HIGHER unit limit (compute-heavy flows like
    // perps swap+open), honor it: Swig execute adds overhead, never less.
    let requestedUnits = 0;
    const userInstructions = innerInstructions.filter(ix => {
        if (!ix.programId.equals(ComputeBudgetProgram.programId)) return true;
        // setComputeUnitLimit = discriminator 2, u32 LE units
        if (ix.data.length === 5 && ix.data[0] === 2) {
            requestedUnits = Math.max(requestedUnits, ix.data.readUInt32LE(1));
        }
        return false;
    });

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
        ComputeBudgetProgram.setComputeUnitLimit({ units: Math.max(200_000, requestedUnits) }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
        ...signIxs,
    );
    tx.feePayer = feePayer;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    // Session key signs its Swig authority proof
    tx.partialSign(session.keypair);

    return tx.serialize({ requireAllSignatures: false }).toString('base64');
}
