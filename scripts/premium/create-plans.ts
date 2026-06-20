/**
 * One-time (idempotent) provisioning of the platform-premium on-chain plans.
 * Creates a Subscriptions-program Plan for every self-serve tier × billing cycle
 * (8 plans) owned by the COLLECTOR, with funds whitelisted to the collection
 * destination (multisig in prod), then mirrors the PDAs into `premium_plans`.
 *
 * Run:  bun run scripts/premium/create-plans.ts
 * Needs: COLLECTOR_PRIVATE_KEY (or TREASURY_PRIVATE_KEY), NEXT_PUBLIC_COLLECTOR_PUBKEY
 *        (or NEXT_PUBLIC_TREASURY_PUBKEY), optional NEXT_PUBLIC_COLLECTION_DESTINATION
 *        (multisig), an RPC URL, and DB env. See docs/treasury-security.md.
 */
import { nanoid } from "nanoid";
import { db } from "@/db";
import { premiumPlans } from "@/db/schema/content";
import { eq, and } from "drizzle-orm";
import { createTreasuryPlan } from "@/lib/chains/solana/subscriptions/collector";
import {
    getMerchantAddress,
    USDC_MINT_ADDRESS,
} from "@/lib/chains/solana/subscriptions/constants";
import {
    PERIOD_HOURS,
    SELF_SERVE_TIERS,
    TIERS,
    planIdFor,
    priceBaseUnits,
    type BillingCycle,
    type TierKey,
} from "@/lib/premium/tiers";

const CYCLES: BillingCycle[] = ["monthly", "annual"];

async function main() {
    const merchant = getMerchantAddress(); // collector pubkey (plan owner)

    for (const key of SELF_SERVE_TIERS as TierKey[]) {
        for (const cycle of CYCLES) {
            const planId = planIdFor(key, cycle);
            const amount = priceBaseUnits(key, cycle);
            const periodHours = PERIOD_HOURS[cycle];
            const label = `${key}/${cycle} (planId ${planId})`;

            const { planPda, createdAtChain } = await createTreasuryPlan({
                planId,
                amountBaseUnits: amount,
                periodHours,
            });
            console.log(`✓ ${label} → ${planPda}`);

            const [row] = await db
                .select({ id: premiumPlans.id })
                .from(premiumPlans)
                .where(and(eq(premiumPlans.tierKey, key), eq(premiumPlans.billingCycle, cycle)))
                .limit(1);

            const values = {
                tierKey: key,
                billingCycle: cycle,
                priceUsdcBaseUnits: Number(amount),
                planId,
                planPda,
                collector: merchant,
                mint: USDC_MINT_ADDRESS,
                periodHours,
                createdAtChain,
            };

            if (row) {
                await db.update(premiumPlans).set(values).where(eq(premiumPlans.id, row.id));
            } else {
                await db.insert(premiumPlans).values({ id: nanoid(), ...values });
            }
        }
    }

    console.log(`\nDone. Provisioned ${SELF_SERVE_TIERS.length * CYCLES.length} plans for collector ${merchant}.`);
    console.log("Tiers:", SELF_SERVE_TIERS.map((k) => TIERS[k].name).join(", "));
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
