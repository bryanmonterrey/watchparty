// Platform premium tiers — the single source of truth for pricing, on-chain
// plan identity, card content, and the comparison table. Charged in USDC
// (dollar-stable) via the Solana Subscriptions & Allowances program; see
// lib/chains/solana/subscriptions/. Prices are fixed USD.

export type BillingCycle = "monthly" | "annual";
export type TierGroup = "individual" | "business";
export type TierKey = "basic" | "premium" | "biz_basic" | "biz_pro" | "biz_custom";

// USDC mint (mainnet) — already used across the app (server/routers/wallet.ts).
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_DECIMALS = 6;

// Annual = N months free vs 12× monthly. One editable knob.
export const ANNUAL_MONTHS_FREE = 2;
const ANNUAL_MULTIPLIER = 12 - ANNUAL_MONTHS_FREE; // 10× monthly

// On-chain plan period, in hours (the program bills in fixed periodHours).
export const PERIOD_HOURS: Record<BillingCycle, number> = {
    monthly: 30 * 24, // 720h
    annual: 365 * 24, // 8760h
};

export interface PremiumTier {
    key: TierKey;
    group: TierGroup;
    name: string;
    tagline: string;
    /** Monthly price in whole USD. 0 for contact-sales (biz_custom). */
    monthlyUsd: number;
    /**
     * Ad credits (in whole USD; 1 credit = $1) included each billing period. The
     * subscription collector grants this to the subscriber on every successful
     * charge (annual cycles grant 12× — a year of monthly allowance). These are
     * non-refundable and expire at period end. Tune freely; 0 = none included.
     */
    adCreditsMonthly: number;
    /**
     * Community boost slots included while the subscription is active (slots,
     * not a consumable — lapse and the tier slots go away; purchased packs from
     * the community shop are permanent and stack on top).
     */
    boostSlots: number;
    /** Self-serve tiers get on-chain plans; biz_custom is contact-sales only. */
    selfServe: boolean;
    /** Center/recommended card in its group. */
    highlighted?: boolean;
    /**
     * Stable base planId for the MONTHLY on-chain plan. The ANNUAL plan uses
     * baseId + 1. Never reuse/reorder these — they key the on-chain Plan PDAs.
     */
    planIdMonthly: number;
    /** Bullets shown on the tier card. */
    features: string[];
}

export const TIERS: Record<TierKey, PremiumTier> = {
    basic: {
        key: "basic",
        group: "individual",
        name: "Basic",
        tagline: "For everyday viewers",
        monthlyUsd: 9,
        adCreditsMonthly: 10,
        boostSlots: 2,
        selfServe: true,
        planIdMonthly: 1,
        features: [
            "Verified badge",
            "Reply boost",
            "Ad-free viewing",
            "Longer posts & uploads",
            "Edit posts",
        ],
    },
    premium: {
        key: "premium",
        group: "individual",
        name: "Premium",
        tagline: "For power users & creators",
        monthlyUsd: 36,
        adCreditsMonthly: 50,
        boostSlots: 6,
        selfServe: true,
        highlighted: true,
        planIdMonthly: 3,
        features: [
            "Everything in Basic",
            "Largest reply boost",
            "Creator subscriptions & payouts",
            "Analytics & insights",
            "Highest upload limits",
            "Priority support",
        ],
    },
    biz_basic: {
        key: "biz_basic",
        group: "business",
        name: "Business Basic",
        tagline: "For growing teams",
        monthlyUsd: 199,
        adCreditsMonthly: 200,
        boostSlots: 12,
        selfServe: true,
        planIdMonthly: 5,
        features: [
            "Verified organization badge",
            "Up to 5 affiliated accounts",
            "Team analytics",
            "Standard support",
        ],
    },
    biz_pro: {
        key: "biz_pro",
        group: "business",
        name: "Business Pro",
        tagline: "For established brands",
        monthlyUsd: 999,
        adCreditsMonthly: 1000,
        boostSlots: 30,
        selfServe: true,
        highlighted: true,
        planIdMonthly: 7,
        features: [
            "Everything in Business Basic",
            "Up to 25 affiliated accounts",
            "Advanced analytics & API access",
            "Priority support",
        ],
    },
    biz_custom: {
        key: "biz_custom",
        group: "business",
        name: "Enterprise",
        tagline: "For large organizations",
        monthlyUsd: 0,
        adCreditsMonthly: 0,
        boostSlots: 0,
        selfServe: false,
        planIdMonthly: 0,
        features: [
            "Everything in Business Pro",
            "Unlimited affiliated accounts",
            "Custom integrations & SLAs",
            "Dedicated account manager",
        ],
    },
};

export const INDIVIDUAL_TIERS: TierKey[] = ["basic", "premium"];
export const BUSINESS_TIERS: TierKey[] = ["biz_basic", "biz_pro", "biz_custom"];
/** Tiers that have on-chain plans (everything except contact-sales). */
export const SELF_SERVE_TIERS: TierKey[] = (Object.keys(TIERS) as TierKey[]).filter(
    (k) => TIERS[k].selfServe,
);

// ── Pricing helpers ──────────────────────────────────────────────────────────

export function priceUsd(key: TierKey, cycle: BillingCycle): number {
    const t = TIERS[key];
    if (!t.selfServe) return 0;
    return cycle === "annual" ? t.monthlyUsd * ANNUAL_MULTIPLIER : t.monthlyUsd;
}

/** USDC base units (6 decimals) as a bigint, for on-chain amounts. */
export function priceBaseUnits(key: TierKey, cycle: BillingCycle): bigint {
    return BigInt(priceUsd(key, cycle)) * BigInt(10 ** USDC_DECIMALS);
}

/** Stable on-chain plan id for a (tier, cycle). monthly = base, annual = base+1. */
export function planIdFor(key: TierKey, cycle: BillingCycle): number {
    const base = TIERS[key].planIdMonthly;
    return cycle === "annual" ? base + 1 : base;
}

export function formatUsd(usd: number): string {
    return usd % 1 === 0 ? `$${usd}` : `$${usd.toFixed(2)}`;
}

// ── Comparison table (rendered in the overlay) ───────────────────────────────
// Values: true = ✓, false = ✗, string = a specific value. Keyed by TierKey so
// the table renders whichever columns are visible.

export interface CompareRow {
    label: string;
    values: Partial<Record<TierKey, boolean | string>>;
}
export interface CompareGroup {
    group: string;
    rows: CompareRow[];
}

export const COMPARISON: CompareGroup[] = [
    {
        group: "Enhanced Experience",
        rows: [
            { label: "Ads", values: { basic: "Reduced", premium: "Ad-free", biz_basic: "Ad-free", biz_pro: "Ad-free" } },
            { label: "Reply boost", values: { basic: "Larger", premium: "Largest", biz_basic: "Largest", biz_pro: "Largest" } },
            { label: "Edit posts", values: { basic: true, premium: true, biz_basic: true, biz_pro: true } },
            { label: "Longer posts", values: { basic: true, premium: true, biz_basic: true, biz_pro: true } },
            { label: "Highest upload limits", values: { basic: false, premium: true, biz_basic: true, biz_pro: true } },
            { label: "Community boosts", values: { basic: "2", premium: "6", biz_basic: "12", biz_pro: "30" } },
        ],
    },
    {
        group: "Creator Hub",
        rows: [
            { label: "Creator subscriptions", values: { basic: false, premium: true, biz_basic: true, biz_pro: true } },
            { label: "Get paid to post", values: { basic: false, premium: true, biz_basic: true, biz_pro: true } },
            { label: "Analytics", values: { basic: false, premium: true, biz_basic: "Team", biz_pro: "Advanced" } },
            { label: "API access", values: { basic: false, premium: false, biz_basic: false, biz_pro: true } },
        ],
    },
    {
        group: "Verification & Security",
        rows: [
            { label: "Verified badge", values: { basic: true, premium: true, biz_basic: "Organization", biz_pro: "Organization" } },
            { label: "Affiliated accounts", values: { basic: false, premium: false, biz_basic: "Up to 5", biz_pro: "Up to 25" } },
            { label: "Priority support", values: { basic: false, premium: true, biz_basic: false, biz_pro: true } },
        ],
    },
    {
        group: "Customization",
        rows: [
            { label: "Custom navigation", values: { basic: true, premium: true, biz_basic: true, biz_pro: true } },
            { label: "Highlights tab", values: { basic: false, premium: true, biz_basic: true, biz_pro: true } },
        ],
    },
];
