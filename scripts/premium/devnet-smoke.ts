/**
 * Devnet smoke test for the premium Subscriptions integration. Exercises the
 * SAME @solana/subscriptions SDK calls our app uses (create plan → init
 * authority → subscribe → transferSubscription/first charge), against the
 * program already deployed on devnet, with a throwaway mock USDC mint and fresh
 * keypairs. Validates the on-chain flow WITHOUT spending mainnet SOL or baking
 * real prices into mainnet plans.
 *
 * Run:  bun run scripts/premium/devnet-smoke.ts
 * Note: does NOT cover the wallet-adapter compat bridge (kitIxToLegacy) — it
 *       signs the subscriber side with a kit signer directly.
 */
import {
    address,
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
    fetchMaybeSubscriptionAuthority,
    fetchMaybeSubscriptionDelegation,
    findPlanPda,
    findSubscriptionAuthorityPda,
    findSubscriptionDelegationPda,
    getCreatePlanOverlayInstructionAsync,
    getInitSubscriptionAuthorityOverlayInstructionAsync,
    getSubscribeOverlayInstructionAsync,
    getTransferSubscriptionOverlayInstructionAsync,
} from "@solana/subscriptions";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
    createMint,
    getAccount,
    getOrCreateAssociatedTokenAccount,
    mintTo,
    TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const PROGRAM_ID = address("De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44");
// Prefer the Helius devnet RPC (better airdrop limits than the public faucet).
const RPC_HTTP = process.env.NEXT_PUBLIC_HELIUS_DEVNET_RPC_URL ?? "https://api.devnet.solana.com";
const RPC_WS = RPC_HTTP.replace(/^http/, "ws");
const USDC_DECIMALS = 6;
const AMOUNT = BigInt(1_000_000); // 1 mock-USDC
const PERIOD_HOURS = BigInt(1);
const PLAN_ID = BigInt(3); // 1,2 used earlier runs (2 had the wrong destination)

const rpc = createSolanaRpc(RPC_HTTP);
const rpcSubscriptions = createSolanaRpcSubscriptions(RPC_WS);
const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

async function send(signer: KeyPairSigner, instructions: Instruction[]): Promise<string> {
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    const message = pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayerSigner(signer, m),
        (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        (m) => appendTransactionMessageInstructions(instructions, m),
    );
    const signed = await signTransactionMessageWithSigners(message);
    const sig = getSignatureFromTransaction(signed);
    try {
        await sendAndConfirm(signed as Parameters<typeof sendAndConfirm>[0], { commitment: "confirmed" });
    } catch (e) {
        const ctx = (e as { context?: { logs?: string[] } })?.context;
        if (ctx?.logs) console.error("\nprogram logs:\n" + ctx.logs.join("\n"));
        else console.error("\nraw error:\n" + JSON.stringify(e, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
        throw e;
    }
    return sig;
}

async function airdrop(conn: Connection, pk: PublicKey, sol: number) {
    for (let i = 0; i < 3; i++) {
        try {
            const sig = await conn.requestAirdrop(pk, sol * LAMPORTS_PER_SOL);
            const bh = await conn.getLatestBlockhash();
            await conn.confirmTransaction({ signature: sig, ...bh }, "confirmed");
            return;
        } catch (e) {
            if (i === 2) throw e;
            await new Promise((r) => setTimeout(r, 2000));
        }
    }
}

/** Persist keypairs to /tmp so they can be funded once (faucet.solana.com) and reused. */
function loadOrCreate(path: string): Keypair {
    if (existsSync(path)) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
    const kp = Keypair.generate();
    writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)));
    return kp;
}

async function ensureFunded(conn: Connection, kp: Keypair, minSol: number) {
    const bal = await conn.getBalance(kp.publicKey);
    if (bal >= minSol * LAMPORTS_PER_SOL) return;
    try {
        await airdrop(conn, kp.publicKey, 1);
    } catch {
        throw new Error(
            `Could not airdrop to ${kp.publicKey.toBase58()} (faucet rate-limited). ` +
            `Fund it manually at https://faucet.solana.com then re-run (keypair persisted).`,
        );
    }
}

async function main() {
    const conn = new Connection(RPC_HTTP, "confirmed");
    const merchant = loadOrCreate("/tmp/wp-premium-smoke-merchant.json");
    const subscriber = loadOrCreate("/tmp/wp-premium-smoke-subscriber.json");
    console.log(`merchant   ${merchant.publicKey.toBase58()}`);
    console.log(`subscriber ${subscriber.publicKey.toBase58()}`);

    console.log("→ ensuring devnet SOL…");
    await ensureFunded(conn, merchant, 0.5);
    await ensureFunded(conn, subscriber, 0.5);

    // Mock USDC mint + ATAs (merchant is mint authority). Persist the mint so
    // re-runs reuse it instead of stranding plans on dead mints.
    const mintKp = loadOrCreate("/tmp/wp-premium-smoke-mint.json");
    let mint = mintKp.publicKey;
    if (!(await conn.getAccountInfo(mintKp.publicKey))) {
        console.log("→ creating mock USDC mint…");
        mint = await createMint(conn, merchant, merchant.publicKey, null, USDC_DECIMALS, mintKp);
    } else {
        console.log("• mock USDC mint exists");
    }
    const merchantAta = await getOrCreateAssociatedTokenAccount(conn, merchant, mint, merchant.publicKey);
    const subAta = await getOrCreateAssociatedTokenAccount(conn, subscriber, mint, subscriber.publicKey);
    if ((await getAccount(conn, subAta.address)).amount < AMOUNT * BigInt(4)) {
        await mintTo(conn, merchant, mint, subAta.address, merchant, BigInt(100_000_000)); // top up subscriber
    }
    console.log(`   mint ${mint.toBase58()}`);

    const merchantSigner = await createKeyPairSignerFromBytes(merchant.secretKey);
    const subSigner = await createKeyPairSignerFromBytes(subscriber.secretKey);
    const mintAddr = address(mint.toBase58());
    const merchantAtaAddr = address(merchantAta.address.toBase58());
    const subAtaAddr = address(subAta.address.toBase58());

    const [planPda] = await findPlanPda(
        { owner: merchantSigner.address, planId: PLAN_ID },
        { programAddress: PROGRAM_ID },
    );
    const [saPda] = await findSubscriptionAuthorityPda(
        { user: subSigner.address, tokenMint: mintAddr },
        { programAddress: PROGRAM_ID },
    );
    const [subscriptionPda] = await findSubscriptionDelegationPda(
        { planPda, subscriber: subSigner.address },
        { programAddress: PROGRAM_ID },
    );

    // 1. Merchant publishes a plan.
    if (!(await fetchMaybePlan(rpc, planPda)).exists) {
        console.log("→ createPlan…");
        const createIx = await getCreatePlanOverlayInstructionAsync({
            programAddress: PROGRAM_ID,
            owner: merchantSigner,
            mint: mintAddr,
            tokenProgram: TOKEN_PROGRAM_ADDRESS,
            amount: AMOUNT,
            periodHours: PERIOD_HOURS,
            endTs: BigInt(0),
            planId: PLAN_ID,
            pullers: [merchantSigner.address],
            // Destinations are OWNER WALLETS, not ATAs: at transfer the program
            // checks the receiver ATA's *owner* is whitelisted (else 0x1fa).
            destinations: [merchantSigner.address],
            metadataUri: "https://watchparty.xyz/premium#smoke",
        });
        console.log(`   ${await send(merchantSigner, [createIx])}`);
    } else console.log("• plan exists");
    const plan = await fetchMaybePlan(rpc, planPda);
    if (!plan.exists) throw new Error("plan not found after create");
    const createdAt = plan.data.data.terms.createdAt;

    // 2. Subscriber initialises their SubscriptionAuthority.
    if (!(await fetchMaybeSubscriptionAuthority(rpc, saPda)).exists) {
        console.log("→ initSubscriptionAuthority…");
        const initIx = await getInitSubscriptionAuthorityOverlayInstructionAsync({
            owner: subSigner,
            payer: subSigner,
            programAddress: PROGRAM_ID,
            tokenMint: mintAddr,
            tokenProgram: TOKEN_PROGRAM_ADDRESS,
            userAta: subAtaAddr,
        });
        console.log(`   ${await send(subSigner, [initIx])}`);
    } else console.log("• subscription authority exists");
    const sa = await fetchMaybeSubscriptionAuthority(rpc, saPda);
    if (!sa.exists) throw new Error("subscription authority not found after init");
    const initId = sa.data.initId;

    // 3. Subscriber consents to the plan terms.
    if (!(await fetchMaybeSubscriptionDelegation(rpc, subscriptionPda)).exists) {
        console.log("→ subscribe…");
        const subscribeIx = await getSubscribeOverlayInstructionAsync({
            programAddress: PROGRAM_ID,
            merchant: merchantSigner.address,
            planId: PLAN_ID,
            subscriber: subSigner,
            payer: subSigner,
            tokenMint: mintAddr,
            expectedAmount: AMOUNT,
            expectedPeriodHours: PERIOD_HOURS,
            expectedCreatedAt: createdAt,
            expectedSubscriptionAuthorityInitId: initId,
        });
        console.log(`   ${await send(subSigner, [subscribeIx])}`);
    } else console.log("• subscription exists");

    // 4. Merchant pulls the first period (the "charge at signup" path).
    console.log("→ transferSubscription (first charge)…");
    const balBefore = (await getAccount(conn, merchantAta.address)).amount;
    const chargeIx = await getTransferSubscriptionOverlayInstructionAsync({
        programAddress: PROGRAM_ID,
        amount: AMOUNT,
        caller: merchantSigner,
        delegator: subSigner.address,
        planPda,
        receiverAta: merchantAtaAddr,
        subscriptionPda,
        tokenMint: mintAddr,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    console.log(`   ${await send(merchantSigner, [chargeIx])}`);
    const balAfter = (await getAccount(conn, merchantAta.address)).amount;

    const pulled = balAfter - balBefore;
    console.log(`\nmerchant received ${Number(pulled) / 10 ** USDC_DECIMALS} mUSDC (expected 1)`);
    if (pulled !== AMOUNT) throw new Error(`unexpected pull amount: ${pulled}`);
    console.log("✅ devnet smoke test passed — full subscribe + charge flow works.");
    process.exit(0);
}

main().catch((e) => {
    console.error("\n❌ smoke test failed:", e?.message ?? e);
    process.exit(1);
});
