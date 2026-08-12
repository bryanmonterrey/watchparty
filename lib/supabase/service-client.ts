import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The service-role client — and the one chokepoint that refuses to write to
 * production from a machine that is reading dev.
 *
 * ## The incident this exists to make impossible
 *
 * The dev split overrides `DATABASE_URL` only. Every `supabase.from(...)` call
 * and every Storage upload reads `NEXT_PUBLIC_SUPABASE_URL`, so a `.env.local`
 * that redirects one and not the other leaves the app READING dev and WRITING
 * production. Verified live on 2026-08-12: `DATABASE_URL` on `hghxcuro…` while
 * all three `SUPABASE_*` vars held production values (`ugpzuypo…`) — present in
 * `.env.local`, and therefore looking overridden, but carrying prod keys.
 *
 * It surfaced once as `encrypted_wallets_user_id_user_id_fk`: a wallet created
 * locally for a DEV user was inserted into PROD, where that user does not
 * exist. That foreign key is the only reason it failed loudly. A write whose
 * row does not reference `user` — a profile update, a Storage upload — would
 * have succeeded silently against production from a laptop.
 *
 * ## Throws in dev, never in production
 *
 * `assertSameSupabaseProject` warns and deliberately does not throw, because
 * reading production from dev is a legitimate setup (real avatars, real media)
 * — and because it runs at import time, where throwing would take down
 * unrelated routes.
 *
 * Writes are different: a dev run writing production is never intended. So this
 * hard-fails, and only outside production, where `NODE_ENV === "production"` in
 * the deployed worker. Local `next dev` and every `scripts/` run (NODE_ENV
 * unset) are covered; the deployed app is untouched.
 *
 * Set `SUPABASE_ALLOW_CROSS_PROJECT_WRITE=1` to override for a deliberate
 * one-off — a backfill against prod from a laptop, say. It has to be typed on
 * purpose, which is the entire point.
 */

/** The project ref out of either URL shape Supabase hands out. */
function projectRef(value: string | undefined): string | null {
    if (!value) return null;
    const pooled = value.match(/postgres\.([a-z0-9]{16,}):/)?.[1];
    if (pooled) return pooled;
    try {
        const host = new URL(value).host;
        const first = host.split(".")[0];
        return first === "db" ? (host.split(".")[1] ?? null) : first;
    } catch {
        return null;
    }
}

/**
 * @throws when drizzle and supabase-js target different projects outside
 *   production — i.e. when this write would land in a database the rest of the
 *   process is not reading.
 */
export function assertWritableTarget(): void {
    if (process.env.NODE_ENV === "production") return;
    if (process.env.SUPABASE_ALLOW_CROSS_PROJECT_WRITE === "1") return;

    const dbRef = projectRef(process.env.DATABASE_URL);
    const apiRef = projectRef(process.env.NEXT_PUBLIC_SUPABASE_URL);
    // Can't tell (no DATABASE_URL in some contexts) → don't block.
    if (!dbRef || !apiRef || dbRef === apiRef) return;

    const mask = (r: string) => `${r.slice(0, 8)}…`;
    throw new Error(
        `Refusing a supabase-js WRITE: drizzle reads ${mask(dbRef)} but supabase-js targets ` +
        `${mask(apiRef)}. This write would land in a different database than the one this ` +
        `process is reading — the encrypted_wallets foreign-key incident. Fix ` +
        `NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY ` +
        `in .env.local (node scripts/db/check-env-target.mjs), or set ` +
        `SUPABASE_ALLOW_CROSS_PROJECT_WRITE=1 if this is deliberate.`,
    );
}

/**
 * Service-role client for privileged writes. Falls back to the anon key when no
 * service-role key is set, matching what every call site already did.
 */
export function serviceClient(): SupabaseClient {
    assertWritableTarget();
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
}
