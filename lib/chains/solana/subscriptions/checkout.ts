// CLIENT-side premium checkout. Builds the on-chain subscribe flow with the
// SDK, signs it through the existing wallet-adapter (`sendTransaction`). Heavy
// (@solana/kit + @solana/subscriptions) — import lazily behind the upgrade flow.
import { address as kitAddress, createNoopSigner } from "@solana/kit";
import {
    fetchMaybeSubscriptionAuthority,
    findPlanPda,
    findSubscriptionAuthorityPda,
    findSubscriptionDelegationPda,
    getInitSubscriptionAuthorityOverlayInstructionAsync,
    getSubscribeOverlayInstructionAsync,
} from "@solana/subscriptions";
import {
    findAssociatedTokenPda,
    getCreateAssociatedTokenIdempotentInstruction,
} from "@solana-program/token";
import type { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { getKitRpc } from "./client";
import { sendKitInstructions } from "./compat";
import {
    PREMIUM_TOKEN_PROGRAM,
    SUBSCRIPTIONS_PROGRAM_ID,
    USDC_MINT_ADDRESS,
} from "./constants";

/** Live plan terms the subscriber consents to (from `premium.getPlans`). */
export interface CheckoutPlan {
    merchant: string;
    planId: number;
    /** USDC base units (6 dp), as a string to carry the bigint over the wire. */
    amountBaseUnits: string;
    periodHours: number;
    /** On-chain plan `createdAt` (unix seconds) as a string. */
    createdAt: string;
}

export interface CheckoutArgs {
    userPublicKey: PublicKey;
    connection: Connection;
    sendTransaction: (tx: Transaction, connection: Connection) => Promise<string>;
    plan: CheckoutPlan;
}

export interface CheckoutResult {
    subscribeSignature: string;
    subscriptionAuthorityPda: string;
    subscriptionPda: string;
    delegatorAta: string;
}

async function waitForAuthorityInitId(
    rpc: ReturnType<typeof getKitRpc>,
    saPda: ReturnType<typeof kitAddress>,
    attempts = 8,
): Promise<bigint> {
    for (let i = 0; i < attempts; i++) {
        const acct = await fetchMaybeSubscriptionAuthority(rpc, saPda);
        if (acct.exists) return acct.data.initId;
        await new Promise((r) => setTimeout(r, 750));
    }
    throw new Error("Subscription authority did not initialize in time");
}

export async function runPremiumCheckout({
    userPublicKey,
    connection,
    sendTransaction,
    plan,
}: CheckoutArgs): Promise<CheckoutResult> {
    const rpc = getKitRpc();
    const user = kitAddress(userPublicKey.toBase58());
    const signer = createNoopSigner(user);
    const mint = USDC_MINT_ADDRESS;
    const ctx = { feePayer: userPublicKey, connection, sendTransaction };

    const [saPda] = await findSubscriptionAuthorityPda(
        { user, tokenMint: mint },
        { programAddress: SUBSCRIPTIONS_PROGRAM_ID },
    );
    const [userAta] = await findAssociatedTokenPda({
        owner: user,
        mint,
        tokenProgram: PREMIUM_TOKEN_PROGRAM,
    });

    // 1. One-time: ensure the USDC ATA exists + the SubscriptionAuthority is
    //    initialized (program approves itself as delegate on the ATA). Separate
    //    tx so we can read the authority's initId before consenting to it.
    const existing = await fetchMaybeSubscriptionAuthority(rpc, saPda);
    let initId: bigint;
    if (existing.exists) {
        initId = existing.data.initId;
    } else {
        const ataIx = getCreateAssociatedTokenIdempotentInstruction({
            payer: signer,
            ata: userAta,
            owner: user,
            mint,
            tokenProgram: PREMIUM_TOKEN_PROGRAM,
        });
        const initIx = await getInitSubscriptionAuthorityOverlayInstructionAsync({
            owner: signer,
            payer: signer,
            programAddress: SUBSCRIPTIONS_PROGRAM_ID,
            tokenMint: mint,
            tokenProgram: PREMIUM_TOKEN_PROGRAM,
            userAta,
        });
        await sendKitInstructions([ataIx, initIx], ctx);
        initId = await waitForAuthorityInitId(rpc, saPda);
    }

    // 2. Subscribe to the merchant's plan (consenting to the live terms).
    const subscribeIx = await getSubscribeOverlayInstructionAsync({
        programAddress: SUBSCRIPTIONS_PROGRAM_ID,
        merchant: kitAddress(plan.merchant),
        planId: BigInt(plan.planId),
        subscriber: signer,
        payer: signer,
        tokenMint: mint,
        expectedAmount: BigInt(plan.amountBaseUnits),
        expectedPeriodHours: BigInt(plan.periodHours),
        expectedCreatedAt: BigInt(plan.createdAt),
        expectedSubscriptionAuthorityInitId: initId,
    });
    const subscribeSignature = await sendKitInstructions([subscribeIx], ctx);

    const [planPda] = await findPlanPda(
        { owner: kitAddress(plan.merchant), planId: BigInt(plan.planId) },
        { programAddress: SUBSCRIPTIONS_PROGRAM_ID },
    );
    const [subscriptionPda] = await findSubscriptionDelegationPda(
        { planPda, subscriber: user },
        { programAddress: SUBSCRIPTIONS_PROGRAM_ID },
    );

    return {
        subscribeSignature,
        subscriptionAuthorityPda: saPda,
        subscriptionPda,
        delegatorAta: userAta,
    };
}
