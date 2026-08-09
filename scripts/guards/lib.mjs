import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Shared plumbing for the repo guards.
 *
 * These exist because tsc and `bun test` cannot see the rules that actually
 * matter here — "never render a wallet address", "type lives on one scale",
 * "files stay small enough to review". Each of those has been broken at least
 * once, and each is mechanical enough that a script can hold the line.
 *
 * Every guard is a RATCHET: existing violations go in an allowlist, so the
 * guard blocks new ones without demanding a repo-wide cleanup first. A guard
 * that requires a big-bang fix before it can run is a guard nobody turns on.
 */

const SKIP_DIRS = new Set([
    "node_modules", ".next", ".git", "dist", "build", ".open-next",
    ".wrangler", "coverage", "_legacy", ".turbo", "out",
]);

/** All files under `dir`, skipping build output and vendored trees. */
export async function walk(dir, out = []) {
    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const entry of entries) {
        if (entry.name.startsWith(".") && entry.name !== ".") {
            if (SKIP_DIRS.has(entry.name)) continue;
        }
        if (SKIP_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full, out);
        else out.push(full);
    }
    return out;
}

/** Posix-relative path — allowlist keys must be stable across platforms. */
export function rel(root, file) {
    return path.relative(root, file).split(path.sep).join("/");
}

export async function loadAllowlist(file) {
    try {
        const raw = await fs.readFile(file, "utf8");
        return new Set(
            raw.split("\n").map((l) => l.replace(/#.*$/, "").trim()).filter(Boolean),
        );
    } catch {
        return new Set();
    }
}

/**
 * Print violations and exit non-zero, or exit 0 when clean.
 *
 * `--write-allowlist` regenerates the allowlist from the current state. That is
 * how a guard is adopted on an existing codebase; it is not a way to silence a
 * new violation, and reviewers should treat a diff to an allowlist file as the
 * thing to scrutinise.
 */
export async function report({ label, violations, allowlistFile, hint, argv }) {
    if (argv.includes("--write-allowlist")) {
        const lines = [...new Set(violations.map((v) => v.key))].sort();
        await fs.writeFile(
            allowlistFile,
            `# ${label} — pre-existing violations, generated with --write-allowlist.\n` +
            `# New entries should be rare and explained. Shrink this file, don't grow it.\n` +
            lines.map((l) => l).join("\n") + "\n",
        );
        console.log(`${label}: wrote ${lines.length} entries to ${allowlistFile}`);
        process.exit(0);
    }

    if (violations.length === 0) {
        console.log(`${label}: clean`);
        process.exit(0);
    }

    console.error(`\n${label} failed — ${violations.length} violation(s):\n`);
    for (const v of violations.slice(0, 60)) console.error(`  ${v.message}`);
    if (violations.length > 60) console.error(`  … and ${violations.length - 60} more`);
    console.error(`\n${hint}\n`);
    process.exit(1);
}
