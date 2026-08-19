#!/usr/bin/env node
/**
 * Guard: a hover state is LIGHTER than the resting state.
 *
 * Owner rule (2026-08-18). Hover is feedback that an element is live; a hover
 * that darkens reads as the element receding or going disabled, which is the
 * opposite signal.
 *
 * This is mechanical, and it needs to be, because the class names lie. `bg-*`
 * and `hover:bg-*` on one element REPLACE each other — they do not stack — so
 * both composite over whatever is behind them, and it is those two numbers that
 * decide the direction:
 *
 *     bg-panel2       rgba(26,26,26,.6)      -> 17.6
 *     bg-white/[.05]  rgba(255,255,255,.05)  -> 17.5    <- DARKER
 *     bg-white/[.09]                         -> 27.5
 *
 * `bg-panel2 hover:bg-white/[0.05]` reads like an increase and is a decrease.
 * Twelve of those shipped across the wallet drawer and twelve more across the
 * video player, trending board and marketing header before this existed.
 *
 * FOUR legitimate exceptions are understood rather than allowlisted, because
 * they are the shapes most likely to recur in NEW code. Running this repo-wide
 * the first time returned 104 hits of which 95 were one of these — a guard that
 * cries wolf is a guard somebody deletes, so they are decoded, not listed:
 *
 *   1. The fill inverts. `bg-white/[0.06] text-zinc-300 group-hover:bg-white
 *      group-hover:text-black` — the text darkens BECAUSE the surface went
 *      white, and it has to. When a string's background hover is lighter (or
 *      changes to a brand colour this cannot resolve), its text is not checked.
 *   2. A `dark:` branch exists. The unprefixed pair is then the LIGHT theme,
 *      where "more prominent" means darker. Pairs are skipped when the same
 *      string carries a dark: counterpart.
 *   3. The resting colour is already pure white. There IS no lighter colour, so
 *      the app's primary buttons hover `bg-white -> bg-white/90`. 78 buttons do
 *      this. Inverting them all would make every primary CTA off-white at rest,
 *      which is a redesign, not a fix. Nowhere-lighter-to-go is exempt.
 *   4. Scrims. `bg-black/60 -> hover:bg-black/80`, `bg-transparent ->
 *      group-hover:bg-black/60`. A black overlay over media exists precisely to
 *      darken, and deepening it IS the hover. Black-family pairs are exempt.
 *
 * A NO-OP — a hover identical to its resting value — is always reported,
 * whatever family it belongs to. It is dead code pretending to be feedback.
 *
 * Only the NEUTRAL ramp is resolved (white, black, zinc, neutral) plus the
 * app's own flat fills. Brand colours are skipped: comparing the lightness of
 * lantern against pastelred says nothing useful, and a guard that cries wolf
 * is a guard somebody deletes.
 *
 *   node scripts/guards/check-hover-lighter.mjs
 *   node scripts/guards/check-hover-lighter.mjs --write-allowlist
 */

import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { walk, rel, loadAllowlist, report } from "./lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROOTS = ["components", "app"];
const ALLOWLIST = path.join(root, "scripts/guards/allow-hover-lighter.txt");

/** What the app paints behind everything. --color-canvas, rgb(5,5,5). */
const CANVAS = 5;
const over = (fg, alpha) => fg * alpha + CANVAS * (1 - alpha);

/** Neutral ramps, averaged to one channel — enough to order them. */
const RAMP = {
    zinc:    { 50: 250, 100: 244, 200: 229, 300: 213, 400: 164, 500: 116, 600: 85, 700: 65, 800: 40, 900: 25, 950: 10 },
    neutral: { 50: 250, 100: 245, 200: 229, 300: 212, 400: 163, 500: 115, 600: 82, 700: 64, 800: 38, 900: 23, 950: 10 },
};

/** The app's own flat fills, already composited. */
const FILLS = {
    canvas: 5, panel: over(255, 0.03), panel1: 13, panel2: over(26, 0.6),
    black1: 12, black: 0, transparent: CANVAS, background: 5,
};

/**
 * ANY variant prefix, not an enumerated list. The first draft enumerated them
 * and then mistook `aria-expanded:text-white` and `focus-visible:bg-white/5`
 * for RESTING colours, reporting two files whose real resting values
 * (text-postgray, text-zinc-200) it had skipped. A base utility carries no
 * colon; that is the whole test.
 */
const VARIANT = /:/;

/** Opacity suffix: `/5`, `/[0.05]`, `/[.05]`. */
function alphaOf(suffix) {
    if (suffix === undefined) return 1;
    const bare = suffix.replace(/^\[|\]$/g, "");
    const n = parseFloat(bare);
    if (Number.isNaN(n)) return null;
    return n > 1 ? n / 100 : n;
}

/** Resolve one utility to a grey level over the canvas, or null if unknown. */
function levelOf(token, prop) {
    const bare = token.replace(/^(?:[a-z-]+:)+/, "");
    if (!bare.startsWith(prop + "-")) return null;
    const body = bare.slice(prop.length + 1);
    const [name, suffix] = body.split("/");
    const alpha = alphaOf(suffix);
    if (alpha === null) return null;

    if (name === "white") return over(255, alpha);
    if (name === "black") return over(0, alpha);
    if (prop === "bg" && name in FILLS && suffix === undefined) return FILLS[name];

    const ramp = name.match(/^(zinc|neutral)-(\d+)$/);
    if (ramp) {
        const grey = RAMP[ramp[1]][ramp[2]];
        return grey === undefined ? null : over(grey, alpha);
    }
    return null;
}

const isHover = (t) => /^(?:hover|group-hover):/.test(t);
const isDark = (t) => t.startsWith("dark:");

const files = (await Promise.all(ROOTS.map((r) => walk(path.join(root, r))))).flat()
    .filter((f) => /\.tsx?$/.test(f));

const allow = await loadAllowlist(ALLOWLIST);
const violations = [];

for (const file of files) {
    const relPath = rel(root, file);
    const source = await fs.readFile(file, "utf8");
    const lines = source.split("\n");

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        // A comment describing a hover isn't a hover.
        if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) continue;

        for (const m of line.matchAll(/["'`]([^"'`\n]*)["'`]/g)) {
            const toks = m[1].split(/\s+/).filter(Boolean);
            if (!toks.some(isHover)) continue;

            const hasDark = toks.some(isDark);
            const pair = (prop) => {
                const base = toks.find((t) => !VARIANT.test(t) && levelOf(t, prop) !== null);
                const hov = toks.find((t) => isHover(t) && levelOf(t, prop) !== null);
                if (base === undefined || hov === undefined) return null;
                return { base, hov, b: levelOf(base, prop), h: levelOf(hov, prop) };
            };

            const bg = pair("bg");
            const text = pair("text");
            // Exception 1: the surface inverted, so the ink follows it. An
            // UNRESOLVABLE background hover (hover:bg-lantern and friends)
            // counts too — the fill is changing to something this cannot rank,
            // so the text is not ours to judge.
            const bgHoverUnknown = toks.some(
                (t) => isHover(t) && t.replace(/^(?:[a-z-]+:)+/, "").startsWith("bg-") && levelOf(t, "bg") === null,
            );
            const fillInverted = (bg !== null && bg.h > bg.b) || bgHoverUnknown;

            for (const [prop, p] of [["bg", bg], ["text", text]]) {
                if (p === null) continue;

                const strip = (t) => t.replace(/^(?:[a-z-]+:)+/, "");
                const noop = strip(p.base) === strip(p.hov);

                // A no-op is dead code dressed as feedback — always reported,
                // whichever family it belongs to.
                if (!noop) {
                    if (p.h > p.b) continue;
                    if (prop === "text" && fillInverted) continue;
                    // Exception 2: a dark: branch means this pair is the light theme.
                    if (hasDark) continue;
                    // Exception 3: pure white has nowhere lighter to go.
                    if (p.b >= 250) continue;
                    // Exception 4: a black scrim exists to darken.
                    const family = (t) => {
                        const n = strip(t).slice(prop.length + 1).split("/")[0];
                        return n === "black" || n === "transparent";
                    };
                    if (family(p.base) && family(p.hov)) continue;
                }

                const key = `${relPath}:${p.base}->${p.hov}`;
                if (allow.has(key)) continue;
                violations.push({
                    key,
                    message: `${relPath}:${i + 1}  ${p.base} (${p.b.toFixed(0)}) -> ${p.hov} (${p.h.toFixed(0)})  ${noop ? "no-op" : "darker"}`,
                });
            }
        }
    }
}

await report({
    label: "hover-lighter guard",
    violations,
    allowlistFile: ALLOWLIST,
    argv: process.argv.slice(2),
    hint:
        "A hover must resolve LIGHTER than the resting state. Compare the two\n" +
        "COMPOSITED over the canvas (rgb 5,5,5) — bg-* and hover:bg-* replace each\n" +
        "other rather than stacking, so bg-panel2 (17.6) -> hover:bg-white/[0.05]\n" +
        "(17.5) is a decrease even though it reads as an increase.\n" +
        "If the resting colour is already pure white there is nowhere lighter to go:\n" +
        "INVERT the pair instead — rest at /80-/90 and hover to full white.\n" +
        "A hover equal to its resting colour is a no-op; delete it or make it do\n" +
        "something. Legitimate exceptions (the fill inverts in the same hover, or a\n" +
        "dark: branch makes this the light theme) are detected and never reported,\n" +
        "so a hit here is worth reading rather than allowlisting.",
});
