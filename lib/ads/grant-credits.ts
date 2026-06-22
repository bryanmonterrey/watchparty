// Server-side ad-credit granting from watchparty (the subscription collector).
//
// The ad-credit ledger lives in the liteads `ads` schema of the SAME Supabase DB
// (see openadserver: lib/ads/credits.ts + db/ad_credit_grants.sql). watchparty
// shares that DB but has no drizzle models for the ads schema, so this writes via
// raw SQL, schema-qualified with `ads.` so it never touches watchparty's public
// tables. Mirrors the dashboard's grantCredits primitive: ensure advertiser →
// insert grant. Credits are non-refundable (1 credit = $1 = 1 USDC).
import { db } from "@/db";
import { user } from "@/db/schema/auth/user";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

export type CreditSource = "purchase" | "subscription" | "admin";

/**
 * Ensure a watchparty user has a linked liteads advertiser, creating one (and the
 * public.advertiser_profile link) on first use. Returns the advertiser id.
 * Mirrors the dashboard's getOrCreateAdvertiserId so both apps converge on one
 * advertiser per user.
 */
async function ensureAdvertiserId(userId: string): Promise<number | null> {
    const existing = await db.execute<{ advertiserId: number | null }>(
        sql`select "advertiserId" from public.advertiser_profile where "userId" = ${userId} limit 1`,
    );
    const found = existing[0]?.advertiserId;
    if (found) return found;

    const [u] = await db
        .select({ name: user.name, email: user.email })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);
    if (!u) return null;

    const created = await db.execute<{ id: number }>(
        sql`insert into ads.advertisers (name, contact_email, balance, daily_budget, status, created_at, updated_at)
            values (${u.name}, ${u.email}, 0, 0, 1, now(), now())
            returning id`,
    );
    const advertiserId = created[0]?.id;
    if (!advertiserId) return null;

    await db.execute(
        sql`insert into public.advertiser_profile (id, "userId", "advertiserId", "createdAt", "updatedAt")
            values (${nanoid()}, ${userId}, ${advertiserId}, now(), now())`,
    );
    return advertiserId;
}

/**
 * Grant non-refundable ad credits to a watchparty user. `expiresAt` null = never
 * (purchases / admin); subscription grants pass the period end (use-it-or-lose-it).
 * Returns the grant id, or null if the user couldn't be resolved.
 */
export async function grantCreditsToUser(opts: {
    userId: string;
    amountUsd: number;
    source: CreditSource;
    expiresAt?: Date | null;
    reference?: string | null;
}): Promise<string | null> {
    if (!(opts.amountUsd > 0)) return null;
    const advertiserId = await ensureAdvertiserId(opts.userId);
    if (!advertiserId) return null;

    const grantId = nanoid();
    const amount = opts.amountUsd.toFixed(4);
    await db.execute(
        sql`insert into ads.ad_credit_grants
              (id, advertiser_id, source, amount_usd, remaining_usd, expires_at, reference, created_at, updated_at)
            values (${grantId}, ${advertiserId}, ${opts.source}, ${amount}, ${amount},
                    ${opts.expiresAt ?? null}, ${opts.reference ?? null}, now(), now())`,
    );
    return grantId;
}
