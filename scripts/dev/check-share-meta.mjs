#!/usr/bin/env bun
// Fetches pages the way a link crawler does and asserts the share tags are
// complete and the image actually serves. This is the gate for share cards —
// tsc cannot see a missing og:image, and neither can a green deploy.
//
//   bun scripts/dev/check-share-meta.mjs                    # prod, default paths
//   bun scripts/dev/check-share-meta.mjs /status/abc /pump  # prod, these paths
//   BASE=http://localhost:3001 bun scripts/dev/check-share-meta.mjs
//
// Exits 1 when any path is missing a tag or its image does not answer
// 200 image/* under 5 MB (X's cap; WhatsApp gets flaky past ~300 KB, which is
// reported as a warning, not a failure).

import { parseShareTags, missingShareTags, CRAWLER_UA } from "../../lib/share/parse-meta.ts";

const BASE = (process.env.BASE ?? "https://watchparty.xyz").replace(/\/$/, "");
const DEFAULT_PATHS = ["/", "/home", "/pump"];
const paths = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_PATHS;

const TIMEOUT_MS = 10_000;
let failed = false;

for (const path of paths) {
    const url = `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
    const line = [];
    try {
        const res = await fetch(url, {
            headers: { "user-agent": CRAWLER_UA, accept: "text/html" },
            redirect: "follow",
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const html = await res.text();
        if (res.status !== 200) {
            line.push(`HTTP ${res.status}`);
            if (/\/login/.test(res.url)) line.push("(redirected to /login — the crawler is being auth-gated)");
            failed = true;
        }
        const tags = parseShareTags(html);
        const missing = missingShareTags(tags);
        if (missing.length) {
            failed = true;
            line.push(`missing: ${missing.join(", ")}`);
        }
        if (tags.image && /^https?:\/\//.test(tags.image)) {
            const img = await fetch(tags.image, {
                headers: { "user-agent": CRAWLER_UA },
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
            const type = img.headers.get("content-type") ?? "";
            const buf = new Uint8Array(await img.arrayBuffer());
            const kb = buf.length / 1024;
            if (img.status !== 200 || !type.startsWith("image/")) {
                failed = true;
                line.push(`image ${img.status} ${type || "(no content-type)"}`);
            } else if (kb > 5 * 1024) {
                failed = true;
                line.push(`image ${kb.toFixed(0)} KB > 5 MB`);
            } else {
                line.push(`image ok ${type} ${kb.toFixed(0)} KB${kb > 300 ? " (warn: >300 KB)" : ""}`);
            }
        }
        console.log(
            `${missing.length || res.status !== 200 ? "FAIL" : "ok  "} ${path}\n` +
            `      title=${JSON.stringify(tags.title)} card=${tags.card} type=${tags.type}\n` +
            `      desc=${JSON.stringify(tags.description?.slice(0, 80))}\n` +
            `      image=${tags.image}\n` +
            (line.length ? `      ${line.join(" · ")}\n` : ""),
        );
    } catch (err) {
        failed = true;
        console.log(`FAIL ${path}\n      ${err instanceof Error ? err.message : String(err)}\n`);
    }
}

process.exit(failed ? 1 : 0);
