#!/usr/bin/env node
/**
 * Zone analytics: which paths are actually hitting the origin, and with what
 * status.
 *
 * This is the query that resolved the 2026-08-09 container saturation in one
 * shot (see `docs/buzz-adoption-plan.md`, Phase 11) after hours of reasoning
 * from config. The lesson recorded there is the reason this file exists:
 * **an estimate assembled from config is not a measurement.** The per-tab
 * polling estimate was off by three orders of magnitude; one zone query named
 * the real source (`/pipeline`, 2,191 req/min from a scanner).
 *
 * Requires the API token to carry **Zone → Analytics → Read**. Without it the
 * GraphQL API returns an empty `zones` array rather than an error, which reads
 * exactly like "no traffic" — so this script says so explicitly.
 *
 *   node scripts/cf/zone-analytics.mjs                # top paths, last 24h
 *   node scripts/cf/zone-analytics.mjs --hours 3
 *   node scripts/cf/zone-analytics.mjs --path /pipeline
 *   node scripts/cf/zone-analytics.mjs --path /api/webhooks/helius-trades
 *
 * `--path` switches to a status breakdown for that one path, which is what you
 * want for a failing endpoint: a webhook that 500s gets retried by its sender,
 * so the error rate and the request rate are the same conversation.
 *
 * `--by` adds dimensions, and it is the flag that actually solves things:
 *
 *   node scripts/cf/zone-analytics.mjs --path /pipeline --by method,userAgent
 *
 * Status alone said `/pipeline` was answering 200 while every probe of mine
 * answered 404, and no amount of re-probing the URL explained it. One query
 * with `method,userAgent` did: the traffic was POST from an empty user agent,
 * a shape that never renders the page and so never populates the negative
 * cache. **When a measurement disagrees with a probe, the probe is usually a
 * different KIND of request, not a different path** — reach for `--by` early.
 */

/** Friendly names → the GraphQL dimension. Anything else is passed through. */
const DIMENSION_ALIASES = {
    method: "clientRequestHTTPMethodName",
    ua: "userAgent",
    status: "edgeResponseStatus",
    path: "clientRequestPath",
    host: "clientRequestHTTPHost",
    country: "clientCountryName",
    colo: "coloCode",
    scheme: "clientRequestScheme",
};

import { readFileSync } from "node:fs";

const GRAPHQL = "https://api.cloudflare.com/client/v4/graphql";

function loadEnv() {
    // .env.local wins, matching the app's own precedence.
    for (const file of [".env", ".env.local"]) {
        try {
            for (const line of readFileSync(file, "utf8").split("\n")) {
                const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
                if (!m) continue;
                let v = m[2].trim();
                if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
                    v = v.slice(1, -1);
                }
                process.env[m[1]] = v;
            }
        } catch {
            // Missing file is fine — the var may come from the real environment.
        }
    }
}

function arg(name, fallback) {
    const i = process.argv.indexOf(`--${name}`);
    return i === -1 ? fallback : process.argv[i + 1];
}

async function gql(token, query, variables) {
    const res = await fetch(GRAPHQL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (json.errors?.length) {
        console.error("GraphQL errors:");
        for (const e of json.errors) console.error("  -", e.message);
        process.exit(1);
    }
    return json.data;
}

/**
 * Adaptive datasets are SAMPLED. `count` is the number of sampled requests, so
 * the real figure is `count * sampleInterval`. Reporting the raw count
 * understates busy paths by exactly the factor you most want to know about.
 */
function estimate(group) {
    const interval = group.avg?.sampleInterval ?? 1;
    return Math.round(group.count * interval);
}

function rate(total, hours) {
    return (total / (hours * 60)).toFixed(1);
}

async function main() {
    loadEnv();
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!token) {
        console.error("CLOUDFLARE_API_TOKEN is not set (.env, .env.local, or the environment).");
        process.exit(1);
    }

    const hours = Number(arg("hours", "24"));
    const path = arg("path", null);
    const since = new Date(Date.now() - hours * 3600_000).toISOString();

    const zoneTag = await (async () => {
        const explicit = arg("zone", process.env.CLOUDFLARE_ZONE_ID);
        if (explicit) return explicit;
        const res = await fetch("https://api.cloudflare.com/client/v4/zones", {
            headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        const zone = json.result?.[0];
        if (!zone) {
            console.error("No zones visible to this token.");
            process.exit(1);
        }
        return zone.id;
    })();

    // Cloudflare rejects a window "wider than 1d", and it means it: `--hours 24`
    // spans 1d plus the few hundred ms between computing the two bounds, and the
    // query errors out entirely rather than clamping. Pull the end back a minute
    // so the default actually works.
    const until = new Date(Date.now() - 60_000).toISOString();
    const filter = { datetime_geq: since, datetime_leq: until };
    if (path) filter.clientRequestPath = path;

    const extra = (arg("by", "") || "")
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => DIMENSION_ALIASES[d] ?? d);

    const base = path ? ["edgeResponseStatus"] : ["clientRequestPath", "edgeResponseStatus"];
    const dimensionList = [...new Set([...base, ...extra])];
    const dimensions = dimensionList.join(" ");

    const data = await gql(
        token,
        `query ($zoneTag: String!, $filter: ZoneHttpRequestsAdaptiveGroupsFilter_InputObject!) {
            viewer {
                zones(filter: { zoneTag: $zoneTag }) {
                    httpRequestsAdaptiveGroups(
                        filter: $filter
                        limit: 200
                        orderBy: [count_DESC]
                    ) {
                        count
                        avg { sampleInterval }
                        dimensions { ${dimensions} }
                    }
                }
            }
        }`,
        { zoneTag, filter },
    );

    const zones = data?.viewer?.zones ?? [];
    if (!zones.length) {
        console.error(
            "Zone returned no rows.\n" +
            "The usual cause is a token WITHOUT `Zone -> Analytics -> Read`: the API\n" +
            "answers with an empty list rather than a permission error, which is\n" +
            "indistinguishable from 'no traffic'. Check the token's scopes first.",
        );
        process.exit(1);
    }

    const groups = zones[0].httpRequestsAdaptiveGroups ?? [];
    if (!groups.length) {
        console.log(`No requests recorded in the last ${hours}h.`);
        return;
    }

    const total = groups.reduce((n, g) => n + estimate(g), 0);
    console.log(`zone ${zoneTag} · last ${hours}h · ${total.toLocaleString()} requests (${rate(total, hours)}/min)\n`);

    if (path) {
        console.log(`${path}\n`);
        console.log("   status        count      share     rate/min" + (extra.length ? "   " + extra.join("  ") : ""));
        for (const g of groups) {
            const n = estimate(g);
            const tail = extra.map((d) => String(g.dimensions[d] ?? "").trim() || "(empty)").join("  ");
            console.log(
                `   ${String(g.dimensions.edgeResponseStatus).padEnd(6)}` +
                `${n.toLocaleString().padStart(12)}` +
                `${((n / total) * 100).toFixed(1).padStart(9)}%` +
                `${rate(n, hours).padStart(13)}` +
                (tail ? `   ${tail.slice(0, 90)}` : ""),
            );
        }
        return;
    }

    // Collapse status into each path so one line is one endpoint, with the
    // failing share called out — a 30% error rate is the signal, not the volume.
    const byPath = new Map();
    for (const g of groups) {
        const p = g.dimensions.clientRequestPath;
        const status = Number(g.dimensions.edgeResponseStatus);
        const n = estimate(g);
        const row = byPath.get(p) ?? { total: 0, bad: 0, statuses: new Map() };
        row.total += n;
        if (status >= 400) row.bad += n;
        row.statuses.set(status, (row.statuses.get(status) ?? 0) + n);
        byPath.set(p, row);
    }

    const rows = [...byPath.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 25);
    console.log("        count    rate/min   errors   path");
    for (const [p, row] of rows) {
        const errPct = row.total ? (row.bad / row.total) * 100 : 0;
        console.log(
            `${row.total.toLocaleString().padStart(13)}` +
            `${rate(row.total, hours).padStart(11)}` +
            `${(errPct ? errPct.toFixed(1) + "%" : "—").padStart(9)}   ` +
            p,
        );
        if (row.bad) {
            const detail = [...row.statuses.entries()]
                .filter(([s]) => s >= 400)
                .sort((a, b) => b[1] - a[1])
                .map(([s, n]) => `${s}×${n.toLocaleString()}`)
                .join("  ");
            console.log(`${"".padStart(33)}   ${detail}`);
        }
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
