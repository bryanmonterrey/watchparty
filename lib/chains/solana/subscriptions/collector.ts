// SERVER-only. Signs with the treasury keypair via @solana/kit (no wallet
// adapter). Used by the scheduled collector route to auto-pull due premium
// subscribers, and by the plan-provisioning script. Never import from client code.
import "server-only";
import {
    address as kitAddress,
    appendTransactionMessageInstructions,
    createKeyPairSignerFromBytes,
    createSolanaRpc,
    createSolanaRpcSubscriptions,
    createTransactionMessage,
    getSignatureFromTransaction,
    type Instruction,
    type KeyPairSigner,
    pipe,
    sendAndConfirmTransactionFactory,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    signTransactionMessageWithSigners,
} from "@solana/kit";
import {
    findPlanPda,
    findSubscriptionDelegationPda,
    getTransferSubscriptionOverlayInstructionAsync,
} from "@solana/subscriptions";
import { findAssociatedTokenPda } from "@solana-program/token";
import bs58 from "bs58";
import {
    getRpcUrl,
    getRpcWsUrl,
    PREMIUM_TOKEN_PROGRAM,
    SUBSCRIPTIONS_PROGRAM_ID,
    USDC_MINT_ADDRESS,
} from "./constants";

let cachedSigner: Promise<KeyPairSigner> | null = null;

/** Treasury signer = the merchant/puller. Loaded from TREASURY_PRIVATE_KEY (base58). */
export function getTreasurySigner(): Promise<KeyPairSigner> {
    if (!cachedSigner) {
        const secret = process.env.TREASURY_PRIVATE_KEY;
        if (!secret) throw new Error("TREASURY_PRIVATE_KEY not configured");
        cachedSigner = createKeyPairSignerFromBytes(bs58.decode(secret));
    }
    return cachedSigner;
}

function rpcPair() {
    return {
        rpc: createSolanaRpc(getRpcUrl()),
        rpcSubscriptions: createSolanaRpcSubscriptions(getRpcWsUrl()),
    };
}

/** Sign + send a kit transaction with the treasury as fee payer. */
export async function sendAsTreasury(instructions: Instruction[]): Promise<string> {
    const signer = await getTreasurySigner();
    const { rpc, rpcSubscriptions } = rpcPair();
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    const message = pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayerSigner(signer, m),
        (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        (m) => appendTransactionMessageInstructions(instructions, m),
    );
    const signed = await signTransactionMessageWithSigners(message);
    const signature = getSignatureFromTransaction(signed);
    const send = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
    // `signed` carries the blockhash lifetime at runtime (set above); kit's pipe
    // inference widens the lifetime brand, so narrow it back for the send call.
    await send(signed as Parameters<typeof send>[0], { commitment: "confirmed" });
    return signature;
}

export interface ChargeArgs {
    /** Subscriber wallet (delegator). */
    subscriber: string;
    /** Merchant that owns the plan (treasury). */
    merchant: string;
    planId: number;
    /** USDC base units to pull this period. */
    amountBaseUnits: bigint;
}

/**
 * Pull one period's USDC from a subscriber into the treasury's USDC ATA.
 * USDC is classic SPL Token (no transfer hook), so hook accounts are unset.
 */
export async function chargeSubscriber(args: ChargeArgs): Promise<string> {
    const signer = await getTreasurySigner();
    const subscriber = kitAddress(args.subscriber);
    const merchant = kitAddress(args.merchant);

    const [planPda] = await findPlanPda(
        { owner: merchant, planId: BigInt(args.planId) },
        { programAddress: SUBSCRIPTIONS_PROGRAM_ID },
    );
    const [subscriptionPda] = await findSubscriptionDelegationPda(
        { planPda, subscriber },
        { programAddress: SUBSCRIPTIONS_PROGRAM_ID },
    );
    const [receiverAta] = await findAssociatedTokenPda({
        owner: signer.address,
        mint: USDC_MINT_ADDRESS,
        tokenProgram: PREMIUM_TOKEN_PROGRAM,
    });

    const ix = await getTransferSubscriptionOverlayInstructionAsync({
        programAddress: SUBSCRIPTIONS_PROGRAM_ID,
        amount: args.amountBaseUnits,
        caller: signer,
        delegator: subscriber,
        planPda,
        receiverAta,
        subscriptionPda,
        tokenMint: USDC_MINT_ADDRESS,
        tokenProgram: PREMIUM_TOKEN_PROGRAM,
    });

    return sendAsTreasury([ix]);
}
