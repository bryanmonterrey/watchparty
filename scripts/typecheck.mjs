// The project's only automated gate, made portable.
//
// The documented invocation was:
//     rm -rf .next/dev/types && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
//
// Both halves are Unix-shell syntax. `rm -rf` doesn't exist in cmd.exe, and the
// `VAR=value command` prefix is a POSIX-ism that PowerShell rejects outright —
// so that line cannot run on Windows. This script does the same two things
// through Node APIs, which behave identically on every OS.
//
// Both halves remain load-bearing (see CLAUDE.md):
//
//   • Stale .next/dev/types left by a previous `next dev` contains SYNTAX
//     errors, and while they're present tsc reports only those and skips
//     semantic checking of real source. That shipped three red deploys on
//     2026-07-22, each invisible locally.
//   • The default heap OOMs mid-run and can exit 0 with a stack trace on
//     stdout, which also looks like a pass.
//
// A real pass is EMPTY OUTPUT. Crash frames (node::Start, dyld) are a failure
// regardless of exit code.

import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();

// Equivalent of `rm -rf .next/dev/types`, minus the shell.
rmSync(join(root, ".next", "dev", "types"), { recursive: true, force: true });

// `npx.cmd` on Windows, `npx` elsewhere — spawnSync doesn't resolve the shim.
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

const result = spawnSync(npx, ["tsc", "--noEmit"], {
    stdio: "inherit",
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=8192" },
    // Windows needs a shell to resolve .cmd shims; POSIX deliberately doesn't
    // get one, so nothing here is re-interpreted by a shell.
    shell: process.platform === "win32",
});

if (result.error) {
    console.error("[typecheck] could not start tsc:", result.error.message);
    process.exit(1);
}

process.exit(result.status ?? 1);
