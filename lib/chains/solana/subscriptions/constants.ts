// Shared constants/config for the platform-premium subscriptions integration
// (Solana Subscriptions & Allowances program). Charged in USDC.
import type { Address } from "@solana/kit";
import { USDC_MINT } from "@/lib/premium/tiers";

// Address is just a branded string — cast instead of calling kit's address()
// so this constants module (imported by several always-loaded routers) keeps
// @solana/kit and @solana-program/token OUT of the eager appRouter graph.
// The values are static/env-provided and validated on-chain by every consumer.

// solana-program/subscriptions, mainnet. See ../solana-subscriptions.
export const SUBSCRIPTIONS_PROGRAM_ID = "De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44" as Address;

export const USDC_MINT_ADDRESS: Address = USDC_MINT as Address;
// USDC is a classic SPL Token mint (not Token-2022) — the canonical Tokenkeg program.
export const PREMIUM_TOKEN_PROGRAM: Address = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address;

/** HTTP RPC endpoint. Server may override with SOLANA_RPC_URL. */
export function getRpcUrl(): string {
    return (
        process.env.SOLANA_RPC_URL ??
        process.env.HELIUS_RPC_URL ??
        process.env.NEXT_PUBLIC_HELIUS_RPC_URL ??
        "https://api.mainnet-beta.solana.com"
    );
}

/** WebSocket endpoint derived from the HTTP one (for kit send-and-confirm). */
export function getRpcWsUrl(): string {
    const explicit = process.env.SOLANA_RPC_WS_URL;
    if (explicit) return explicit;
    return getRpcUrl().replace(/^http/, "ws");
}

/**
 * Merchant = plan owner + puller (the COLLECTOR). The client subscribes against
 * this pubkey and it keys every plan PDA, so it MUST equal COLLECTOR_PRIVATE_KEY's
 * pubkey. Falls back to the single-treasury pubkey when the split isn't set up.
 * See docs/treasury-security.md §2.
 */
export function getMerchantAddress(): Address {
    const pk =
        process.env.NEXT_PUBLIC_COLLECTOR_PUBKEY ??
        process.env.NEXT_PUBLIC_PREMIUM_MERCHANT_PUBKEY ??
        process.env.NEXT_PUBLIC_TREASURY_PUBKEY;
    if (!pk) throw new Error("Collector/merchant pubkey not configured");
    return pk as Address;
}

/**
 * Where collected USDC LANDS (the plan `destinations` whitelist). In production
 * this is a Squads multisig (cold). Falls back to the merchant when unset, which
 * reproduces single-key behaviour. Immutable once a plan is created.
 */
export function getCollectionDestinationOwner(): Address {
    const d = process.env.NEXT_PUBLIC_COLLECTION_DESTINATION;
    return d ? (d as Address) : getMerchantAddress();
}
