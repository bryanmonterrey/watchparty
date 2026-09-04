#!/usr/bin/env node
/**
 * EMERGENCY edge block for /api/webhooks/helius-trades.
 *
 * 2026-09-04: an OLD Helius account's webhook (its key rotated 2026-08-09,
 * its plan then capped) came back when that plan's cycle reset and delivered
 * ~1,400 POSTs/min. Shrinking OUR webhook changed nothing, and our credit
 * usage did not move — the deliveries are billed to the old account, whose
 * management API answers "max usage reached", so the webhook cannot be
 * deleted from here. The container rejects at 4,096 concurrent connections
 * and every page 500'd.
 *
 * This blocks POSTs to the path at Cloudflare, before the Worker. Helius
 * auto-disables a webhook that fails >=95% over 24h, so the old one dies on
 * its own. Our own webhook is blocked too while this is on — turn it off
 * once the old webhook is deleted from the old account's dashboard.
 *
 *   node scripts/cf/block-helius-trades.mjs on
 *   node scripts/cf/block-helius-trades.mjs off
 *   node scripts/cf/block-helius-trades.mjs status
 *
 * Needs the token to carry Zone -> Firewall Services -> Edit.
 */
import { readFileSync } from "node:fs";

const env = {};
for (const file of [".env", ".env.local"]) {
    try {
        for (const line of readFileSync(file, "utf8").split("\n")) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
            if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
        }
    } catch {}
}
const token = process.env.CF_FIREWALL_TOKEN || env.CLOUDFLARE_API_TOKEN;
if (!token) {
    console.error("No CLOUDFLARE_API_TOKEN in .env");
    process.exit(1);
}
const ZONE = "watchparty.xyz";
const PHASE = "http_request_firewall_custom";
const DESCRIPTION = "block helius-trades webhook POSTs (old Helius account flood, 2026-09-04)";
const EXPRESSION = '(http.request.uri.path eq "/api/webhooks/helius-trades" and http.request.method eq "POST")';
const API = "https://api.cloudflare.com/client/v4";
const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

async function cf(path, init = {}) {
    const res = await fetch(`${API}${path}`, { ...init, headers });
    const json = await res.json();
    if (!json.success) throw new Error(`${init.method ?? "GET"} ${path}: ${JSON.stringify(json.errors)}`);
    return json.result;
}

const mode = process.argv[2] ?? "status";
const zones = await cf(`/zones?name=${ZONE}`);
const zoneId = zones[0]?.id;
if (!zoneId) throw new Error(`zone ${ZONE} not visible to this token`);

let ruleset = null;
try {
    ruleset = await cf(`/zones/${zoneId}/rulesets/phases/${PHASE}/entrypoint`);
} catch (err) {
    if (!String(err.message).includes("10003")) throw err; // 10003 = no ruleset yet
}
const existing = ruleset?.rules?.find((r) => r.description === DESCRIPTION) ?? null;

if (mode === "status") {
    console.log(existing ? `rule ${existing.id}: enabled=${existing.enabled}` : "no rule");
    process.exit(0);
}

if (mode === "on") {
    if (existing) {
        await cf(`/zones/${zoneId}/rulesets/${ruleset.id}/rules/${existing.id}`, {
            method: "PATCH",
            body: JSON.stringify({ action: "block", expression: EXPRESSION, description: DESCRIPTION, enabled: true }),
        });
        console.log(`rule ${existing.id} enabled`);
    } else if (ruleset) {
        const r = await cf(`/zones/${zoneId}/rulesets/${ruleset.id}/rules`, {
            method: "POST",
            body: JSON.stringify({ action: "block", expression: EXPRESSION, description: DESCRIPTION, enabled: true }),
        });
        console.log(`rule added to ruleset ${r.id}`);
    } else {
        const r = await cf(`/zones/${zoneId}/rulesets`, {
            method: "POST",
            body: JSON.stringify({
                name: "watchparty custom rules",
                kind: "zone",
                phase: PHASE,
                rules: [{ action: "block", expression: EXPRESSION, description: DESCRIPTION, enabled: true }],
            }),
        });
        console.log(`ruleset ${r.id} created with the block rule`);
    }
    console.log("BLOCKING POST /api/webhooks/helius-trades at the edge");
    process.exit(0);
}

if (mode === "off") {
    if (!existing) {
        console.log("no rule to disable");
        process.exit(0);
    }
    await cf(`/zones/${zoneId}/rulesets/${ruleset.id}/rules/${existing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "block", expression: EXPRESSION, description: DESCRIPTION, enabled: false }),
    });
    console.log(`rule ${existing.id} disabled — webhook traffic reaches the app again`);
    process.exit(0);
}

console.error("usage: on | off | status");
process.exit(1);
