// Helius webhook receiver for user-wallet SWAP events (registration:
// lib/wallet/user-trades-webhook.ts). A trade-sharing user swapped ANYWHERE
// (Jupiter, Photon, Axiom…) → record it as a confirmed trade so external
// activity counts toward PnL and follower signals, exactly like in-app swaps
// (docs/exp-callouts.md §4a-2). The txSignature unique index dedupes against
// the app-recorded path when both see the same swap.
import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedHeliusRequest } from "@/lib/helius/webhook-secret";
import { db } from "@/db";
import { trades } from "@/db/schema/content";
import { user } from "@/db/schema/auth";
import { linkedWallets } from "@/db/schema/auth/linked-wallets";
import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { fanOutTrade } from "@/server/lib/trade-fanout";
import { getMintPriceMap, WSOL_MINT } from "@/server/lib/mint-prices";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

type RawAmount = { tokenAmount?: string; decimals?: number };
type SwapLeg = { userAccount?: string; mint?: string; rawTokenAmount?: RawAmount };
type HeliusSwapEvent = {
    signature?: string;
    type?: string;
    feePayer?: string;
    events?: {
        swap?: {
            nativeInput?: { account?: string; amount?: string } | null;
            nativeOutput?: { account?: string; amount?: string } | null;
            tokenInputs?: SwapLeg[];
            tokenOutputs?: SwapLeg[];
        };
    };
};

interface ParsedSwap {
    inputMint: string;
    outputMint: string;
    inAmountRaw: string;
    outAmountRaw: string;
    usdHintMint: string | null; // cash mint whose leg prices the trade
    usdHintRaw: number;
    usdHintDecimals: number;
}

function parseSwap(ev: HeliusSwapEvent, wallet: string): ParsedSwap | null {
    const swap = ev.events?.swap;
    if (!swap) return null;

    let inputMint: string | null = null, inAmountRaw = "0";
    let outputMint: string | null = null, outAmountRaw = "0";

    const tokenIn = swap.tokenInputs?.find((l) => l.userAccount === wallet && l.mint);
    if (tokenIn?.mint) {
        inputMint = tokenIn.mint;
        inAmountRaw = tokenIn.rawTokenAmount?.tokenAmount ?? "0";
    } else if (swap.nativeInput?.account === wallet && swap.nativeInput.amount) {
        inputMint = WSOL_MINT;
        inAmountRaw = swap.nativeInput.amount;
    }

    const tokenOut = swap.tokenOutputs?.find((l) => l.userAccount === wallet && l.mint);
    if (tokenOut?.mint) {
        outputMint = tokenOut.mint;
        outAmountRaw = tokenOut.rawTokenAmount?.tokenAmount ?? "0";
    } else if (swap.nativeOutput?.account === wallet && swap.nativeOutput.amount) {
        outputMint = WSOL_MINT;
        outAmountRaw = swap.nativeOutput.amount;
    }

    if (!inputMint || !outputMint || inputMint === outputMint) return null;

    // Which leg can price the trade in USD?
    let usdHintMint: string | null = null, usdHintRaw = 0, usdHintDecimals = 0;
    for (const [mint, raw, legDecimals] of [
        [inputMint, inAmountRaw, tokenIn?.rawTokenAmount?.decimals] as const,
        [outputMint, outAmountRaw, tokenOut?.rawTokenAmount?.decimals] as const,
    ]) {
        if (mint === USDC || mint === USDT) {
            usdHintMint = mint; usdHintRaw = Number(raw); usdHintDecimals = legDecimals ?? 6;
            break;
        }
        if (mint === WSOL_MINT) {
            usdHintMint = mint; usdHintRaw = Number(raw); usdHintDecimals = 9;
        }
    }

    return { inputMint, outputMint, inAmountRaw, outAmountRaw, usdHintMint, usdHintRaw, usdHintDecimals };
}

export async function POST(req: NextRequest) {
    // Only the CURRENT secret — see lib/helius/webhook-secret.ts for why a
    // stale one must be a 401 and not a fallback.
    if (!isAuthorizedHeliusRequest(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let events: HeliusSwapEvent[] = [];
    try {
        const json = await req.json();
        events = Array.isArray(json) ? json : [];
    } catch {
        return NextResponse.json({ ok: true });
    }

    const swaps = events.filter((e) => e.type === "SWAP" && e.signature && e.feePayer);
    if (swaps.length === 0) return NextResponse.json({ ok: true, recorded: 0 });

    // feePayer is the swapping wallet for aggregator swaps — map to sharing users.
    const wallets = [...new Set(swaps.map((e) => e.feePayer!))].slice(0, 500);
    // Match against EVERY linked wallet, not just the account's primary.
    //
    // `user.wallet_address` mirrors only the primary of up to 15, so a trade
    // made from any other wallet found no owner and was silently dropped. The
    // registration side (lib/wallet/user-trades-webhook.ts) had the same bug,
    // which is why it never surfaced: we did not watch those wallets either, so
    // the deliveries this could not attribute never arrived in the first place.
    // Both sides have to move together or one starts discarding the other's
    // work.
    const [linkedOwners, legacyOwners] = await Promise.all([
        db
            .select({ id: user.id, wallet: linkedWallets.address })
            .from(linkedWallets)
            .innerJoin(user, eq(linkedWallets.user_id, user.id))
            .where(and(inArray(linkedWallets.address, wallets), eq(user.shareTrades, true))),
        // Accounts that predate linked_wallets still have only the mirror.
        db
            .select({ id: user.id, wallet: user.wallet_address })
            .from(user)
            .where(and(inArray(user.wallet_address, wallets), eq(user.shareTrades, true))),
    ]);
    // Linked rows win on collision: both resolve to the same account anyway,
    // since an address belongs to exactly one user.
    const ownerByWallet = new Map(
        [...legacyOwners, ...linkedOwners].map((o) => [o.wallet!, o.id]),
    );
    if (ownerByWallet.size === 0) return NextResponse.json({ ok: true, recorded: 0 });

    const solPrice = (await getMintPriceMap([WSOL_MINT])).get(WSOL_MINT)?.priceUsd ?? null;

    let recorded = 0;
    for (const ev of swaps) {
        const userId = ownerByWallet.get(ev.feePayer!);
        if (!userId) continue;
        const parsed = parseSwap(ev, ev.feePayer!);
        if (!parsed) continue;

        let usdValue: number | null = null;
        if (parsed.usdHintMint === USDC || parsed.usdHintMint === USDT) {
            usdValue = parsed.usdHintRaw / 10 ** parsed.usdHintDecimals;
        } else if (parsed.usdHintMint === WSOL_MINT && solPrice) {
            usdValue = (parsed.usdHintRaw / 1e9) * solPrice;
        }

        const id = nanoid();
        const inserted = await db
            .insert(trades)
            .values({
                id,
                userId,
                walletAddress: ev.feePayer!,
                txSignature: ev.signature!,
                inputMint: parsed.inputMint,
                outputMint: parsed.outputMint,
                inAmountRaw: parsed.inAmountRaw,
                outAmountRaw: parsed.outAmountRaw,
                usdValue,
                source: "wallet",
                status: "confirmed",
                confirmedAt: new Date(),
            })
            .onConflictDoNothing() // app path may have recorded this signature already
            .returning({ id: trades.id });
        if (inserted.length > 0) {
            recorded++;
            await fanOutTrade({ id, userId, inputMint: parsed.inputMint, outputMint: parsed.outputMint, usdValue });
        }
    }

    return NextResponse.json({ ok: true, recorded });
}
