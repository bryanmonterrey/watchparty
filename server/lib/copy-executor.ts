import { createClient } from "@supabase/supabase-js";
import { db } from "@/db";
import { copySubscriptions, copyOrders, subscriptions, trades } from "@/db/schema/content";
import { and, desc, eq, gt, gte, isNotNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createServerConnection } from "@/lib/solana/server-connection";
import { sendPushToUsers } from "@/lib/push/send";
import { createNotification } from "./notify";

/**
 * Walk-away auto-copy executor (docs/exp-callouts.md §4d).
 *
 * Defense in depth, outermost first:
 * 1. Kill switch — no COPY_EXECUTOR_SECRET env → nothing here runs.
 * 2. On-chain — the executor role's recurring USDC limit is enforced by the
 *    Swig program itself; a bug below cannot exceed the user's signed cap.
 * 3. SQL — per-trader sizing (min of per-copy cap, leader size, remaining
 *    rolling-24h budget from copy_orders) + active-creator-sub gate.
 * 4. Autopause — 3 consecutive failures for a pair pauses the config and
 *    notifies the follower.
 */

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const MIN_COPY_USD = 1;

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

interface LeaderBuy {
    tradeId: string;
    traderId: string;
    traderName: string;
    mint: string;
    label: string;
    usdValue: number | null;
}

interface JupIx {
    programId: string;
    accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
    data: string;
}

async function jupiterSwapInstructions(swigAddress: string, usdcBaseUnits: number, outputMint: string) {
    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    const qs = `inputMint=${USDC_MINT}&outputMint=${outputMint}&amount=${usdcBaseUnits}&slippageBps=100`;
    const quoteRes = await fetch(`https://lite-api.jup.ag/swap/v1/quote?${qs}`, { headers });
    if (!quoteRes.ok) throw new Error(`quote ${quoteRes.status}`);
    const quote = await quoteRes.json();

    const swapRes = await fetch("https://lite-api.jup.ag/swap/v1/swap-instructions", {
        method: "POST",
        headers,
        body: JSON.stringify({ quoteResponse: quote, userPublicKey: swigAddress, wrapAndUnwrapSol: true }),
    });
    if (!swapRes.ok) throw new Error(`swap-instructions ${swapRes.status}`);
    const json = await swapRes.json() as {
        setupInstructions?: JupIx[];
        swapInstruction: JupIx;
        cleanupInstruction?: JupIx | null;
        addressLookupTableAddresses?: string[];
        error?: string;
    };
    if (json.error) throw new Error(json.error);
    return { quote, json };
}

async function executeOneCopy(leader: LeaderBuy, followerId: string, swigAddress: string, roleId: number, usd: number): Promise<string> {
    const { PublicKey, Keypair, TransactionInstruction, TransactionMessage, VersionedTransaction } = await import("@solana/web3.js");
    const { fetchSwig, getSignInstructions } = await import("@swig-wallet/classic");
    const { getCopyExecutorKeypair } = await import("@/lib/swig/swig-server");

    const executor = getCopyExecutorKeypair();
    if (!executor) throw new Error("executor key missing");
    const treasuryKey = process.env.SWIG_TREASURY_PRIVATE_KEY;
    if (!treasuryKey) throw new Error("treasury key missing");
    const treasury = Keypair.fromSecretKey(Buffer.from(treasuryKey, "base64"));
    const connection = createServerConnection();

    const usdcBaseUnits = Math.round(usd * 1e6);
    const { quote, json } = await jupiterSwapInstructions(swigAddress, usdcBaseUnits, leader.mint);

    const toIx = (ix: JupIx) => new TransactionInstruction({
        programId: new PublicKey(ix.programId),
        keys: ix.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
        data: Buffer.from(ix.data, "base64"),
    });
    const innerIxs = [
        ...(json.setupInstructions ?? []).map(toIx),
        toIx(json.swapInstruction),
        ...(json.cleanupInstruction ? [toIx(json.cleanupInstruction)] : []),
    ];

    // Wrap in Swig sign instructions authorized by the executor's capped role.
    const swig = await fetchSwig(connection, new PublicKey(swigAddress));
    const role = swig.roles.find((r) => r.id === roleId);
    if (!role) throw new Error("executor role missing on wallet (revoked?)");
    const signIxs = await getSignInstructions(swig, role.id, innerIxs, false, { payer: treasury.publicKey });

    const luts = [];
    for (const addr of json.addressLookupTableAddresses ?? []) {
        const lut = await connection.getAddressLookupTable(new PublicKey(addr));
        if (lut.value) luts.push(lut.value);
    }

    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const message = new TransactionMessage({
        payerKey: treasury.publicKey,
        recentBlockhash: blockhash,
        instructions: signIxs,
    }).compileToV0Message(luts);
    const tx = new VersionedTransaction(message);
    tx.sign([treasury, executor]);

    const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 2 });

    // Record the follower's trade — server-witnessed; trade-verify confirms.
    await db.insert(trades).values({
        id: nanoid(),
        userId: followerId,
        walletAddress: swigAddress,
        txSignature: signature,
        inputMint: USDC_MINT,
        outputMint: leader.mint,
        inAmountRaw: String(usdcBaseUnits),
        outAmountRaw: String(quote?.outAmount ?? "0"),
        usdValue: usd,
        source: "app",
        status: "pending",
    }).onConflictDoNothing();

    return signature;
}

/** Run every auto-enabled copy config for a leader BUY. Never throws. */
export async function executeAutoCopies(leader: LeaderBuy): Promise<void> {
    try {
        const { copyExecutorAvailable } = await import("@/lib/swig/swig-server");
        if (!copyExecutorAvailable()) return;

        const copiers = await db
            .select({
                followerId: copySubscriptions.followerId,
                maxUsdcPerCopy: copySubscriptions.maxUsdcPerCopy,
                dailyUsdcCap: copySubscriptions.dailyUsdcCap,
                autoCopyRoleId: copySubscriptions.autoCopyRoleId,
            })
            .from(copySubscriptions)
            .innerJoin(subscriptions, and(
                eq(subscriptions.subscriberId, copySubscriptions.followerId),
                eq(subscriptions.creatorId, copySubscriptions.traderId),
                eq(subscriptions.status, "active"),
                gt(subscriptions.currentPeriodEnd, new Date()),
            ))
            .where(and(
                eq(copySubscriptions.traderId, leader.traderId),
                eq(copySubscriptions.paused, false),
                isNotNull(copySubscriptions.autoCopyRoleId),
            ));

        for (const c of copiers) {
            // Rolling-24h spend for this pair (belt-and-braces under the chain cap).
            const [{ spent }] = await db
                .select({ spent: sql<number>`coalesce(sum("usdSize"), 0)::float` })
                .from(copyOrders)
                .where(and(
                    eq(copyOrders.followerId, c.followerId),
                    eq(copyOrders.traderId, leader.traderId),
                    eq(copyOrders.status, "executed"),
                    gte(copyOrders.createdAt, new Date(Date.now() - 24 * 3600e3)),
                ));
            const budget = c.dailyUsdcCap - spent;
            const usd = Math.min(c.maxUsdcPerCopy, leader.usdValue ?? c.maxUsdcPerCopy, budget);

            const orderId = nanoid();
            if (usd < MIN_COPY_USD) {
                await db.insert(copyOrders).values({
                    id: orderId, followerId: c.followerId, traderId: leader.traderId,
                    leaderTradeId: leader.tradeId, usdSize: 0, status: "skipped", reason: "daily cap reached",
                });
                continue;
            }

            const { data: walletData } = await supabase
                .from("encrypted_wallets")
                .select("swig_address")
                .eq("user_id", c.followerId)
                .single();
            if (!walletData?.swig_address) {
                await db.insert(copyOrders).values({
                    id: orderId, followerId: c.followerId, traderId: leader.traderId,
                    leaderTradeId: leader.tradeId, usdSize: 0, status: "skipped", reason: "no swig wallet",
                });
                continue;
            }

            try {
                const signature = await executeOneCopy(leader, c.followerId, walletData.swig_address, c.autoCopyRoleId!, usd);
                await db.insert(copyOrders).values({
                    id: orderId, followerId: c.followerId, traderId: leader.traderId,
                    leaderTradeId: leader.tradeId, usdSize: usd, txSignature: signature, status: "executed",
                });
                await sendPushToUsers([c.followerId], {
                    title: `Copied ${leader.traderName}: bought ${leader.label} — $${Math.round(usd).toLocaleString()}`,
                    body: "Auto-copy executed within your caps. Tap to view.",
                    url: `/${leader.mint}`,
                    tag: `copyexec-${leader.tradeId}`,
                });
            } catch (err) {
                await db.insert(copyOrders).values({
                    id: orderId, followerId: c.followerId, traderId: leader.traderId,
                    leaderTradeId: leader.tradeId, usdSize: usd, status: "failed",
                    reason: err instanceof Error ? err.message.slice(0, 200) : "unknown",
                });
                // 3 consecutive failures for this pair → pause + tell the follower.
                const last3 = await db
                    .select({ status: copyOrders.status })
                    .from(copyOrders)
                    .where(and(eq(copyOrders.followerId, c.followerId), eq(copyOrders.traderId, leader.traderId)))
                    .orderBy(desc(copyOrders.createdAt))
                    .limit(3);
                if (last3.length === 3 && last3.every((o) => o.status === "failed")) {
                    await db.update(copySubscriptions)
                        .set({ paused: true })
                        .where(and(eq(copySubscriptions.followerId, c.followerId), eq(copySubscriptions.traderId, leader.traderId)));
                    await createNotification({
                        userId: c.followerId,
                        type: "system",
                        body: `Auto-copy of ${leader.traderName} paused after 3 failed copies — check your USDC balance, then unpause.`,
                    });
                }
            }
        }
    } catch { /* the executor must never break trade fan-out */ }
}
