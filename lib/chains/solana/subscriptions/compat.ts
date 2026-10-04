// Bridge: kit Instruction -> legacy web3.js TransactionInstruction, so SDK-built
// instructions can be signed by the app's existing @solana/wallet-adapter flow
// (see components/wallet/wallet-drawer/views/send/send-view.tsx) without
// adopting kit signers / ConnectorKit on the client.
import { isSignerRole, isWritableRole, type Instruction } from "@solana/kit";
import { confirmSignature } from "@/lib/solana/confirm";
import {
    ComputeBudgetProgram,
    type Connection,
    PublicKey,
    Transaction,
    TransactionInstruction,
} from "@solana/web3.js";

export function kitIxToLegacy(ix: Instruction): TransactionInstruction {
    return new TransactionInstruction({
        programId: new PublicKey(ix.programAddress),
        keys: (ix.accounts ?? []).map((a) => ({
            pubkey: new PublicKey(a.address),
            isSigner: isSignerRole(a.role),
            isWritable: isWritableRole(a.role),
        })),
        data: Buffer.from(ix.data ?? new Uint8Array()),
    });
}

export interface SendCtx {
    feePayer: PublicKey;
    connection: Connection;
    sendTransaction: (tx: Transaction, connection: Connection) => Promise<string>;
    /** Compute-unit price (priority fee). Defaults to a modest value. */
    microLamports?: number;
    /** Compute-unit limit. Defaults generously for init + subscribe. */
    computeUnitLimit?: number;
}

/** Wrap kit instructions in a legacy Transaction, send via wallet-adapter, confirm. */
export async function sendKitInstructions(
    kitIxs: Instruction[],
    ctx: SendCtx,
): Promise<string> {
    const tx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: ctx.microLamports ?? 50_000,
        }),
        ComputeBudgetProgram.setComputeUnitLimit({
            units: ctx.computeUnitLimit ?? 400_000,
        }),
        ...kitIxs.map(kitIxToLegacy),
    );
    const { blockhash, lastValidBlockHeight } =
        await ctx.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = ctx.feePayer;
    const signature = await ctx.sendTransaction(tx, ctx.connection);
    await confirmSignature(ctx.connection, 
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
    );
    return signature;
}
