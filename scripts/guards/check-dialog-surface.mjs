#!/usr/bin/env node
/**
 * Guard: every dialog wears the same surface.
 *
 * `DialogContent` owns the shared surface — `bg-[#0C0C0C]`, the
 * `border-soft-gray/10` hairline, `backdrop-blur-xl`. That is deliberate: the
 * hairline colour is the app's ONE neutral border (globals.css remaps
 * border-soft-gray* to --wp-border), and the background is a fixed near-black
 * because the surface paints itself in both themes.
 *
 * Call sites kept opting out anyway — 35 of 62 of them, with `border-none`
 * (often plus a `ring-1 ring-white/10` standing in for the border it just
 * removed), a hand-picked `border-white/10`, or a slightly-different
 * `bg-[#101011]`. The result was four near-identical dialog surfaces that only
 * differed enough to look like a rendering bug. Nothing else catches it: the
 * classes are valid, tsc has no opinion on Tailwind, and each one looks fine
 * until you open two dialogs in a row.
 *
 * Layout is still the caller's business — max-w, padding, gap, radius, and
 * `overflow-hidden` all pass. Only the surface tokens are refused.
 *
 *   node scripts/guards/check-dialog-surface.mjs
 *   node scripts/guards/check-dialog-surface.mjs --write-allowlist
 */
import path from "node:path";
import { promises as fs } from "node:fs";
import { walk, rel, report, loadAllowlist } from "./lib.mjs";

const ROOT = process.cwd();
const ALLOWLIST = path.join(ROOT, "scripts/guards/allow-dialog-surface.txt");

// Surface tokens the primitive owns. Anything here on a DialogContent is an
// opt-out of the shared look, which is what this guard exists to prevent.
const SURFACE = /^(border-none|border-0|border-white\/\d+|border-soft-gray\/\d+|border-\[[^\]]+\]|bg-\[#[0-9a-fA-F]{3,8}\]|bg-black|bg-canvas|bg-transparent|ring-1|ring-white\/\d+|ring-\[[^\]]+\]|ring-inset)$/;

// The tag routinely spans lines, so match across them rather than per-line.
const TAG = /<DialogContent\b[^>]*?className="([^"]*)"/gs;

// No allowlist file is the good state — every call site was fixed rather than
// grandfathered, so this guard starts with nothing to forgive.
const allow = await loadAllowlist(ALLOWLIST);

const violations = [];
for (const file of await walk(ROOT)) {
    if (!file.endsWith(".tsx")) continue;
    const relPath = rel(ROOT, file);
    if (!relPath.startsWith("components/") && !relPath.startsWith("app/")) continue;

    const content = await fs.readFile(file, "utf8");
    if (!content.includes("<DialogContent")) continue;

    for (const match of content.matchAll(TAG)) {
        const offending = match[1].split(/\s+/).filter((c) => SURFACE.test(c));
        if (offending.length === 0) continue;
        const line = content.slice(0, match.index).split("\n").length;
        const key = `${relPath}:${offending.join(" ")}`;
        if (allow.has(key)) continue;
        violations.push({ key, message: `${relPath}:${line}  ${offending.join(" ")}` });
    }
}

await report({
    label: "dialog-surface guard",
    violations,
    allowlistFile: ALLOWLIST,
    argv: process.argv.slice(2),
    hint:
        "DialogContent already provides the shared surface (bg-[#0C0C0C], the\n" +
        "border-soft-gray/10 hairline, backdrop-blur-xl). Delete these classes — a\n" +
        "`border-none` + `ring-1 ring-white/10` pair is the same hairline drawn a\n" +
        "second, slightly different way, and a `bg-[#101011]` is the same near-black\n" +
        "off by one step. Layout classes (max-w, p-, gap-, rounded-, overflow-) are\n" +
        "fine. If a dialog genuinely needs a different surface, change the primitive\n" +
        "so every dialog moves together.",
});
