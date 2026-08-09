#!/usr/bin/env node
/**
 * Guard: source files stay small enough to review.
 *
 * Buzz caps every source root at 1000 lines, and it is visibly why their
 * composer is 40 small modules instead of one 4,000-line file. A cap is the
 * cheapest possible forcing function for decomposition — nobody argues with a
 * number.
 *
 * A ratchet, not a cleanup mandate: everything already over the line is
 * allowlisted WITH ITS CURRENT SIZE, so an oversized file can be edited freely
 * but cannot grow. Shrink one below its recorded size and re-running with
 * --write-allowlist tightens the ratchet.
 *
 *   node scripts/guards/check-file-sizes.mjs
 *   node scripts/guards/check-file-sizes.mjs --write-allowlist
 */

import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { walk, rel, loadAllowlist, report } from "./lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MAX_LINES = 1000;
const ROOTS = ["components", "hooks", "lib", "server", "app"];
const ALLOWLIST = path.join(root, "scripts/guards/allow-file-sizes.txt");

const files = (await Promise.all(ROOTS.map((r) => walk(path.join(root, r))))).flat()
    .filter((f) => /\.(ts|tsx)$/.test(f))
    // Generated or vendored-by-hand trees are not ours to decompose.
    .filter((f) => !/\/(routeTree\.gen|\.generated)\./.test(f));

const allow = await loadAllowlist(ALLOWLIST);
// Allowlist entries are `path:recordedLines` — the size at adoption.
const recorded = new Map(
    [...allow].map((line) => {
        const idx = line.lastIndexOf(":");
        return [line.slice(0, idx), Number(line.slice(idx + 1))];
    }),
);

const violations = [];
for (const file of files) {
    const relPath = rel(root, file);
    const lines = (await fs.readFile(file, "utf8")).split("\n").length;
    if (lines <= MAX_LINES) continue;

    const cap = recorded.get(relPath);
    if (cap === undefined) {
        violations.push({
            key: `${relPath}:${lines}`,
            message: `${relPath}  ${lines} lines (cap ${MAX_LINES}) — new oversized file`,
        });
    } else if (lines > cap) {
        violations.push({
            key: `${relPath}:${lines}`,
            message: `${relPath}  ${lines} lines — grew past its recorded ${cap}`,
        });
    }
}

await report({
    label: "file-size guard",
    violations,
    allowlistFile: ALLOWLIST,
    argv: process.argv.slice(2),
    hint:
        `Split the file. ${MAX_LINES} lines is the point where a reviewer stops reading\n` +
        "and starts skimming. Extract a hook, a sibling component, or pure helpers —\n" +
        "see components/community/community-chat-item-equality.ts for the shape.\n" +
        "Files already over the line are allowlisted at their current size and may be\n" +
        "edited, just not grown.",
});
