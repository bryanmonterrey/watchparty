/**
 * One-time (idempotent) provisioning of the platform-premium on-chain plans.
 * Creates a Subscriptions-program Plan for every self-serve tier × billing
 * cycle (8 plans) owned by the treasury, then mirrors the PDAs into the
 * `premium_plans` table for premium.getPlans.
 *
 * Run:  bun run scripts/premium/create-plans.ts
 * Needs: TREASURY_PRIVATE_KEY, NEXT_PUBLIC_TREASURY_PUBKEY (or
 *        NEXT_PUBLIC_PREMIUM_MERCHANT_PUBKEY), an RPC URL, and DB env.
 */
import { fetchMaybePlan, findPlanPda, getCreatePlanOverlayInstructionAsync } from "@solana/subscriptions";
import {
    findAssociatedTokenPda,
    getCreateAssociatedTokenIdempotentInstruction,
} from "@solana-program/token";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { premiumPlans } from "@/db/schema/content";
import { eq, and } from "drizzle-orm";
import { getKitRpc } from "@/lib/chains/solana/subscriptions/client";
import { getTreasurySigner, sendAsTreasury } from "@/lib/chains/solana/subscriptions/collector";
import {
    PREMIUM_TOKEN_PROGRAM,
    SUBSCRIPTIONS_PROGRAM_ID,
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
    const signer = await getTreasurySigner();
    const rpc = getKitRpc();
    const merchant = signer.address;

    const [treasuryAta] = await findAssociatedTokenPda({
        owner: merchant,
        mint: USDC_MINT_ADDRESS,
        tokenProgram: PREMIUM_TOKEN_PROGRAM,
    });

    // Ensure the treasury USDC ATA exists (idempotent) — it's the plan destination.
    const ataIx = getCreateAssociatedTokenIdempotentInstruction({
        payer: signer,
        ata: treasuryAta,
        owner: merchant,
        mint: USDC_MINT_ADDRESS,
        tokenProgram: PREMIUM_TOKEN_PROGRAM,
    });
    await sendAsTreasury([ataIx]);
    console.log(`✓ treasury USDC ATA ready: ${treasuryAta}`);

    for (const key of SELF_SERVE_TIERS as TierKey[]) {
        for (const cycle of CYCLES) {
            const planId = planIdFor(key, cycle);
            const amount = priceBaseUnits(key, cycle);
            const periodHours = PERIOD_HOURS[cycle];
            const [planPda] = await findPlanPda(
                { owner: merchant, planId: BigInt(planId) },
                { programAddress: SUBSCRIPTIONS_PROGRAM_ID },
            );

            const label = `${key}/${cycle} (planId ${planId})`;
            const existing = await fetchMaybePlan(rpc, planPda);
            if (!existing.exists) {
                const ix = await getCreatePlanOverlayInstructionAsync({
                    programAddress: SUBSCRIPTIONS_PROGRAM_ID,
                    owner: signer,
                    mint: USDC_MINT_ADDRESS,
                    tokenProgram: PREMIUM_TOKEN_PROGRAM,
                    amount,
                    periodHours: BigInt(periodHours),
                    endTs: BigInt(0),
                    planId: BigInt(planId),
                    pullers: [merchant],
                    destinations: [treasuryAta],
                    metadataUri: `https://watchparty.xyz/premium#${key}-${cycle}`,
                });
                const sig = await sendAsTreasury([ix]);
                console.log(`✓ created ${label} — ${sig}`);
            } else {
                console.log(`• ${label} already on-chain, syncing DB`);
            }

            const plan = await fetchMaybePlan(rpc, planPda);
            const createdAtChain = plan.exists ? Number(plan.data.data.terms.createdAt) : null;

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

    console.log(`\nDone. Provisioned ${SELF_SERVE_TIERS.length * CYCLES.length} plans for merchant ${merchant}.`);
    console.log("Tiers:", SELF_SERVE_TIERS.map((k) => TIERS[k].name).join(", "));
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
