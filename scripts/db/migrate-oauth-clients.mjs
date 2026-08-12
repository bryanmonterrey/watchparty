#!/usr/bin/env node
/**
 * One-off data migration for the @better-auth/oauth-provider cutover: copies
 * OAuth client rows from the legacy "oauthApplication" table into the new
 * "oauthClient" shape, and consent rows from "oauthConsent_legacy" into the
 * new upsert-shaped "oauthConsent". Run AFTER db/oauth-provider-v2.sql, on
 * BOTH Supabase projects. Idempotent (inserts skip existing clientIds /
 * consent pairs), so re-running after a partial failure is safe.
 *
 *   bun scripts/db/migrate-oauth-clients.mjs                 # dev project (.env + .env.local)
 *   bun scripts/db/migrate-oauth-clients.mjs --production    # prod project (.env only)
 *
 * What it translates (source-verified against the 1.6.27 plugin dist):
 * - clientSecret: sealed AES-GCM (secret-box) -> unpadded base64url(sha256)
 *   — the plugin's defaultHasher under storeClientSecret: "hashed". This is
 *   what lets existing developer-held secrets keep working after cutover.
 * - redirectUrls (comma-joined text) -> redirectUris text[]
 * - type "web" -> web/confidential; type "public" -> "native" + public: true
 *   + token_endpoint_auth_method "none" (the plugin refuses public clients
 *   whose type isn't native/user-agent-based).
 * - scopes stay NULL so clients inherit the server catalog as it grows.
 * - consents: consentGiven=false rows dropped, newest row per (client, user)
 *   wins (the new table upserts — one row per pair), scopes split on spaces.
 * - tokens are NOT migrated: storage went plaintext -> hashed, so old rows
 *   could never match. They die at cutover by design.
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const PROD = process.argv.includes("--production");

function readEnv(file) {
    const out = {};
    try {
        for (const line of readFileSync(file, "utf8").split("\n")) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
            if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
        }
    } catch { /* absent */ }
    return out;
}
const env = PROD ? readEnv(".env") : { ...readEnv(".env"), ...readEnv(".env.local") };
// UNCONDITIONAL assignment (same as smoke-oauth-flow.mjs): bun auto-loads
// .env.local before this script runs, so a "don't override" guard would keep
// the DEV DATABASE_URL in --production mode.
for (const [k, v] of Object.entries(env)) if (v) process.env[k] = v;

const dbHost = (() => {
    try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return "<unset>"; }
})();
console.log(`\nMigrating OAuth clients on ${PROD ? "PRODUCTION" : "dev"} — DB host: ${dbHost}\n`);

const { db } = await import("../../db/index.ts");
const { openSecret } = await import("../../lib/developer/secret-box.ts");
const { sql } = await import("drizzle-orm");

/** The plugin's defaultHasher: unpadded base64url of sha256(utf8). */
const hashSecret = (secret) => createHash("sha256").update(secret, "utf8").digest("base64url");

// ── clients: oauthApplication -> oauthClient ────────────────────────────────
const legacyClients = await db.execute(sql`
    select id, name, icon, metadata, "clientId", "clientSecret", "redirectUrls",
           type, disabled, "userId", "createdAt", "updatedAt"
    from "oauthApplication"
`);

let migrated = 0, skipped = 0;
for (const row of legacyClients) {
    const isPublic = row.type !== "web";
    const plaintext = row.clientSecret ? await openSecret(row.clientSecret) : null;
    if (row.clientSecret && plaintext === row.clientSecret) {
        // openSecret passes through anything without the enc1: prefix — that
        // would mean hashing ciphertext and silently bricking the client.
        throw new Error(`clientSecret for ${row.clientId} is not sealed (no enc1: prefix) — refusing to hash it blind`);
    }
    let metadata = null;
    try { metadata = row.metadata ? JSON.parse(row.metadata) : null; } catch { metadata = null; }

    // Values interpolated into a raw sql`` carry no column, so nothing picks
    // an encoder for us (the CLAUDE.md Date trap) — everything non-string is
    // ISO-stringified / JSON-stringified and cast explicitly.
    const toTs = (d) => (d instanceof Date ? d.toISOString() : d);
    const inserted = await db.execute(sql`
        insert into "oauthClient" (
            id, "clientId", "clientSecret", disabled, "userId", "createdAt", "updatedAt",
            name, icon, "redirectUris", "tokenEndpointAuthMethod", "grantTypes",
            "responseTypes", public, type, metadata
        ) values (
            ${row.id}, ${row.clientId}, ${plaintext ? hashSecret(plaintext) : null},
            ${row.disabled}, ${row.userId},
            ${toTs(row.createdAt)}::timestamp, ${toTs(row.updatedAt)}::timestamp,
            ${row.name}, ${row.icon},
            ${row.redirectUrls.split(",").filter(Boolean)}::text[],
            ${isPublic ? "none" : "client_secret_post"},
            ${["authorization_code", "refresh_token"]}::text[],
            ${["code"]}::text[],
            ${isPublic}, ${isPublic ? "native" : "web"},
            ${metadata ? JSON.stringify(metadata) : null}::jsonb
        )
        on conflict ("clientId") do nothing
        returning id
    `);
    if (inserted.length) migrated++; else skipped++;
}
console.log(`clients: ${migrated} migrated, ${skipped} already present (of ${legacyClients.length} legacy rows)`);

// ── consents: oauthConsent_legacy -> oauthConsent (newest per pair wins) ────
const legacyConsentTable = await db.execute(sql`
    select from information_schema.tables
    where table_schema = 'public' and table_name = 'oauthConsent_legacy'
`);
if (legacyConsentTable.length) {
    const copied = await db.execute(sql`
        insert into "oauthConsent" (id, "clientId", "userId", scopes, "createdAt", "updatedAt")
        select distinct on (l."clientId", l."userId")
               l.id, l."clientId", l."userId",
               string_to_array(l.scopes, ' '),
               l."createdAt", l."updatedAt"
        from "oauthConsent_legacy" l
        join "oauthClient" c on c."clientId" = l."clientId"
        where l."consentGiven" = true
        order by l."clientId", l."userId", l."createdAt" desc
        on conflict do nothing
        returning id
    `);
    console.log(`consents: ${copied.length} migrated`);
} else {
    console.log("consents: oauthConsent_legacy not found — nothing to migrate (fresh DB?)");
}

const [{ count: clientCount }] = await db.execute(sql`select count(*)::int as count from "oauthClient"`);
const [{ count: consentCount }] = await db.execute(sql`select count(*)::int as count from "oauthConsent"`);
console.log(`\ntotals now: ${clientCount} oauthClient rows, ${consentCount} oauthConsent rows\n`);
process.exit(0);
