// Shared constants/config for the platform-premium subscriptions integration
// (Solana Subscriptions & Allowances program). Charged in USDC.
import { address, type Address } from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { USDC_MINT } from "@/lib/premium/tiers";

// solana-program/subscriptions, mainnet. See ../solana-subscriptions.
export const SUBSCRIPTIONS_PROGRAM_ID = address(
    "De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44",
);

export const USDC_MINT_ADDRESS: Address = address(USDC_MINT);
// USDC is a classic SPL Token mint (not Token-2022).
export const PREMIUM_TOKEN_PROGRAM: Address = TOKEN_PROGRAM_ADDRESS;

/** HTTP RPC endpoint. Server may override with SOLANA_RPC_URL. */
export function getRpcUrl(): string {
    return (
        process.env.SOLANA_RPC_URL ??
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

/** Merchant = the wallet that owns the premium plans and collects payments. */
export function getMerchantAddress(): Address {
    const pk =
        process.env.NEXT_PUBLIC_PREMIUM_MERCHANT_PUBKEY ??
        process.env.NEXT_PUBLIC_TREASURY_PUBKEY;
    if (!pk) throw new Error("Premium merchant pubkey not configured");
    return address(pk);
}
