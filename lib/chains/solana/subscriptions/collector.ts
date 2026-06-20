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
    fetchMaybePlan,
    findPlanPda,
    findSubscriptionDelegationPda,
    getCreatePlanOverlayInstructionAsync,
    getTransferSubscriptionOverlayInstructionAsync,
} from "@solana/subscriptions";
import {
    findAssociatedTokenPda,
    getCreateAssociatedTokenIdempotentInstruction,
    getTransferCheckedInstruction,
} from "@solana-program/token";
import bs58 from "bs58";
import type { Address } from "@solana/kit";
import { USDC_DECIMALS } from "@/lib/premium/tiers";
import {
    getCollectionDestinationOwner,
    getRpcUrl,
    getRpcWsUrl,
    PREMIUM_TOKEN_PROGRAM,
    SUBSCRIPTIONS_PROGRAM_ID,
    USDC_MINT_ADDRESS,
} from "./constants";

// ── Role-split signers (see docs/treasury-security.md §2) ───────────────────
// COLLECTOR  = plan owner + puller; signs provisioning + the collector cron.
//              Cannot redirect funds (plan destinations are immutable).
// PAYOUT     = small hot float; signs creator claims only.
// Both fall back to TREASURY_PRIVATE_KEY when the dedicated keys aren't set,
// reproducing single-key behaviour.

/** Decode a 64-byte secret key in any common format (JSON array / base58 / base64). */
function decodeSecretKey(secret: string): Uint8Array {
    const s = secret.trim();
    if (s.startsWith("[")) return Uint8Array.from(JSON.parse(s) as number[]);
    try {
        return bs58.decode(s); // base58 alphabet excludes +/=, so real base64 throws here
    } catch {
        const b = Buffer.from(s, "base64");
        if (b.length !== 64) throw new Error("private key is not a valid 64-byte secret key");
        return new Uint8Array(b);
    }
}

const signerCache = new Map<string, Promise<KeyPairSigner>>();
function loadSigner(primary: string | undefined, fallback: string | undefined, label: string): Promise<KeyPairSigner> {
    const secret = primary ?? fallback;
    if (!secret) throw new Error(`${label} not configured`);
    const key = secret;
    let s = signerCache.get(key);
    if (!s) {
        s = createKeyPairSignerFromBytes(decodeSecretKey(secret));
        signerCache.set(key, s);
    }
    return s;
}

/** Collector = plan owner + puller. COLLECTOR_PRIVATE_KEY, falling back to TREASURY_PRIVATE_KEY. */
export function getCollectorSigner(): Promise<KeyPairSigner> {
    return loadSigner(process.env.COLLECTOR_PRIVATE_KEY, process.env.TREASURY_PRIVATE_KEY, "COLLECTOR_PRIVATE_KEY/TREASURY_PRIVATE_KEY");
}

/** Payout float = signs creator claims. PAYOUT_FLOAT_PRIVATE_KEY, falling back to TREASURY_PRIVATE_KEY. */
export function getPayoutSigner(): Promise<KeyPairSigner> {
    return loadSigner(process.env.PAYOUT_FLOAT_PRIVATE_KEY, process.env.TREASURY_PRIVATE_KEY, "PAYOUT_FLOAT_PRIVATE_KEY/TREASURY_PRIVATE_KEY");
}

/** @deprecated use getCollectorSigner */
export const getTreasurySigner = getCollectorSigner;

function rpcPair() {
    return {
        rpc: createSolanaRpc(getRpcUrl()),
        rpcSubscriptions: createSolanaRpcSubscriptions(getRpcWsUrl()),
    };
}

async function usdcAtaOf(owner: Address): Promise<Address> {
    const [ata] = await findAssociatedTokenPda({
        owner,
        mint: USDC_MINT_ADDRESS,
        tokenProgram: PREMIUM_TOKEN_PROGRAM,
    });
    return ata;
}

/** Sign + send a kit transaction with `signer` as fee payer. */
export async function sendKitTx(signer: KeyPairSigner, instructions: Instruction[]): Promise<string> {
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
    /** Plan owner = collector pubkey (keys the plan PDA). */
    merchant: string;
    planId: number;
    /** USDC base units to pull this period. */
    amountBaseUnits: bigint;
}

/**
 * Pull one period's USDC from a subscriber into the COLLECTION DESTINATION's USDC
 * ATA (the multisig in prod). Signed by the collector (the whitelisted puller) —
 * which can only move funds to the plan's immutable destination, never elsewhere.
 * USDC is classic SPL Token (no transfer hook), so hook accounts are unset.
 */
export async function chargeSubscriber(args: ChargeArgs): Promise<string> {
    const signer = await getCollectorSigner();
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
    const receiverAta = await usdcAtaOf(getCollectionDestinationOwner());

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

    return sendKitTx(signer, [ix]);
}

/**
 * Provision a collector-owned USDC plan (platform tiers + creator tiers).
 * Idempotent. Funds are whitelisted to the COLLECTION DESTINATION (multisig in
 * prod) — `destinations` are OWNER WALLETS, not ATAs (program checks the receiver
 * ATA's owner; see scripts/premium/devnet-smoke.ts / error 0x1fa). Also ensures
 * the destination's USDC ATA exists so the first pull's receiver is ready.
 */
export async function createTreasuryPlan(args: {
    planId: number;
    amountBaseUnits: bigint;
    periodHours: number;
}): Promise<{ planPda: string; createdAtChain: number | null }> {
    const signer = await getCollectorSigner();
    const destinationOwner = getCollectionDestinationOwner();
    const destinationAta = await usdcAtaOf(destinationOwner);
    const [planPda] = await findPlanPda(
        { owner: signer.address, planId: BigInt(args.planId) },
        { programAddress: SUBSCRIPTIONS_PROGRAM_ID },
    );

    if (!(await fetchMaybePlan(rpcPair().rpc, planPda)).exists) {
        const ataIx = getCreateAssociatedTokenIdempotentInstruction({
            payer: signer,
            ata: destinationAta,
            owner: destinationOwner,
            mint: USDC_MINT_ADDRESS,
            tokenProgram: PREMIUM_TOKEN_PROGRAM,
        });
        const planIx = await getCreatePlanOverlayInstructionAsync({
            programAddress: SUBSCRIPTIONS_PROGRAM_ID,
            owner: signer,
            mint: USDC_MINT_ADDRESS,
            tokenProgram: PREMIUM_TOKEN_PROGRAM,
            amount: args.amountBaseUnits,
            periodHours: BigInt(args.periodHours),
            endTs: BigInt(0),
            planId: BigInt(args.planId),
            pullers: [signer.address],
            destinations: [destinationOwner],
            metadataUri: "",
        });
        await sendKitTx(signer, [ataIx, planIx]);
    }

    const plan = await fetchMaybePlan(rpcPair().rpc, planPda);
    return {
        planPda,
        createdAtChain: plan.exists ? Number(plan.data.data.terms.createdAt) : null,
    };
}

/**
 * Pay USDC to a recipient wallet (creator claims) from the PAYOUT FLOAT. Creates
 * the recipient's USDC ATA idempotently. Float is topped up from the multisig.
 */
export async function transferUsdcFromTreasury(
    toWallet: string,
    amountBaseUnits: bigint,
): Promise<string> {
    const signer = await getPayoutSigner();
    const sourceAta = await usdcAtaOf(signer.address);
    const owner = kitAddress(toWallet);
    const recipientAta = await usdcAtaOf(owner);
    const ataIx = getCreateAssociatedTokenIdempotentInstruction({
        payer: signer,
        ata: recipientAta,
        owner,
        mint: USDC_MINT_ADDRESS,
        tokenProgram: PREMIUM_TOKEN_PROGRAM,
    });
    const transferIx = getTransferCheckedInstruction({
        source: sourceAta,
        mint: USDC_MINT_ADDRESS,
        destination: recipientAta,
        authority: signer,
        amount: amountBaseUnits,
        decimals: USDC_DECIMALS,
    });
    return sendKitTx(signer, [ataIx, transferIx]);
}

/** Current USDC balance (base units) of the collector's ATA. */
export async function getCollectorUsdcBalance(): Promise<bigint> {
    const signer = await getCollectorSigner();
    const ata = await usdcAtaOf(signer.address);
    const { rpc } = rpcPair();
    try {
        const res = await rpc.getTokenAccountBalance(ata).send();
        return BigInt(res.value.amount);
    } catch {
        return BigInt(0); // ATA not created yet
    }
}

/**
 * Sweep USDC from the collector (hot) to a cold wallet (a multisig). Sending TO
 * cold needs no approval, so this is safe to run unattended. The caller decides
 * the amount (keeping enough hot to cover unclaimed creator obligations).
 */
export async function sweepUsdcToCold(coldWallet: string, amountBaseUnits: bigint): Promise<string> {
    const signer = await getCollectorSigner();
    const sourceAta = await usdcAtaOf(signer.address);
    const cold = kitAddress(coldWallet);
    const coldAta = await usdcAtaOf(cold);
    const ataIx = getCreateAssociatedTokenIdempotentInstruction({
        payer: signer,
        ata: coldAta,
        owner: cold,
        mint: USDC_MINT_ADDRESS,
        tokenProgram: PREMIUM_TOKEN_PROGRAM,
    });
    const transferIx = getTransferCheckedInstruction({
        source: sourceAta,
        mint: USDC_MINT_ADDRESS,
        destination: coldAta,
        authority: signer,
        amount: amountBaseUnits,
        decimals: USDC_DECIMALS,
    });
    return sendKitTx(signer, [ataIx, transferIx]);
}
