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
 *
 * ---
 *
 * The fee is billed to the INPUT mint's account when it can be, and that is
 * what makes the 1% collectable at all. Jupiter charges whichever side you
 * hand it an account for; measured 2026-08-19 buying BONK with 0.01 SOL and
 * passing the wSOL account, the fee account gained exactly 100,000 lamports —
 * 1% of the INPUT — even though the quote still denominates `platformFee` in
 * the output mint. (Do not read a clean simulation as proof of collection:
 * both a real charge and a silent skip simulate fine. The proof is the
 * account's balance delta.)
 *
 * Buys are paid in SOL or USDC and sells settle to them, and those are the two
 * referral ATAs that exist — so preferring the input side and falling back to
 * the output side collects on EVERY coin with no per-mint setup. The
 * alternative was initialising an ATA per mint at ~0.00204 SOL of rent
 * forever, on a board that turns over daily.
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

async function usable(referralAccount: string, mint: string | undefined): Promise<string | null> {
    if (!mint) return null;

    let ata: string;
    try {
        ata = deriveReferralAta(referralAccount, mint);
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

/**
 * The referral ATA to bill this swap into, or null if the fee must be skipped.
 *
 * Input side first: on a buy that is SOL or USDC, so the fee lands in an asset
 * worth holding rather than in the memecoin being bought. Sells fall through to
 * the output side, which is SOL or USDC for the same reason.
 *
 * Call at QUOTE time. The swap must then take the account from the quote
 * (`feeAccountFor`) rather than resolving again.
 */
export async function resolveFeeAccount(
    inputMint: string | undefined,
    outputMint: string | undefined,
): Promise<string | null> {
    const referralAccount = process.env.JUPITER_REFERRAL_ACCOUNT;
    if (!referralAccount) return null;

    return (await usable(referralAccount, inputMint)) ?? (await usable(referralAccount, outputMint));
}

/**
 * The fee account for a quote that already carries a `platformFee`.
 *
 * Network-free and tamper-checked: only the two accounts derivable from OUR
 * referral account are accepted, so a doctored `quoteResponse` cannot redirect
 * the fee somewhere else.
 *
 * Returns undefined rather than guessing when the quote carries no account it
 * recognises. Guessing would mean picking the input side, and on a sell that is
 * precisely the account that does NOT exist — i.e. it would reintroduce the
 * 6025 this module exists to prevent. The caller falls back to a real
 * `resolveFeeAccount` lookup there, which is a network call on a path that
 * should never be taken.
 */
export function feeAccountFor(quoteResponse: {
    inputMint?: string;
    outputMint?: string;
    platformFeeAccount?: string;
}): string | undefined {
    const referralAccount = process.env.JUPITER_REFERRAL_ACCOUNT;
    if (!referralAccount) return undefined;

    const candidates: string[] = [];
    for (const mint of [quoteResponse.inputMint, quoteResponse.outputMint]) {
        if (!mint) continue;
        try {
            candidates.push(deriveReferralAta(referralAccount, mint));
        } catch {
            // Not a valid mint; the quote could not have been billed to it.
        }
    }

    const claimed = quoteResponse.platformFeeAccount;
    return claimed && candidates.includes(claimed) ? claimed : undefined;
}

/**
 * The fee account for a swap build, or undefined when this swap carries no fee.
 *
 * Trusts the account the quote was priced with (network-free), and only falls
 * back to a live lookup when the quote does not carry one — a path that should
 * not happen, since every caller passes the quote object through untouched.
 */
export async function feeAccountForSwap(quoteResponse: {
    platformFee?: unknown;
    inputMint?: string;
    outputMint?: string;
    platformFeeAccount?: string;
} | undefined): Promise<string | undefined> {
    if (!quoteResponse?.platformFee) return undefined;
    return (
        feeAccountFor(quoteResponse) ??
        (await resolveFeeAccount(quoteResponse.inputMint, quoteResponse.outputMint)) ??
        undefined
    );
}
