// Community boost packs — shared between the shop UI (builds the USDC
// transfer) and the community router (verifies it on-chain and grants).
// Whole-USD prices; paid in USDC (6 decimals) to the premium treasury.

export interface BoostPack {
    boosts: number;
    usd: number;
}

export const BOOST_PACKS: BoostPack[] = [
    { boosts: 1, usd: 3 },
    { boosts: 5, usd: 12 },
    { boosts: 10, usd: 20 },
];

/**
 * Where boost payments land: same destination as premium collections (cold
 * multisig in prod, single treasury as fallback). Kept env-direct so the
 * client bundle doesn't pull @solana/kit just to parse an address.
 */
export function getBoostTreasuryOwner(): string {
    const pk =
        process.env.NEXT_PUBLIC_COLLECTION_DESTINATION ??
        process.env.NEXT_PUBLIC_PREMIUM_MERCHANT_PUBKEY ??
        process.env.NEXT_PUBLIC_TREASURY_PUBKEY;
    if (!pk) throw new Error("Treasury pubkey not configured");
    return pk;
}
