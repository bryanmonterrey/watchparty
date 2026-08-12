/**
 * Which database does this checkout actually write to?
 *
 *   bun scripts/db/check-env-target.ts        # exits 1 on a mismatch
 *
 * ## Why the obvious check is not enough
 *
 * The dev split overrides `DATABASE_URL`, which drizzle reads. Every
 * `supabase.from(...)` call and every Storage upload reads
 * `NEXT_PUBLIC_SUPABASE_URL` instead, so a `.env.local` that redirects one and
 * not the other leaves the app READING dev and WRITING production.
 *
 * CLAUDE.md says to override the three `SUPABASE_*` vars too — and on
 * 2026-08-12 all four keys were PRESENT in `.env.local`, while
 * `NEXT_PUBLIC_SUPABASE_URL` still held the production value. Checking that the
 * keys exist reports success; only comparing the resolved project refs catches
 * it. That is the whole point of this script: a var can be overridden and still
 * be wrong, and that failure looks exactly like a fix.
 *
 * Runs under bun so it can import the SAME `projectRef` the app uses. It kept
 * a private copy until 2026-08-12, and that copy is exactly how the custom
 * domain bug survived in one place while being fixed in another.
 *
 * Prints masked refs only, never credentials.
 */
import { readFileSync } from "node:fs";
import { projectRef } from "../../lib/supabase/project-ref";

type Env = Record<string, string>;

function readEnv(file: string): Env {
    const out: Env = {};
    try {
        for (const line of readFileSync(file, "utf8").split("\n")) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
            if (!m) continue;
            let v = m[2].trim();
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
            out[m[1]] = v;
        }
    } catch {
        // absent file is fine
    }
    return out;
}

// Same precedence the app uses: .env.local wins.
const base = readEnv(".env");
const local = readEnv(".env.local");
const get = (k: string): string | undefined => local[k] ?? base[k];
const mask = (r: string | null): string => (r ? `${r.slice(0, 8)}…` : "(none)");
const from = (k: string): string => (k in local ? ".env.local" : k in base ? ".env" : "unset");

const dbRef = projectRef(get("DATABASE_URL"));
const apiRef = projectRef(get("NEXT_PUBLIC_SUPABASE_URL"));
const prodRef = projectRef(base["DATABASE_URL"]);

console.log(`drizzle   DATABASE_URL              -> ${mask(dbRef)}   (${from("DATABASE_URL")})`);
console.log(`supabase  NEXT_PUBLIC_SUPABASE_URL  -> ${mask(apiRef)}   (${from("NEXT_PUBLIC_SUPABASE_URL")})`);
console.log(`          SUPABASE_SERVICE_ROLE_KEY    ${from("SUPABASE_SERVICE_ROLE_KEY")}`);
console.log(`          NEXT_PUBLIC_SUPABASE_ANON_KEY ${from("NEXT_PUBLIC_SUPABASE_ANON_KEY")}`);
console.log(`baseline  production (.env)         -> ${mask(prodRef)}`);

if (!dbRef || !apiRef) {
    console.log("\nincomplete config — cannot compare.");
    process.exit(1);
}

if (dbRef !== apiRef) {
    console.error(
        [
            "",
            "  ┌─ MISMATCH ──────────────────────────────────────────────────────",
            "  │  drizzle reads one database; supabase-js writes another.",
            "  │",
            "  │  Affected write paths: app/api/create-wallet,",
            "  │  lib/wallet/ensure-embedded.ts, server/routers/wallet.ts,",
            "  │  app/api/update-profile, and ALL Storage uploads.",
            "  │",
            `  │  If ${mask(apiRef)} is production, running the app locally —`,
            "  │  or any test fixture — mutates production data.",
            "  └─────────────────────────────────────────────────────────────────",
            "",
        ].join("\n"),
    );
    process.exit(1);
}

console.log(
    apiRef === prodRef
        ? "\nconsistent — but both point at PRODUCTION. Fine if deliberate."
        : "\nconsistent — dev is fully isolated.",
);
