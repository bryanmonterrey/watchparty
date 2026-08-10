#!/usr/bin/env node
/**
 * Guard: type stays on one named scale.
 *
 * The third guard `lib.mjs` has always named ("type lives on one scale") and
 * the one Phase 4 of `docs/buzz-adoption-plan.md` left unwritten.
 *
 * An arbitrary size — `text-[15px]`, `text-[0.9rem]`, a raw `font-size: 15px`
 * — is invisible in review and permanent in the design. It reads as a
 * deliberate choice and is almost always somebody eyeballing a Figma frame,
 * which is how a codebase ends up with 13px, 13.5px and 14px doing the same
 * job three rows apart. Buzz's rationale is zoom (px freezes against Cmd +/-);
 * ours is consistency. The fix is identical either way: add a named token to
 * the Tailwind theme instead of an arbitrary value.
 *
 * A RATCHET, like the others. Everything already in the tree is allowlisted, so
 * this blocks NEW arbitrary sizes without demanding a repo-wide restyle first.
 *
 *   node scripts/guards/check-text-scale.mjs
 *   node scripts/guards/check-text-scale.mjs --write-allowlist
 */

import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { walk, rel, loadAllowlist, report } from "./lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROOTS = ["components", "hooks", "lib", "server", "app"];
const ALLOWLIST = path.join(root, "scripts/guards/allow-text-scale.txt");

/**
 * Tailwind arbitrary text sizes: `text-[15px]`, `sm:text-[0.9rem]`,
 * `[&_p]:text-[13px]`.
 *
 * Deliberately requires a UNIT. `text-[color]` and `text-[--var]` are arbitrary
 * *colors*, not sizes, and matching those would flag half the app for a rule
 * that has nothing to say about them.
 */
const TW_ARBITRARY_SIZE = /\btext-\[(-?[\d.]+(?:px|rem|em|pt|ch|vw|vh))\]/g;

/**
 * Raw CSS `font-size`, but only with a hardcoded length. `font-size: inherit`,
 * `100%`, and `var(--…)` are all fine — the rule is about magic numbers, not
 * about the property.
 */
const CSS_FONT_SIZE = /font-size:\s*(-?[\d.]+(?:px|rem|em|pt))\b/g;

/**
 * `style={{ fontSize: 15 }}` / `fontSize: "15px"`. Rarer, and the most likely
 * to be legitimately dynamic — so only literals are flagged, never expressions.
 */
const JS_FONT_SIZE = /\bfontSize:\s*["']?(-?[\d.]+(?:px|rem|em|pt)?)["']?/g;

const files = (await Promise.all(ROOTS.map((r) => walk(path.join(root, r))))).flat()
    .filter((f) => /\.(ts|tsx|css)$/.test(f));

const allow = await loadAllowlist(ALLOWLIST);
const violations = [];

for (const file of files) {
    const relPath = rel(root, file);
    const source = await fs.readFile(file, "utf8");
    const lines = source.split("\n");

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // A comment describing a size isn't a size. Most of the hits here are
        // notes explaining why a value was chosen, and flagging those trains
        // people to write worse comments.
        const trimmed = line.trim();
        if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) continue;

        for (const re of [TW_ARBITRARY_SIZE, CSS_FONT_SIZE, JS_FONT_SIZE]) {
            re.lastIndex = 0;
            let m;
            while ((m = re.exec(line)) !== null) {
                // Keyed on path + the literal, NOT the line number: an allowlist
                // keyed on line numbers invalidates itself the moment anyone
                // adds an import, and then everybody just regenerates it.
                const key = `${relPath}:${m[0]}`;
                if (allow.has(key)) continue;
                violations.push({
                    key,
                    message: `${relPath}:${i + 1}  ${m[0].trim()}`,
                });
            }
        }
    }
}

await report({
    label: "text-scale guard",
    violations,
    allowlistFile: ALLOWLIST,
    argv: process.argv.slice(2),
    hint:
        "Use a named size from the Tailwind scale (text-xs … text-2xl) instead of an\n" +
        "arbitrary value. If the design genuinely needs a size the scale doesn't have,\n" +
        "add it to the theme in app/globals.css so it has a name and every other\n" +
        "surface can reach it — that is the whole point, not the ceremony.\n" +
        "Existing values are allowlisted by path + literal and may stay; this only\n" +
        "blocks NEW ones. Regenerate with --write-allowlist only when adopting.",
});
