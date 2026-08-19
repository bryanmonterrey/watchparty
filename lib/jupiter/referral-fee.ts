/**
 * Jupiter platform-fee gating.
 *
 * Jupiter pays our 1% into a *referral ATA* that must already exist FOR THAT
 * OUTPUT MINT. Almost none of them do — only WSOL and USDC were ever set up.
 *
 * The trap is that nothing upstream notices. Quoting with `platformFeeBps`
 * succeeds, and `POST /swap` with a feeAccount that does not exist returns
 * **200 with a transaction**. It only dies when it executes, as Jupiter
 * program error 6025 — so the failure surfaces as "the buy didn't work",
 * after the user signed. Measured 2026-08-19 by simulating both cases:
 *
 *     USDC  referral ATA exists  -> build 200, simulation OK
 *     BONK  referral ATA missing -> build 200, simulation InstructionError 6025
 *
 * So the fee is requested only when the destination ATA is really there, and
 * the check lives at QUOTE time: the quote's own `platformFee` is then the
 * single source of truth for whether the swap must carry a `feeAccount`
 * (Jupiter 400s on a quote/swap mismatch in either direction). Never re-check
 * existence at swap time — a cache miss there would drop the feeAccount off a
 * fee-bearing quote and turn a working swap into a 400.
 *
 * Anything unexpected — no referral configured, an RPC blip — resolves to "no
 * fee". Losing 1% is always better than losing the trade.
 */

import { PublicKey } from "@solana/web3.js";

const REFERRAL_PROGRAM = new PublicKey("REFER4ZgmyYx9c6He5XfaTMiGfdLwRnkV4RPp9t9iF3");

/** The app's internal SOL sentinel; Jupiter denominates SOL fees in wSOL. */
const SOL_SENTINEL = "So11111111111111111111111111111111111111111";
const WSOL = "So11111111111111111111111111111111111111112";

export function normalizeFeeMint(mint: string): string {
    return mint === SOL_SENTINEL ? WSOL : mint;
}

export function deriveReferralAta(referralAccount: string, outputMint: string): string {
    const [ata] = PublicKey.findProgramAddressSync(
        [
            Buffer.from("referral_ata"),
            new PublicKey(referralAccount).toBuffer(),
            new PublicKey(normalizeFeeMint(outputMint)).toBuffer(),
        ],
        REFERRAL_PROGRAM,
    );
    return ata.toBase58();
}

// An ATA that exists is not going away, so cache that answer for the isolate's
// life. A missing one may be created at any time, so re-check it periodically.
const PRESENT_TTL_MS = 24 * 60 * 60 * 1000;
const MISSING_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { exists: boolean; at: number }>();

function rpcUrl(): string | null {
    const direct = process.env.HELIUS_RPC_URL ?? process.env.NEXT_PUBLIC_HELIUS_RPC_URL;
    if (direct) return direct;
    const key = process.env.HELIUS_API_KEY;
    return key ? `https://mainnet.helius-rpc.com/?api-key=${key}` : null;
}

async function accountExists(address: string): Promise<boolean> {
    const url = rpcUrl();
    if (!url) return false;
    const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getAccountInfo",
            params: [address, { encoding: "base64" }],
        }),
    });
    if (!res.ok) throw new Error(`getAccountInfo HTTP ${res.status}`);
    const json = (await res.json()) as { result?: { value: unknown } };
    return json?.result?.value != null;
}

/**
 * The referral ATA to bill this swap into, or null if the fee must be skipped.
 * Call at QUOTE time only.
 */
export async function resolveFeeAccount(outputMint: string): Promise<string | null> {
    const referralAccount = process.env.JUPITER_REFERRAL_ACCOUNT;
    if (!referralAccount || !outputMint) return null;

    let ata: string;
    try {
        ata = deriveReferralAta(referralAccount, outputMint);
    } catch {
        return null; // Not a valid mint — let the quote itself report that.
    }

    const hit = cache.get(ata);
    const now = Date.now();
    if (hit && now - hit.at < (hit.exists ? PRESENT_TTL_MS : MISSING_TTL_MS)) {
        return hit.exists ? ata : null;
    }

    try {
        const exists = await accountExists(ata);
        cache.set(ata, { exists, at: now });
        return exists ? ata : null;
    } catch (err) {
        console.warn("[jupiter] referral ATA check failed, skipping platform fee:", err);
        return null;
    }
}
