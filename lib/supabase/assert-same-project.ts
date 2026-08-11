/**
 * Shout when drizzle and supabase-js are pointed at DIFFERENT Supabase
 * projects.
 *
 * ## The accident this exists to catch
 *
 * The dev-database split (CLAUDE.md) overrides `DATABASE_URL` only. Every
 * `supabase.from(...)` call reads `NEXT_PUBLIC_SUPABASE_URL` instead, so a
 * `.env.local` that redirects the first and not the second leaves the app
 * READING the dev database and WRITING production. That was the live state on
 * 2026-08-11: `DATABASE_URL` on `hghxcuro…`, `NEXT_PUBLIC_SUPABASE_URL` on
 * `ugpzuypo…`.
 *
 * It surfaced only because a wallet created locally for a dev user hit a
 * foreign key in production, where that user does not exist. Writes that don't
 * reference `user` — profile updates, Storage uploads — would have succeeded
 * silently against production from a laptop.
 *
 * ## Warns, never throws
 *
 * Reading production from dev is a legitimate setup (real avatars, real
 * media), so refusing to start would break workflows that are working on
 * purpose. What is never intended is not KNOWING. One unmissable line at
 * startup is the whole job.
 *
 * Server-only: `DATABASE_URL` is not present in the browser, so there is
 * nothing to compare there and the check quietly does nothing.
 */

/** The project ref out of either URL shape Supabase hands out. */
function projectRef(value: string | undefined): string | null {
    if (!value) return null;
    // Pooler connection strings carry it in the user: postgres.<ref>:pw@host
    const pooled = value.match(/postgres\.([a-z0-9]{16,}):/)?.[1];
    if (pooled) return pooled;
    // Everything else has it as the first host label: <ref>.supabase.co,
    // db.<ref>.supabase.co
    try {
        const host = new URL(value).host;
        const first = host.split(".")[0];
        return first === "db" ? host.split(".")[1] ?? null : first;
    } catch {
        return null;
    }
}

let warned = false;

export function assertSameSupabaseProject(): void {
    if (warned) return;                       // module graphs import this more than once
    if (typeof window !== "undefined") return; // no DATABASE_URL in the browser

    const dbRef = projectRef(process.env.DATABASE_URL);
    const apiRef = projectRef(process.env.NEXT_PUBLIC_SUPABASE_URL);
    if (!dbRef || !apiRef || dbRef === apiRef) return;

    warned = true;
    const mask = (r: string) => `${r.slice(0, 8)}…`;
    console.error(
        [
            "",
            "  ┌─ SUPABASE PROJECT MISMATCH ─────────────────────────────────────",
            `  │  drizzle  (DATABASE_URL)            → ${mask(dbRef)}`,
            `  │  supabase (NEXT_PUBLIC_SUPABASE_URL) → ${mask(apiRef)}`,
            "  │",
            "  │  Reads and writes are going to DIFFERENT databases. Anything",
            "  │  using supabase.from(...) or Storage writes the second one —",
            "  │  including wallets, profile updates and uploads.",
            "  │",
            "  │  Override NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
            "  │  and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local to match.",
            "  └─────────────────────────────────────────────────────────────────",
            "",
        ].join("\n"),
    );
}
