import { describe, expect, test } from "bun:test";
import { deriveReferralAta, normalizeFeeMint } from "@/lib/jupiter/referral-fee";

// This file exists because Jupiter accepts a fee account that cannot work.
//
// Measured against the live API on 2026-08-19, quoting 0.01 SOL and simulating
// the built transaction against mainnet state:
//
//   USDC  referral ATA exists   -> POST /swap 200, simulation err = null
//   BONK  referral ATA missing  -> POST /swap 200, simulation err =
//                                  InstructionError [3, { Custom: 6025 }]
//
// Both BUILD. The missing-ATA case only dies when it executes, i.e. after the
// user has signed, so it reads as "the buy didn't work" rather than as a
// configuration problem. Every Solana swap surface in the app shares this one
// pair of procedures (quick-buy, coin trade panel, both wallet drawers, perps,
// the swap card), and only WSOL and USDC ever had an ATA initialised.
//
// The existence check itself needs the network, so it is not tested here.
// What IS tested is the part that would silently bill the wrong address: the
// PDA derivation, and the SOL-sentinel normalization that has to agree between
// the quote and the swap. A wrong derivation would not throw — it would just
// produce an address that never exists, which reintroduces the 6025 for
// every mint at once.

const REFERRAL = "Cp8HX7qN1u2mLBAPAY13SviRLuoJfWCFxTFLJJGoutAo";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const SOL_SENTINEL = "So11111111111111111111111111111111111111111";
const WSOL = "So11111111111111111111111111111111111111112";

describe("referral ATA derivation", () => {
    test("matches the addresses observed on-chain", () => {
        // Both verified live: the USDC one exists and pays, the BONK one does not.
        expect(deriveReferralAta(REFERRAL, USDC)).toBe("3o9aisxvQhQijrhrEZS4VmuKozKnMgyphizJDGwyFCqp");
        expect(deriveReferralAta(REFERRAL, BONK)).toBe("7rh7j5bv9nDbXUhdamxqwhLJ1X2jKwoTKAP5NXYvst5H");
    });

    test("the SOL sentinel derives the wSOL account, not its own", () => {
        // Jupiter denominates a SOL-side fee in wSOL. Deriving from the
        // sentinel would yield an account that can never exist, and the two
        // mints differ only in their last character.
        expect(normalizeFeeMint(SOL_SENTINEL)).toBe(WSOL);
        expect(normalizeFeeMint(BONK)).toBe(BONK);
        expect(deriveReferralAta(REFERRAL, SOL_SENTINEL)).toBe(deriveReferralAta(REFERRAL, WSOL));
    });

    test("is stable for the same inputs", () => {
        expect(deriveReferralAta(REFERRAL, USDC)).toBe(deriveReferralAta(REFERRAL, USDC));
    });
});
